import { installServerClock } from './serverClock';
import { isSEBUserAgent } from '@/lib/seb';
export interface PaginatedLeaderboard {
  entries: LeaderboardEntry[];
  hasNextPage: boolean;
}

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { Problem, LeaderboardEntry } from '@/features/contests/problem.types';
import {
  toProblemDetails,
  toProblemOverview,
  type ProblemDetailsResponse,
  type ProblemOverviewResponse,
} from '@/features/contests/problemAdapter';
import { Contest } from "@/models/contest";
import { auth } from '@/lib/firebase';
import { encodeBase64 } from '@/lib/base64';
import { jitterDelay, parseRetryAfterMs, requestTimeout } from '@/lib/requestPolicy';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const TAB_SWITCH_REQUEST_TIMEOUT_MS = 10_000;
const LEADERBOARD_PAGE_SIZE = 20;
const BROWSER_SESSION_TIMEOUT_MS = 15_000;
const browserSessionTimeout = () => new axios.AxiosError('Exam session verification timed out. Please retry.', 'ECONNABORTED');

const waitForAbort = <T,>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(axios.isAxiosError(signal.reason) ? signal.reason : new axios.CanceledError('Request aborted.'));
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
  });
};

interface BrowserSessionStart {
  controller: AbortController;
  consumers: number;
  promise: Promise<BrowserSession>;
}

interface IdentityScopedRequestConfig {
  _expectedUserId?: string;
  _deadline?: number;
  _authenticatedUserId?: string;
  _browserSessionRetried?: boolean;
}

const submissionTimeoutError = () => new axios.AxiosError('Submission request timed out.', 'ECONNABORTED');

const isAbortedError = (error: unknown, signal?: AbortSignal): boolean =>
  Boolean(signal?.aborted) || axios.isCancel(error) || (error instanceof Error && error.name === 'AbortError');

const isUnsupportedStatus = (status?: number): boolean =>
  status === 404 || status === 405 || status === 501;

const extractServerErrorMessage = (data: unknown): string | undefined => {
  if (typeof data === 'object' && data !== null) {
    if ('error' in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === 'string' && err) return err;
    }
    if ('errors' in data) {
      const errs = (data as { errors?: unknown }).errors;
      if (Array.isArray(errs) && errs.length > 0) {
        const first = errs[0];
        if (typeof first === 'string' && first) return first;
        if (typeof first === 'object' && first !== null && 'message' in first && typeof (first as { message?: unknown }).message === 'string') {
          return (first as { message: string }).message;
        }
      }
    }
  }
  return undefined;
};

export const isTabSwitchTerminationSubmissionError = (error: unknown): boolean => {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) {
    return false;
  }
  const message = extractServerErrorMessage(error.response?.data) || error.message || '';
  return /tab[\s_-]*switch/i.test(message) && /terminat/i.test(message);
};

const isValidLeaderboardEntry = (entry: unknown): entry is LeaderboardEntry => {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.user_id === 'string' &&
    typeof e.username === 'string' &&
    typeof e.rank === 'number' &&
    Number.isSafeInteger(e.rank) &&
    e.rank >= 0 &&
    typeof e.total_score === 'number' &&
    Number.isFinite(e.total_score) &&
    typeof e.problems_solved === 'number' &&
    Number.isSafeInteger(e.problems_solved)
  );
};

// TODO(PBR-2): Delete mockJudgingSetting, MOCK_SUBMISSION_JUDGING, MockSubmission,
// mockSubmissions, rememberMockSubmission, and all mock branches when the judge ships.
const MOCK_SUBMISSION_JUDGING =
  import.meta.env.VITE_MOCK_SUBMISSION_JUDGING === 'true' && !import.meta.env.PROD;
type ContestPayload = ConstructorParameters<typeof Contest>[0];

interface MockSubmission {
  statusChecks: number;
  details: SubmissionDetailsResponse;
}

class ContestApiService {
  private axiosInstance: AxiosInstance;
  private mockSubmissions = new Map<string, MockSubmission>();
  private browserSessionStarts = new Map<string, BrowserSessionStart>();
  private browserSessionGenerations = new Map<string, number>();
  // shortcut: unresolved payloads remain for this tab; reconcile saved history before adding eviction.
  private pendingCodeSubmissions = new Map<string, { payload: string; key: string }>();

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    installServerClock(this.axiosInstance);
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        if (config.signal?.aborted) {
          return Promise.reject(new axios.CanceledError('Request aborted before dispatch.'));
        }

