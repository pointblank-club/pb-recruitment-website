import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { getLastClockSync, syncServerClock } from '@/lib/serverClock';

interface TimedRequest extends InternalAxiosRequestConfig {
  _clockStartedAt?: number;
}

export const installServerClock = (client: AxiosInstance): void => {
  // Axios runs request interceptors in reverse order; install before authentication.
  client.interceptors.request.use(config => {
    (config as TimedRequest)._clockStartedAt = performance.now();
    return config;
  });
  const observe = (response?: AxiosResponse) => {
    const startedAt = (response?.config as TimedRequest | undefined)?._clockStartedAt;
    if (!response || startedAt === undefined) return;
    const headers = response.headers;
    const timestamp = typeof headers.get === 'function' ? headers.get('X-Server-Time-Ms')
      : headers['x-server-time-ms'] ?? headers['X-Server-Time-Ms'];
    syncServerClock(timestamp, startedAt);
  };
  client.interceptors.response.use(response => {
    observe(response);
    return response;
  }, (error: unknown) => {
    if (axios.isAxiosError(error)) observe(error.response);
    return Promise.reject(error);
  });
};

export const startServerClockRefresh = (): (() => void) => {
  const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080', timeout: 5000 });
  installServerClock(client);
  const controller = new AbortController();
  let pending: Promise<void> | undefined;
  const refresh = (force: boolean) => {
    if (pending || document.visibilityState === 'hidden' ||
        (!force && performance.now() - getLastClockSync() < 600_000)) return;
    pending = client.get('/health', { signal: controller.signal }).then(() => {}, () => {}).finally(() => { pending = undefined; });
  };
  const onVisible = () => { if (document.visibilityState === 'visible') refresh(true); };
  const onOnline = () => refresh(true);
  const interval = setInterval(() => refresh(false), 60_000);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    controller.abort();
  };
};
