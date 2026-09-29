import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { Problem, LeaderboardEntry } from '@/features/contests/problem.types';
import { Contest } from "@/models/contest";
import { auth } from '@/lib/firebase';
import { encodeBase64 } from '@/lib/base64';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
// TODO(PBR-2): Delete mockJudgingSetting, MOCK_SUBMISSION_JUDGING, MockSubmission,
// mockSubmissions, rememberMockSubmission, and all mock branches when the judge ships.
const mockJudgingSetting = import.meta.env.VITE_MOCK_SUBMISSION_JUDGING;
const MOCK_SUBMISSION_JUDGING = mockJudgingSetting === 'true'
  || (import.meta.env.DEV && mockJudgingSetting !== 'false');
type ContestPayload = ConstructorParameters<typeof Contest>[0];

interface MockSubmission {
  statusChecks: number;
  details: SubmissionDetailsResponse;
}

class ContestApiService {
  private axiosInstance: AxiosInstance;
  private mockSubmissions = new Map<string, MockSubmission>();

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const user = auth.currentUser;
        if (user && config.headers) {
          try {
            const token = await user.getIdToken();
            if (token) {
              config.headers.Authorization = `Bearer ${token}`;
            }

          } catch (error) {
            console.error('Error getting auth token:', error);
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        // Pass through the original error so you can handle specific status codes manually
        return Promise.reject(error);
      }
    );
  }

  async getContestsList(page: number = 0): Promise<Contest[]> {
    const response = await this.axiosInstance.get<ContestPayload[]>(`/contests/list?page=${page}`);
    return response.data.map(c => new Contest(c));
  }

  async getContestProblems(contestId: string): Promise<Problem[]> {
    const response = await this.axiosInstance.get<Problem[]>(`/contests/${contestId}/problems`);
    return response.data;
  }

  async getProblemById(contestId: string, problemId: string): Promise<Problem> {
    const response = await this.axiosInstance.get<Problem>(`/contests/${contestId}/problems/${problemId}`);
    return response.data;
  }

  async getContestLeaderboard(contestId: string): Promise<LeaderboardEntry[]> {
    const response = await this.axiosInstance.get<LeaderboardEntry[]>(`/contests/${contestId}/leaderboard`);
    return response.data;
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

  async submitCodeSolution(
    contestId: string,
    problemId: string,
    code: string,
    language: string
  ): Promise<SubmissionResponse> {
    const encodedCode = encodeBase64(code);
    const response = await this.axiosInstance.post<SubmissionResponse>(
      '/submission/submit',
      {
        contest_id: contestId,
        problem_id: problemId,
        code: encodedCode,
        language,
        type: 'code',
      },
      { timeout: 15_000 },
    );
    this.rememberMockSubmission(response.data.submission_id, {
      contestId,
      problemId,
      type: 'code',
      language,
    });
    return response.data;
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
}

export interface SubmissionResponse {
  submission_id: string;
}

export type SubmissionType = 'code' | 'mcq';

export type SubmissionStatus =
  | 'pending'
  | 'processing'
  | 'accepted'
  | 'wrong_answer'
  | 'tle'
  | 'mle'
  | 'rte'
  | 'failed_to_process'
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
  status: SubmissionStatus;
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