        const { _expectedUserId: expectedUserId, _deadline: deadline } = config as IdentityScopedRequestConfig;
        delete (config as IdentityScopedRequestConfig)._expectedUserId;
        delete (config as IdentityScopedRequestConfig)._deadline;
        if (deadline !== undefined && performance.now() >= deadline) throw submissionTimeoutError();

        const user = auth.currentUser;
        (config as IdentityScopedRequestConfig)._authenticatedUserId = user?.uid;
        if (expectedUserId && user?.uid !== expectedUserId) {
          return Promise.reject(new axios.CanceledError('Authenticated account changed before request dispatch.'));
        }

        if (user && config.headers) {
          try {
            const token = await waitForAbort(user.getIdToken(), config.signal as AbortSignal | undefined);
            if (config.signal?.aborted) {
              return Promise.reject(new axios.CanceledError('Request aborted during auth token fetch.'));
            }
            if (expectedUserId && auth.currentUser?.uid !== expectedUserId) {
              return Promise.reject(new axios.CanceledError('Authenticated account changed during auth token fetch.'));
            }
            if (token) {
              config.headers.Authorization = `Bearer ${token}`;
            }
          } catch (error) {
            if (config.signal?.aborted || axios.isCancel(error)) throw error;
            console.error('Error getting auth token:', error);
          }
        }
        if (config.signal?.aborted) throw new axios.CanceledError('Request aborted before dispatch.');
        if (deadline !== undefined) {
          const remaining = deadline - performance.now();
          if (remaining <= 0) throw submissionTimeoutError();
          config.timeout = remaining;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<{ error?: string; code?: string }>) => {
        const config = error.config as (NonNullable<typeof error.config> & IdentityScopedRequestConfig) | undefined;
        const contestId = config?.method === 'get' && /^\/contests\/([^/]+)\/problems(?:\/|$)/.exec(config.url || '')?.[1];
        // An admin reset can invalidate the cookie while navigation rechecks it in the background.
        if (contestId && config && !config._browserSessionRetried && !config.signal?.aborted && config._authenticatedUserId &&
          error.response?.status === 428 && error.response.data?.code === 'BROWSER_SESSION_REQUIRED') {
          const controller = new AbortController();
          const cancel = () => controller.abort();
          config.signal?.addEventListener?.('abort', cancel, { once: true });
          const deadline = performance.now() + BROWSER_SESSION_TIMEOUT_MS;
          const timer = setTimeout(() => controller.abort(browserSessionTimeout()), BROWSER_SESSION_TIMEOUT_MS);
          try {
            await this.startBrowserSession(contestId, config._authenticatedUserId, controller.signal);
            config._browserSessionRetried = true;
            config._expectedUserId = config._authenticatedUserId;
            config._deadline = deadline;
            return await this.axiosInstance.request({ ...config, signal: controller.signal });
          } finally {
            clearTimeout(timer);
            config.signal?.removeEventListener?.('abort', cancel);
          }
        }
        // Surface the server's message (e.g. "user not registered") instead of axios' generic text.
        const serverMessage = error.response?.data?.error;
        if (typeof serverMessage === 'string' && serverMessage) error.message = serverMessage;
        return Promise.reject(error);
      }
    );
  }

  async getContestsList(page: number = 0): Promise<Contest[]> {
    const response = await this.axiosInstance.get<ContestPayload[]>(`/contests/list?page=${page}`);
    return response.data.map(c => new Contest(c));
  }

  startBrowserSession(contestId: string, userId: string, signal?: AbortSignal): Promise<BrowserSession> {
    if (signal?.aborted) return Promise.reject(new axios.CanceledError('Request aborted.'));
    const scope = `${contestId}:${userId}`;
    let operation = this.browserSessionStarts.get(scope);
    if (!operation || operation.controller.signal.aborted) {
      const controller = new AbortController();
      const deadline = performance.now() + BROWSER_SESSION_TIMEOUT_MS;
      const timer = setTimeout(() => controller.abort(browserSessionTimeout()), BROWSER_SESSION_TIMEOUT_MS);
      const detected = isSEBUserAgent(navigator.userAgent);
      const start = async () => {
        const key = `contest_browser_start_${scope}`;
        let attemptId = detected ? localStorage.getItem(key) || crypto.randomUUID() : crypto.randomUUID();
        let generation = this.browserSessionGenerations.get(scope) ?? 0;
        if (detected) localStorage.setItem(key, attemptId);
        for (let attempt = 0; attempt < 4; attempt++) {
          if (controller.signal.aborted) throw controller.signal.reason;
          let state: BrowserSession;
          try {
            const response = await this.axiosInstance.post<BrowserSession>(`/contests/${contestId}/browser-session`,
              { attempt_id: attemptId, generation }, { signal: controller.signal, _deadline: deadline, _expectedUserId: userId } as Record<string, unknown>);
            state = response.data;
          } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 409) {
              const data = error.response.data;
              if (data?.code === 'BROWSER_SESSION_STALE' && Number.isInteger(data.generation) && data.generation > generation) {
                generation = data.generation;
                this.browserSessionGenerations.set(scope, generation);
                attemptId = crypto.randomUUID();
                if (detected) localStorage.setItem(key, attemptId);
                continue;
              }
              if (detected) localStorage.removeItem(key);
            }
            throw error;
          }
          if (!state || typeof state.is_seb !== 'boolean' || !Number.isInteger(state.session_count) || state.session_count < 0 || state.session_count > 3 ||
            state.generation !== generation || typeof state.is_terminated !== 'boolean' || typeof state.cookie_confirmed !== 'boolean' ||
            typeof state.seb_not_detected !== 'boolean' || (state.is_seb && state.cookie_confirmed && state.session_count < 1)) {
            throw new Error('The backend did not confirm the exam session. Please retry.');
          }
          this.browserSessionGenerations.set(scope, state.generation);
          if (!state.is_seb || state.is_terminated || state.cookie_confirmed) {
            if (detected) localStorage.removeItem(key);
            return state;
          }
        }
        throw new Error('The exam session cookie could not be confirmed. Allow cookies for the API and retry.');
      };
      const pending = Promise.resolve().then(() => detected
        ? navigator.locks ? navigator.locks.request(`pb-exam-session:${scope}`, { signal: controller.signal }, start)
          : Promise.reject(new Error('This SEB version does not support exam session coordination. Update SEB and retry.'))
        : start());
      const created: BrowserSessionStart = { controller, consumers: 0, promise: waitForAbort(pending, controller.signal).finally(() => {
        clearTimeout(timer);
        if (this.browserSessionStarts.get(scope) === created) this.browserSessionStarts.delete(scope);
      }) };
      operation = created;
      this.browserSessionStarts.set(scope, operation);
    }
    const shared = operation;
    shared.consumers++;
    return waitForAbort(shared.promise, signal).finally(() => {
      if (--shared.consumers === 0) shared.controller.abort();
    });
  }

  async getContestProblems(contestId: string, signal?: AbortSignal): Promise<Problem[]> {
    const response = await this.axiosInstance.get<ProblemOverviewResponse[]>(`/contests/${contestId}/problems`, { signal });
    return response.data.map((problem) => toProblemOverview(problem, contestId));
  }

  async getProblemById(contestId: string, problemId: string, signal?: AbortSignal): Promise<Problem> {
    const response = await this.axiosInstance.get<ProblemDetailsResponse>(`/contests/${contestId}/problems/${problemId}`, { signal });
    return toProblemDetails(response.data);
  }

  async getContestLeaderboard(contestId: string, page: number = 0): Promise<PaginatedLeaderboard> {
    const response = await this.axiosInstance.get<LeaderboardEntry[]>(
      `/contests/${contestId}/leaderboard?page=${page}`,
      { timeout: 15_000 }
    );

    const rawData = response.data as unknown;
    if (!Array.isArray(rawData) || !rawData.every(isValidLeaderboardEntry)) {
      throw new Error('Invalid leaderboard response format.');
    }

    return {
      entries: rawData,
      // shortcut: full final pages need one extra Next request; use a body cursor if the API adds one.
      hasNextPage: rawData.length >= LEADERBOARD_PAGE_SIZE,
    };
  }

  async endContestSession(contestId: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void> {
    await this.axiosInstance.post(`/contests/${contestId}/end`, undefined, {
      signal: options?.signal,
      timeout: options?.timeoutMs ?? 10_000,
    });
  }

  async getContestById(contestId: string): Promise<Contest | null> {
    try {
      const response = await this.axiosInstance.get<ContestPayload>(`/contests/${contestId}`);
      return new Contest(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async runCodeSolution(
    code: string,
    language: string,
    stdin: string,
    contestId?: string,
  ): Promise<RunCodeResponse> {
    if (MOCK_SUBMISSION_JUDGING) {
      await new Promise((r) => setTimeout(r, 600));
      return {
        status: 'accepted',
        stdout: `Execution successful.\nInput:\n${stdin || '(empty)'}`,
        stderr: '',
        compile_output: '',
        runtime: 18,
        memory: 1024,
      };
    }

    const response = await this.axiosInstance.post<RunCodeResponse>(
      '/submission/run',
      {
        ...(contestId ? { contest_id: contestId } : {}),
        code,
        language,
        stdin,
      },
      { timeout: 20_000 },
    );
    const result = response.data;
    if (
      typeof result !== 'object' || result === null ||
      !['accepted', 'wrong_answer', 'tle', 'failed_to_process', 'rte', 'judge_error'].includes(result.status) ||
      [result.stdout, result.stderr, result.compile_output].some((value) => typeof value !== 'string') ||
      [result.runtime, result.memory].some((value) => (
        typeof value !== 'number' || !Number.isFinite(value) || value < 0
      ))
    ) {
      throw new Error('Code execution returned an invalid response.');
    }
    return result;
  }

  async submitCodeSolution(
    contestId: string,
    problemId: string,
    code: string,
    language: string,
    signal?: AbortSignal
  ): Promise<SubmissionResponse> {
    const encodedCode = encodeBase64(code);
    const payload = {
      contest_id: contestId,
      problem_id: problemId,
      code: encodedCode,
      language,
      type: 'code',
    };
    const user = auth.currentUser;
    if (!user) throw new axios.CanceledError('Sign in before submitting.');
    const serialized = JSON.stringify(payload);
    const scope = JSON.stringify([user.uid, serialized]);
    let pending = this.pendingCodeSubmissions.get(scope);
    if (!pending || pending.payload !== serialized) {
      pending = { payload: serialized, key: crypto.randomUUID() };
      this.pendingCodeSubmissions.set(scope, pending);
    }
    const deadline = performance.now() + 30_000;
    const controller = new AbortController();
    let cancelWait = () => {};
    const stopped = new Promise<undefined>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(undefined), { once: true });
    });
    const cancelDeadline = requestTimeout(() => controller.abort(submissionTimeoutError()), 30_000);
    const cancel = () => controller.abort(new axios.CanceledError('Submission cancelled.'));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      for (let attempt = 0; ; attempt += 1) {
        if (controller.signal.aborted) throw controller.signal.reason;
        if (performance.now() >= deadline) throw submissionTimeoutError();
        if (auth.currentUser?.uid !== user.uid) {
          throw new axios.CanceledError('Authenticated account changed before submission retry.');
        }
        try {
          const response = await Promise.race([this.axiosInstance.post<SubmissionResponse>(
            '/submission/submit',
            payload,
            {
              timeout: Math.max(1, deadline - performance.now()),
              headers: { 'Idempotency-Key': pending.key },
              _expectedUserId: user.uid,
              _deadline: deadline,
              signal: controller.signal,
            } as Record<string, unknown>,
          ), stopped]);
          if (!response || controller.signal.aborted) throw controller.signal.reason;
          if (performance.now() >= deadline) throw submissionTimeoutError();
          if (this.pendingCodeSubmissions.get(scope) === pending) this.pendingCodeSubmissions.delete(scope);
          this.rememberMockSubmission(response.data.submission_id, {
            contestId,
            problemId,
            type: 'code',
            language,
          });
          return response.data;
        } catch (error) {
          if (isAbortedError(error, controller.signal) || !axios.isAxiosError(error) || attempt >= 2) throw error;
          const status = error.response?.status;
          if (status !== undefined && ![429, 500, 502, 503, 504].includes(status)) throw error;
          const delay = jitterDelay(Math.max(500 * 2 ** attempt, parseRetryAfterMs(error.response?.headers) ?? 0));
          if (delay >= deadline - performance.now()) throw error;
          await Promise.race([new Promise<void>((resolve) => { cancelWait = requestTimeout(resolve, delay); }), stopped]);
          if (controller.signal.aborted) throw controller.signal.reason;
          if (performance.now() >= deadline) throw error;
        }
      }
    } finally {
      signal?.removeEventListener('abort', cancel);
      cancelWait();
      cancelDeadline();
      controller.abort();
    }
  }

  async submitMCQAnswer(
    contestId: string,
    problemId: string,
    selectedOption: number
  ): Promise<SubmissionResponse> {
    const response = await this.axiosInstance.post<SubmissionResponse>(
      '/submission/submit',
      {
        contest_id: contestId,
        problem_id: problemId,
        option: [selectedOption],
        type: 'mcq',
      },
      { timeout: 15_000 },
    );
    this.rememberMockSubmission(response.data.submission_id, {
      contestId,
      problemId,
      type: 'mcq',
    });
    return response.data;
  }

  async getSubmissionStatus(submissionId: string): Promise<SubmissionStatusResponse> {
    const mockSubmission = this.mockSubmissions.get(submissionId);
    if (MOCK_SUBMISSION_JUDGING && mockSubmission) {
      mockSubmission.statusChecks += 1;
      const status: SubmissionStatus = mockSubmission.statusChecks <= 2 ? 'pending' : 'accepted';
      mockSubmission.details.status = status;
      return { status };
    }

    const response = await this.axiosInstance.get<SubmissionStatusResponse>(
      `/submission/${submissionId}/status`,
      { timeout: 10_000 },
    );
    return response.data;
  }

  async getSubmissionDetails(submissionId: string): Promise<SubmissionDetailsResponse> {
    const mockSubmission = this.mockSubmissions.get(submissionId);
    if (MOCK_SUBMISSION_JUDGING && mockSubmission) {
      return mockSubmission.details;
    }

    const response = await this.axiosInstance.get<SubmissionDetailsResponse>(
      `/submission/${submissionId}/details`,
      { timeout: 10_000 },
    );
    return response.data;
  }

  async listUserSubmissions(problemId: string, page: number = 0): Promise<SubmissionDetailsResponse[]> {
    const response = await this.axiosInstance.get<{ submissions: SubmissionDetailsResponse[] }>(
      '/submission/list',
      {
        params: { problem_id: problemId, page },
        timeout: 10_000,
      },
    );
    return (response.data.submissions || []).map((submission) => {
      const mockSubmission = this.mockSubmissions.get(submission.id);
      return MOCK_SUBMISSION_JUDGING && mockSubmission
        ? { ...mockSubmission.details, ...submission }
        : submission;
    });
  }

  private rememberMockSubmission(
    submissionId: string,
    submission: {
      contestId: string;
      problemId: string;
      type: SubmissionType;
      language?: string;
    }
  ): void {
    if (!MOCK_SUBMISSION_JUDGING) return;

    const createdAt = Math.floor(Date.now() / 1000);
    const testCaseResults: TestCaseResult[] = submission.type === 'code'
      ? [
          {
            id: `${submissionId}-case-1`,
            submission_id: submissionId,
            test_case_id: '1',
            status: 'pass',
            runtime: 12,
            memory: 1024,
            created_at: createdAt,
          },
          {
            id: `${submissionId}-case-2`,
            submission_id: submissionId,
            test_case_id: '2',
            status: 'pass',
            runtime: 18,
            memory: 1104,
            created_at: createdAt,
          },
        ]
      : [];

    this.mockSubmissions.set(submissionId, {
      statusChecks: 0,
      details: {
        id: submissionId,
        problem_id: submission.problemId,
        contest_id: submission.contestId,
        type: submission.type,
        status: 'pending',
        language: submission.language,
        created_at: createdAt,
        runtime: submission.type === 'code' ? 18 : 0,
        memory: submission.type === 'code' ? 1104 : 0,
        test_case_results: testCaseResults,
      },
    });
  }

  async registerForContest(contestId: string): Promise<void> {
    await this.axiosInstance.post(`/contests/${contestId}/registration`, {
      action: 'register',
    });
  }

  async unregisterFromContest(contestId: string): Promise<void> {
    await this.axiosInstance.post(`/contests/${contestId}/registration`, {
      action: 'unregister',
    });
  }

  async recordTabSwitch(
    contestId: string,
    payload: RecordTabSwitchPayload,
    options?: TabSwitchRequestOptions
  ): Promise<RecordTabSwitchResult> {
    if (options?.signal?.aborted) {
      return { kind: 'error', message: 'Request aborted.', aborted: true };
    }
    if (options?.expectedUserId && auth.currentUser && auth.currentUser.uid !== options.expectedUserId) {
      return { kind: 'error', message: 'Authenticated account changed.', aborted: true };
    }

    try {
      const response = await this.axiosInstance.post<Partial<TabSwitchReportResponse>>(
        `/contests/${contestId}/tab-switch`,
        {
          observation_id: payload.observation_id,
          generation: payload.generation,
          count: payload.count,
        },
        {
          signal: options?.signal,
          timeout: options?.timeoutMs ?? TAB_SWITCH_REQUEST_TIMEOUT_MS,
          _expectedUserId: options?.expectedUserId,
        } as Record<string, unknown>
      );
      const raw = response.data;
      return {
        kind: 'ok',
        data: {
          tab_switch_count: Number(raw?.tab_switch_count ?? 0),
          is_terminated: Boolean(raw?.is_terminated),
          generation: Number(raw?.generation ?? 0),
        },
      };
    } catch (error) {
      if (isAbortedError(error, options?.signal)) {
        return { kind: 'error', message: 'Request aborted.', aborted: true };
      }
      if (axios.isAxiosError(error)) {
        const httpStatus = error.response?.status;
        const data = error.response?.data as Partial<TabSwitchReportResponse> | undefined;
        const message = extractServerErrorMessage(data) || error.message || 'Failed to record tab switch.';

        if (isUnsupportedStatus(httpStatus)) {
          return { kind: 'unsupported', httpStatus: httpStatus!, message };
        }
        if (httpStatus === 401 || httpStatus === 403) {
          return { kind: 'unauthorized', httpStatus, message };
        }
        if (httpStatus === 409 || httpStatus === 412) {
          return {
            kind: 'stale_generation',
            httpStatus,
            message,
            data: data
              ? {
                  tab_switch_count: data.tab_switch_count,
                  is_terminated: data.is_terminated,
                  generation: data.generation,
                }
              : undefined,
          };
        }
        if (httpStatus === 400 || httpStatus === 413 || httpStatus === 422) {
          return { kind: 'invalid', httpStatus, message };
        }
        const retryAfter = httpStatus === 429 ? parseRetryAfterMs(error.response?.headers) : undefined;
        return {
          kind: 'error',
          httpStatus,
          message,
          // Preserve the tab-switch queue's existing bounded wait; its timer is separate from submission polling.
          retryAfterMs: retryAfter === Infinity ? Infinity : Math.min(retryAfter ?? 0, 30_000) || undefined,
        };
      }
      return {
        kind: 'error',
        message: error instanceof Error ? error.message : 'Failed to record tab switch.',
      };
    }
  }

  async getContestSessionStatus(
    contestId: string,
    options?: TabSwitchRequestOptions
  ): Promise<SessionStatusFetchResult> {
    if (options?.signal?.aborted) {
      return { kind: 'error', message: 'Request aborted.', aborted: true };
    }
    if (options?.expectedUserId && auth.currentUser && auth.currentUser.uid !== options.expectedUserId) {
      return { kind: 'error', message: 'Authenticated account changed.', aborted: true };
    }

    try {
      const response = await this.axiosInstance.get<Partial<ContestSessionStatus>>(
        `/contests/${contestId}/session-status`,
        {
          signal: options?.signal,
          timeout: options?.timeoutMs ?? TAB_SWITCH_REQUEST_TIMEOUT_MS,
          _expectedUserId: options?.expectedUserId,
        } as Record<string, unknown>
      );
      const raw = response.data;
      return {
        kind: 'ok',
        status: {
          tab_switch_count: Number(raw?.tab_switch_count ?? 0),
          is_tab_switch_terminated: Boolean(raw?.is_tab_switch_terminated),
          generation: Number(raw?.generation ?? 0),
          is_session_ended: Boolean(raw?.is_session_ended),
          ended_at: typeof raw?.ended_at === 'number' ? raw.ended_at : undefined,
          seb_not_detected: Boolean(raw?.seb_not_detected),
          browser_session_count: Number(raw?.browser_session_count ?? 0),
          browser_session_generation: Number(raw?.browser_session_generation ?? 0),
          is_browser_session_terminated: Boolean(raw?.is_browser_session_terminated),
        },
      };
    } catch (error) {
      if (isAbortedError(error, options?.signal)) {
        return { kind: 'error', message: 'Request aborted.', aborted: true };
      }
      if (axios.isAxiosError(error)) {
        const httpStatus = error.response?.status;
        const message = extractServerErrorMessage(error.response?.data) || error.message || 'Failed to fetch contest session status.';
        if (isUnsupportedStatus(httpStatus)) {
          return { kind: 'unsupported', httpStatus: httpStatus!, message };
        }
        if (httpStatus === 401 || httpStatus === 403) {
          return { kind: 'unauthorized', httpStatus, message };
        }
        return { kind: 'error', httpStatus, message };
      }
      return {
        kind: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch contest session status.',
      };
    }
  }
}

