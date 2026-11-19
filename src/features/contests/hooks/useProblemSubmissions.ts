import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { isPermanentRequestError, jitterDelay, retryAfterDelay } from '@/lib/requestPolicy';
import {
  contestApi,
  type SubmissionDetailsResponse,
  type SubmissionResponse,
  type SubmissionStatus,
  type SubmissionType,
  type RunCodeResponse,
} from '@/services/api/contestApi';

const FIRST_POLL_DELAY_MS = 1000;
const MAX_POLL_DELAY_MS = 5000;
const POLL_TIMEOUT_MS = 60_000;
const HISTORY_PAGE_SIZE = 20;

export type SubmissionPhase =
  | 'idle'
  | 'submitting'
  | 'received'
  | 'polling'
  | 'completed'
  | 'timeout'
  | 'error';

export interface ActiveSubmission {
  id?: string;
  phase: SubmissionPhase;
  status?: SubmissionStatus;
  details?: SubmissionDetailsResponse;
  message?: string;
  detailsFailed?: boolean;
}

interface SubmissionMetadata {
  type: SubmissionType;
  language?: string;
  option?: number[];
}

const wait = (delay: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, delay);
});

const isJudging = (status?: SubmissionStatus) => (
  status === 'pending' || status === 'processing'
);

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.error;
    if (typeof responseMessage === 'string') return responseMessage;
    if (error.message) return error.message;
  }

  return error instanceof Error ? error.message : fallback;
};

const mergeSubmissions = (
  primary: SubmissionDetailsResponse[],
  secondary: SubmissionDetailsResponse[],
) => {
  const byId = new Map(secondary.map((submission) => [submission.id, submission]));
  primary.forEach((submission) => byId.set(submission.id, submission));
  return Array.from(byId.values()).sort((left, right) => right.created_at - left.created_at);
};

