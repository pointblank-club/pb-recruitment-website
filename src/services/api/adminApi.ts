import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { Contest } from "@/models/contest";
import { auth } from '@/lib/firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
type ContestPayload = ConstructorParameters<typeof Contest>[0];

export interface ContestRegistration {
  user_id: string;
  name: string;
  email: string;
  registered_at?: number;
}

export type AdminProblemType = 'code' | 'mcq';

export interface AdminProblemSummary {
  id: string;
  name: string;
  score: number;
  type: AdminProblemType;
}

export interface ProblemTestCase {
  input: string;
  expected_output: string;
}

interface ProblemTestCaseResponse {
  index?: number;
  input: string;
  expected_output?: string;
}

export interface AdminProblem extends AdminProblemSummary {
  contest_id: string;
  description: string;
  answer: number[];
  options: string[];
  testcases: ProblemTestCase[];
}

interface AdminProblemResponse {
  id?: string;
  problem_id?: string;
  contest_id?: string;
  name: string;
  description?: string;
  score: number;
  type: AdminProblemType;
  answer?: number[];
  options?: string[];
  testcases?: ProblemTestCaseResponse[];
  test_cases?: ProblemTestCaseResponse[];
}

interface ProblemPayloadBase {
  name: string;
  description: string;
  score: number;
}

export type UpsertProblemPayload =
  | (ProblemPayloadBase & {
      type: 'code';
      testcases: ProblemTestCase[];
    })
  | (ProblemPayloadBase & {
      type: 'mcq';
      answer: number[];
      options: string[];
    });

const normalizeProblemSummary = (
  problem: AdminProblemResponse,
  problemId: string,
): AdminProblemSummary => ({
  id: problem.id ?? problem.problem_id ?? problemId,
  name: problem.name,
  score: problem.score,
  type: problem.type,
});

class AdminApiService {
  private axiosInstance: AxiosInstance;
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

  async checkAdminAccess(): Promise<void> {
    await this.axiosInstance.get('/admin/');
  }

  async getContestsList(page: number = 0): Promise<Contest[]> {
    const response = await this.axiosInstance.get<ContestPayload[]>(`/admin/contests/list?page=${page}`);
    return response.data.map(c => new Contest(c));
  }

  async getContestProblems(contestId: string): Promise<AdminProblemSummary[]> {
    const response = await this.axiosInstance.get<AdminProblemSummary[]>(`/admin/${contestId}/problems`);
    return response.data;
  }

  async getProblemById(contestId: string, problemId: string): Promise<AdminProblem> {
    const response = await this.axiosInstance.get<AdminProblemResponse>(
      `/admin/${contestId}/problem/${problemId}`,
    );
    const problem = response.data;
    const baseProblem = {
      ...normalizeProblemSummary(problem, problemId),
      contest_id: problem.contest_id ?? contestId,
      description: problem.description ?? '',
    };

    if (problem.type === 'code') {
      const testcaseInputs = problem.testcases ?? problem.test_cases;
      if (!testcaseInputs) {
        throw new Error('The backend did not return this problem\'s testcase inputs.');
      }

      const answers = await this.getProblemAnswers(contestId, problemId);
      const testcases = testcaseInputs.map((testcase, position) => {
        if (typeof testcase.input !== 'string') {
          throw new Error('The backend returned an invalid testcase input; editing was stopped.');
        }
        const answer = answers[testcase.index ?? position];
        if (typeof answer !== 'string') {
          throw new Error('The backend returned incomplete testcase answers; editing was stopped.');
        }
        return { input: testcase.input, expected_output: answer };
      });

      return {
        ...baseProblem,
        answer: [],
        options: [],
        testcases,
      };
    }

    if (!problem.options || problem.options.length < 2) {
      throw new Error('This MCQ cannot be edited safely because its options were not returned.');
    }
    if (!problem.answer || problem.answer.length === 0) {
      throw new Error('This MCQ cannot be edited safely because its correct answer was not returned.');
    }
    if (problem.answer.length !== 1) {
      throw new Error('This editor cannot safely modify an MCQ with multiple correct answers.');
    }
    if (!Number.isInteger(problem.answer[0])
      || problem.answer[0] < 0
      || problem.answer[0] >= problem.options.length) {
      throw new Error('This MCQ cannot be edited because its stored answer is invalid.');
    }

    return {
      ...baseProblem,
      answer: problem.answer,
      options: problem.options,
      testcases: [],
    };
  }

  async getProblemAnswers(contestId: string, problemId: string): Promise<string[]> {
    const response = await this.axiosInstance.get<string[]>(
      `/admin/${contestId}/${problemId}/answers`,
    );
    return response.data;
  }

  async createProblem(contestId: string, problem: UpsertProblemPayload): Promise<AdminProblemSummary> {
    const response = await this.axiosInstance.post<AdminProblemResponse>(
      `/admin/${contestId}/problem`,
      problem,
    );
    return normalizeProblemSummary(response.data, response.data.id ?? '');
  }

  async updateProblem(
    contestId: string,
    problemId: string,
    problem: UpsertProblemPayload,
  ): Promise<AdminProblemSummary> {
    const response = await this.axiosInstance.put<AdminProblemResponse>(
      `/admin/${contestId}/problem/${problemId}`,
      problem,
    );
    return normalizeProblemSummary(response.data, problemId);
  }

  async deleteProblem(contestId: string, problemId: string): Promise<void> {
    await this.axiosInstance.delete(`/admin/${contestId}/problem/${problemId}`);
  }

  async getContestRegistrations(contestId: string): Promise<ContestRegistration[]> {
    const response = await this.axiosInstance.get<ContestRegistration[]>(`/admin/contests/${contestId}/registrations`);
    return response.data;
  }

  async getContestById(contestId: string): Promise<Contest | null> {
    try {
      const response = await this.axiosInstance.get<ContestPayload>(`/admin/contest/${contestId}`);
      return new Contest(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async createContest(contest: Contest): Promise<Contest> {
    const response = await this.axiosInstance.post<ContestPayload>('/admin/contest', contest);
    return new Contest(response.data);
  }

  async updateContest(contest: Contest): Promise<Contest> {
    const response = await this.axiosInstance.put<ContestPayload>(`/admin/contest/${contest.id}`, contest);
    return new Contest(response.data);
  }

  async deleteContest(contestId: string): Promise<void> {
    await this.axiosInstance.delete(`/admin/contest/${contestId}`);
  }
}

export const adminApi = new AdminApiService();