export interface TabSwitchRequestOptions {
  signal?: AbortSignal;
  expectedUserId?: string;
  timeoutMs?: number;
}

export interface BrowserSession {
  is_seb: boolean;
  generation: number;
  session_count: number;
  seb_not_detected: boolean;
  is_terminated: boolean;
  cookie_confirmed: boolean;
}

export interface RecordTabSwitchPayload {
  observation_id: string;
  generation: number;
  count: number;
}

export interface TabSwitchReportResponse {
  tab_switch_count: number;
  is_terminated: boolean;
  generation: number;
}

export interface ContestSessionStatus {
  seb_not_detected?: boolean;
  browser_session_count?: number;
  browser_session_generation?: number;
  is_browser_session_terminated?: boolean;
  tab_switch_count: number;
  is_tab_switch_terminated: boolean;
  generation: number;
  is_session_ended?: boolean;
  ended_at?: number;
}

export type SessionStatusFetchResult =
  | { kind: 'ok'; status: ContestSessionStatus }
  | { kind: 'unsupported'; httpStatus: number; message?: string }
  | { kind: 'unauthorized'; httpStatus: number; message?: string }
  | { kind: 'error'; httpStatus?: number; message: string; aborted?: boolean };

export type RecordTabSwitchResult =
  | { kind: 'ok'; data: TabSwitchReportResponse }
  | { kind: 'stale_generation'; httpStatus: number; data?: Partial<TabSwitchReportResponse>; message?: string }
  | { kind: 'unsupported'; httpStatus: number; message?: string }
  | { kind: 'unauthorized'; httpStatus: number; message?: string }
  | { kind: 'invalid'; httpStatus: number; message?: string }
  | { kind: 'error'; httpStatus?: number; message: string; aborted?: boolean; retryAfterMs?: number };

