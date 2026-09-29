import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { Problem, LeaderboardEntry } from '@/features/contests/problem.types';
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

  async getContestProblems(contestId: string): Promise<Problem[]> {
    const response = await this.axiosInstance.get<Problem[]>(`/admin/contests/${contestId}/problems`);
    return response.data;
  }

  async getProblemById(contestId: string, problemId: string): Promise<Problem> {
    const response = await this.axiosInstance.get<Problem>(`/admin/contests/${contestId}/problems/${problemId}`);
    return response.data;
  }

  async getContestLeaderboard(contestId: string): Promise<LeaderboardEntry[]> {
    const response = await this.axiosInstance.get<LeaderboardEntry[]>(`/admin/contests/${contestId}/leaderboard`);
    return response.data;
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