export const useProblemSubmissions = (contestId: string, problemId: string, options?: { skip?: boolean }) => {
  const skip = options?.skip ?? false;
  const [activeSubmission, setActiveSubmission] = useState<ActiveSubmission>({ phase: 'idle' });
  const activeSubmissionRef = useRef(activeSubmission);
  activeSubmissionRef.current = activeSubmission;
  const [history, setHistory] = useState<SubmissionDetailsResponse[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const pollTokenRef = useRef(0);
  const historyRequestRef = useRef(0);
  const scopeTokenRef = useRef(0);
  const submissionControllerRef = useRef<AbortController | null>(null);

  const pollSubmission = useCallback(async (summary: SubmissionDetailsResponse) => {
    const pollToken = ++pollTokenRef.current;
    const startedAt = performance.now();
    let delay = FIRST_POLL_DELAY_MS;
    let consecutiveErrors = 0;
    let retryAfter = 0;

    while (performance.now() - startedAt < POLL_TIMEOUT_MS) {
      await wait(Math.min(Math.max(jitterDelay(delay), retryAfter), POLL_TIMEOUT_MS - (performance.now() - startedAt)));
      if (pollToken !== pollTokenRef.current) return;
      if (performance.now() - startedAt >= POLL_TIMEOUT_MS) break;
      retryAfter = 0;

      try {
        const statusResponse = await contestApi.getSubmissionStatus(summary.id);
        if (pollToken !== pollTokenRef.current) return;

        consecutiveErrors = 0;
        const status = statusResponse.status;

        setActiveSubmission((current) => current.id === summary.id
          ? {
              ...current,
              phase: isJudging(status) ? 'polling' : 'completed',
              status,
              message: isJudging(status) ? 'Judging your submission…' : undefined,
              details: current.details ? { ...current.details, status } : summary,
            }
          : current);
        setHistory((current) => current.map((submission) => (
          submission.id === summary.id ? { ...submission, status } : submission
        )));

        if (!isJudging(status)) {
          let details: SubmissionDetailsResponse = {
            ...summary,
            status,
          };
          let detailsMessage: string | undefined;
          let detailsFailed = false;

          try {
            const response = await contestApi.getSubmissionDetails(summary.id);
            details = {
              ...response,
              id: response.id || summary.id,
              status,
              option: response.option && response.option.length > 0 ? response.option : summary.option,
              score: response.score,
              max_score: response.max_score,
              test_cases_passed: response.test_cases_passed,
              total_test_cases: response.total_test_cases,
            };
          } catch (error) {
            detailsFailed = true;
            detailsMessage = `Verdict received, but result details could not be loaded: ${getErrorMessage(
              error,
              'unknown error',
            )}`;
          }

          if (pollToken !== pollTokenRef.current) return;
          setActiveSubmission({
            id: summary.id,
            phase: 'completed',
            status,
            details,
            message: detailsMessage || statusResponse.error_message || details.error_message,
            detailsFailed,
          });
          setHistory((current) => mergeSubmissions([details], current));
          return;
        }
      } catch (error) {
        if (pollToken !== pollTokenRef.current) return;
        consecutiveErrors += 1;

        if (consecutiveErrors >= 3 || isPermanentRequestError(error)) {
          setActiveSubmission((current) => current.id === summary.id
            ? {
                ...current,
                phase: 'error',
                message: `We could not check this submission's verdict: ${getErrorMessage(
                  error,
                  'status check failed',
                )}`,
              }
            : current);
          return;
        }

        setActiveSubmission((current) => current.id === summary.id
          ? { ...current, message: 'Verdict check failed. Retrying…' }
          : current);
        retryAfter = retryAfterDelay(error);
      }

      delay = Math.min(Math.round(delay * 1.6), MAX_POLL_DELAY_MS);
    }

    if (pollToken !== pollTokenRef.current) return;
    setActiveSubmission((current) => current.id === summary.id
      ? {
          ...current,
          phase: 'timeout',
          message: 'Judging is taking longer than expected. Your submission was saved; you can check again.',
        }
      : current);
  }, []);

  const refreshHistory = useCallback(async () => {
    if (!problemId) return;

    const requestId = ++historyRequestRef.current;
    const scopeToken = scopeTokenRef.current;
    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const submissions = await contestApi.listUserSubmissions(problemId, 0);
      if (requestId !== historyRequestRef.current || scopeToken !== scopeTokenRef.current) return;
      setHistory(submissions);
      setHistoryPage(0);
      setHasMoreHistory(submissions.length === HISTORY_PAGE_SIZE);

      if (submissions.length > 0 && activeSubmissionRef.current.phase === 'idle') {
        const latest = submissions[0];
        if (isJudging(latest.status)) {
          setActiveSubmission({
            id: latest.id,
            phase: 'polling',
            status: latest.status,
            details: latest,
            message: 'Judging in progress…',
          });
          void pollSubmission(latest);
        } else {
          setActiveSubmission({
            id: latest.id,
            phase: 'completed',
            status: latest.status,
            details: latest,
          });

          try {
            const details = await contestApi.getSubmissionDetails(latest.id);
            if (scopeToken !== scopeTokenRef.current) return;
            setActiveSubmission((current) => (
              current.id === latest.id && current.phase === 'completed'
                ? { ...current, details, detailsFailed: false }
                : current
            ));
          } catch {
            // Keep summary details if detailed fetch fails
          }
        }
      } else if (activeSubmissionRef.current.id) {
        const currentActiveId = activeSubmissionRef.current.id;
        const matchingRefreshed = submissions.find((sub) => sub.id === currentActiveId);
        if (matchingRefreshed) {
          setActiveSubmission((current) => {
            if (current.id !== currentActiveId) return current;
            const currentDetails = current.details;
            const shouldReconcile =
              current.detailsFailed ||
              !currentDetails ||
              (currentDetails.score === undefined && matchingRefreshed.score !== undefined);

            if (shouldReconcile) {
              return {
                ...current,
                status: matchingRefreshed.status || current.status,
                details: {
                  ...currentDetails,
                  ...matchingRefreshed,
                  score: matchingRefreshed.score ?? currentDetails?.score,
                  max_score: matchingRefreshed.max_score ?? currentDetails?.max_score,
                },
                detailsFailed: false,
                message: current.detailsFailed ? undefined : current.message,
              };
            }
            return current;
          });
        }
      }

      return submissions;
    } catch (error) {
      if (requestId !== historyRequestRef.current) return;
      setHistoryError(getErrorMessage(error, 'Could not load submission history.'));
    } finally {
      if (requestId === historyRequestRef.current) setIsHistoryLoading(false);
    }
  }, [pollSubmission, problemId]);

  useEffect(() => {
    pollTokenRef.current += 1;
    scopeTokenRef.current += 1;
    setActiveSubmission({ phase: 'idle' });
    setHistory([]);
    setHistoryPage(0);
    setHasMoreHistory(false);
    setHistoryError(null);
    setIsHistoryLoading(false);

    if (!skip) void refreshHistory();

    return () => {
      pollTokenRef.current += 1;
      historyRequestRef.current += 1;
      scopeTokenRef.current += 1;
      submissionControllerRef.current?.abort();
    };
  }, [contestId, problemId, refreshHistory, skip]);

  const loadMoreHistory = useCallback(async () => {
    if (!problemId || isHistoryLoading || !hasMoreHistory) return;

    const nextPage = historyPage + 1;
    const requestId = ++historyRequestRef.current;
    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const submissions = await contestApi.listUserSubmissions(problemId, nextPage);
      if (requestId !== historyRequestRef.current) return;
      setHistory((current) => mergeSubmissions(current, submissions));
      setHistoryPage(nextPage);
      setHasMoreHistory(submissions.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      if (requestId !== historyRequestRef.current) return;
      setHistoryError(getErrorMessage(error, 'Could not load more submissions.'));
    } finally {
      if (requestId === historyRequestRef.current) setIsHistoryLoading(false);
    }
  }, [hasMoreHistory, historyPage, isHistoryLoading, problemId]);

  const submit = useCallback(async (
    createSubmission: (signal: AbortSignal) => Promise<SubmissionResponse>,
    metadata: SubmissionMetadata,
  ) => {
    const scopeToken = ++scopeTokenRef.current;
    submissionControllerRef.current?.abort();
    const controller = new AbortController();
    submissionControllerRef.current = controller;
    pollTokenRef.current += 1;
    setActiveSubmission({
      phase: 'submitting',
      status: 'pending',
      message: 'Sending your submission…',
    });

    try {
      const response = await createSubmission(controller.signal);
      if (scopeToken !== scopeTokenRef.current) return;

      const summary: SubmissionDetailsResponse = {
        id: response.submission_id,
        contest_id: contestId,
        problem_id: problemId,
        type: metadata.type,
        language: metadata.language,
        option: metadata.option,
        ...(metadata.type === 'code' ? { status: 'pending' as const } : {}),
        created_at: Math.floor(Date.now() / 1000),
      };

      setActiveSubmission({
        id: response.submission_id,
        phase: metadata.type === 'mcq' ? 'completed' : 'received',
        status: metadata.type === 'mcq' ? undefined : 'pending',
        details: summary,
        message: metadata.type === 'mcq' ? undefined : 'Submission received. Waiting for the judge…',
      });
      setHistory((current) => mergeSubmissions([summary], current));
      if (metadata.type !== 'mcq') void pollSubmission(summary);
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;

      setActiveSubmission({
        phase: 'error',
        message: `Submission failed: ${getErrorMessage(error, 'Please try again.')}`,
      });
      throw error;
    } finally {
      if (submissionControllerRef.current === controller) submissionControllerRef.current = null;
    }
  }, [contestId, pollSubmission, problemId]);

  const submitCode = useCallback((code: string, language: string) => (
    submit(
      (signal) => contestApi.submitCodeSolution(contestId, problemId, code, language, signal),
      { type: 'code', language },
    )
  ), [contestId, problemId, submit]);

  const runCode = useCallback((code: string, language: string, stdin: string): Promise<RunCodeResponse> => (
    contestApi.runCodeSolution(code, language, stdin, contestId)
  ), [contestId]);

  const submitMCQ = useCallback((selectedOption: number) => (
    submit(
      () => contestApi.submitMCQAnswer(contestId, problemId, selectedOption),
      { type: 'mcq', option: [selectedOption] },
    )
  ), [contestId, problemId, submit]);

  const retryDetails = useCallback(async () => {
    const submissionId = activeSubmissionRef.current.id;
    if (!submissionId) return;

    setActiveSubmission((current) => ({
      ...current,
      message: 'Loading result details…',
    }));

    try {
      const response = await contestApi.getSubmissionDetails(submissionId);
      setActiveSubmission((current) => {
        if (current.id !== submissionId) return current;
        const details: SubmissionDetailsResponse = {
          ...current.details,
          ...response,
          id: response.id || submissionId,
          status: current.status || response.status,
          score: response.score,
          max_score: response.max_score,
          test_cases_passed: response.test_cases_passed,
          total_test_cases: response.total_test_cases,
        };
        return {
          ...current,
          details,
          detailsFailed: false,
          message: undefined,
        };
      });
      setHistory((current) => current.map((sub) => (
        sub.id === submissionId ? { ...sub, ...response } : sub
      )));
    } catch (error) {
      setActiveSubmission((current) => (
        current.id === submissionId
          ? {
              ...current,
              detailsFailed: true,
              message: `Verdict received, but result details could not be loaded: ${getErrorMessage(
                error,
                'unknown error',
              )}`,
            }
          : current
      ));
    }
  }, []);

  const retryPolling = useCallback(() => {
    const current = activeSubmissionRef.current;
    if (!current.id) return;
    if (current.phase === 'completed' && current.detailsFailed) {
      void retryDetails();
      return;
    }
    if (!current.details) return;
    setActiveSubmission((curr) => ({
      ...curr,
      phase: 'received',
      message: 'Checking the judge again…',
    }));
    void pollSubmission(current.details);
  }, [pollSubmission, retryDetails]);

  const displayedHistory = useMemo(() => {
    if (!activeSubmission.id || !activeSubmission.details) return history;

    const activeDetails = {
      ...activeSubmission.details,
      status: activeSubmission.status || activeSubmission.details.status,
    };
    return mergeSubmissions([activeDetails], history);
  }, [activeSubmission.details, activeSubmission.id, activeSubmission.status, history]);

  return {
    activeSubmission,
    history: displayedHistory,
    historyError,
    isHistoryLoading,
    hasMoreHistory,
    submitCode,
    runCode,
    submitMCQ,
    retryPolling,
    refreshHistory,
    loadMoreHistory,
  };
};