export interface SubmissionResponse {
  submission_id: string;
}

export interface RunCodeResponse {
  status: string;
  stdout: string;
  stderr: string;
  compile_output: string;
  runtime: number;
  memory: number;
}


export type SubmissionType = 'code' | 'mcq';

export type SubmissionStatus =
  | 'attempted'
  | 'pending'
  | 'processing'
  | 'accepted'
  | 'wrong_answer'
  | 'tle'
  | 'mle'
  | 'rte'
  | 'failed_to_process'
  | 'judge_error'
  | 'completed'
  | 'failed';

export interface SubmissionStatusResponse {
  status: SubmissionStatus;
  score?: number;
  max_score?: number;
  test_cases_passed?: number;
  total_test_cases?: number;
  error_message?: string;
}

export interface SubmissionDetailsResponse {
  id: string;
  user_id?: string;
  problem_id: string;
  contest_id: string;
  type: SubmissionType;
  status?: SubmissionStatus;
  score?: number;
  max_score?: number;
  language?: string;
  option?: number[];
  created_at: number;
  runtime?: number;
  memory?: number;
  test_case_results?: TestCaseResult[];
  code?: string;
  error_message?: string;
}

export interface TestCaseResult {
  id?: string;
  submission_id?: string;
  test_case_id: string;
  status: 'pass' | 'passed' | 'wrong_answer' | 'tle' | 'mle' | 'rte' | 'failed' | 'error';
  runtime?: number;
  memory?: number;
  created_at?: number;
  error_message?: string;
}
export interface ApiError {
  status: number;
  data?: unknown;
  headers?: Record<string, string>;
  message: string;
}

export const contestApi = new ContestApiService();
