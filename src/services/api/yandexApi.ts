import { installServerClock } from './serverClock';
import axios, { type AxiosInstance } from 'axios';
import { auth } from '@/lib/firebase';
import {
  DISABLED_YANDEX_CONNECTION,
  isSafeContestId,
  toYandexConnection,
  type YandexConnection,
} from '@/lib/yandexConnect';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export interface CompletedYandexConnection {
  connection: YandexConnection;
  contestId?: string;
}

/** The stable `code` the server sends with Yandex errors, e.g. yandex_account_taken. */
export const yandexErrorCode = (error: unknown): string | undefined => {
  if (!axios.isAxiosError(error)) return undefined;
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
};

export const yandexErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { error?: unknown } | undefined)?.error;
    if (typeof message === 'string' && message) return message;
    if (error.response?.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
    if (!error.response) return 'Could not reach the server. Check your connection and try again.';
  }
  return fallback;
};

class YandexApiService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    installServerClock(this.axiosInstance);
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
  }

  /** A server without the endpoint (older deployment) reads as "not enabled". */
  async getConnection(signal?: AbortSignal): Promise<YandexConnection> {
    try {
      const response = await this.axiosInstance.get('/yandex/connection', { signal, timeout: 10_000 });
      return toYandexConnection(response.data);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404 || status === 405 || status === 501) return DISABLED_YANDEX_CONNECTION;
      throw error;
    }
  }

  /** Returns the Yandex page to send the candidate to. Consent is the ticked agreement. */
  async startConnection(consent: boolean, contestId?: string): Promise<string> {
    const response = await this.axiosInstance.post(
      '/yandex/connection/start',
      { consent, contest_id: isSafeContestId(contestId) ? contestId : '' },
      { timeout: 15_000 },
    );
    const target = (response.data as { authorize_url?: unknown } | undefined)?.authorize_url;
    let url: URL | undefined;
    try {
      url = typeof target === 'string' ? new URL(target) : undefined;
    } catch {
      url = undefined;
    }
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      throw new Error('Yandex sign-in is unavailable right now. Please try again.');
    }
    return url.toString();
  }

  async completeConnection(code: string, state: string): Promise<CompletedYandexConnection> {
    const response = await this.axiosInstance.post(
      '/yandex/connection/complete',
      { code, state },
      { timeout: 30_000 },
    );
    const contestId = (response.data as { contest_id?: unknown } | undefined)?.contest_id;
    return {
      connection: toYandexConnection(response.data),
      contestId: isSafeContestId(contestId) ? contestId : undefined,
    };
  }
}

export const yandexApi = new YandexApiService();
