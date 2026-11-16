import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { beginClockRecovery, failClockRecovery, getClockGeneration, getLastClockSync, getServerClockStatus, syncServerClock } from '@/lib/serverClock';
import { jitterDelay, requestTimeout } from '@/lib/requestPolicy';

interface TimedRequest extends InternalAxiosRequestConfig {
  _clockStartedAt?: number;
  _clockGeneration?: number;
}

let retryRefresh: (() => void) | undefined;
export const retryServerClock = (): void => retryRefresh?.();

export const installServerClock = (client: AxiosInstance): void => {
  // Axios runs request interceptors in reverse order; install before authentication.
  client.interceptors.request.use(config => {
    const request = config as TimedRequest;
    request._clockStartedAt = performance.now();
    request._clockGeneration = getClockGeneration();
    return config;
  });
  const observe = (response?: AxiosResponse) => {
    const request = response?.config as TimedRequest | undefined;
    if (!response || request?._clockStartedAt === undefined) return;
    const headers = response.headers;
    const timestamp = typeof headers.get === 'function' ? headers.get('X-Server-Time-Ms')
      : headers['x-server-time-ms'] ?? headers['X-Server-Time-Ms'];
    syncServerClock(timestamp, request._clockStartedAt, performance.now(), request._clockGeneration);
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
  let controller: AbortController | undefined;
  let pending: Promise<void> | undefined;
  let cancelScheduled: (() => void) | undefined;
  let disposed = false;
  let wasHidden = document.visibilityState === 'hidden';
  let wasBlurred = false;

  const schedule = () => {
    cancelScheduled?.();
    const delay = getServerClockStatus() === 'synced'
      ? Math.max(60_000, 600_000 - (performance.now() - getLastClockSync())) : 60_000;
    cancelScheduled = requestTimeout(() => refresh(), jitterDelay(delay));
  };
  const wait = (delay: number, signal: AbortSignal) => new Promise<void>(resolve => {
    let cancel = () => {};
    const finish = () => { cancel(); signal.removeEventListener('abort', finish); resolve(); };
    cancel = requestTimeout(finish, delay);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
  const refresh = () => {
    if (disposed || pending || document.visibilityState === 'hidden') return;
    if (getServerClockStatus() === 'synced' && performance.now() - getLastClockSync() < 600_000) {
      schedule();
      return;
    }
    if (getServerClockStatus() !== 'synced' && getServerClockStatus() !== 'recovering') beginClockRecovery();
    cancelScheduled?.();
    const startedAt = performance.now();
    const attempt = new AbortController();
    controller = attempt;
    pending = (async () => {
      let syncError: unknown;
      for (let i = 0; i < 3; i++) {
        if (i) await wait(jitterDelay(1000 * 2 ** (i - 1)), attempt.signal);
        if (disposed || attempt.signal.aborted || document.visibilityState === 'hidden') return;
        try {
          await client.get('/health', { signal: attempt.signal });
          syncError = undefined;
        } catch (error) {
          syncError = error;
        }
        if (disposed || attempt.signal.aborted) return;
        if (getServerClockStatus() === 'synced' && getLastClockSync() >= startedAt) return;
      }
      console.error('[ClockSync] Unable to synchronize server time; retrying in the background.', {
        code: axios.isAxiosError(syncError) ? syncError.code : undefined,
        status: axios.isAxiosError(syncError) ? syncError.response?.status : undefined,
        message: axios.isAxiosError(syncError) || syncError instanceof Error ? syncError.message : 'No usable X-Server-Time-Ms sample was received from the API.',
      });
      failClockRecovery();
    })().finally(() => {
      pending = undefined;
      if (!disposed && document.visibilityState !== 'hidden') schedule();
    });
  };
  const recover = () => {
    if (disposed || document.visibilityState === 'hidden') return;
    beginClockRecovery();
    controller?.abort();
    if (pending) void pending.then(refresh);
    else refresh();
  };
  const onVisible = () => {
    if (document.visibilityState === 'hidden') {
      wasHidden = true;
      controller?.abort();
    } else if (wasHidden) {
      wasHidden = false;
      wasBlurred = false;
      recover();
    }
  };
  const onBlur = () => { wasBlurred = true; };
  const onFocus = () => {
    if (wasBlurred && document.visibilityState !== 'hidden') {
      wasBlurred = false;
      recover();
    }
  };
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) recover(); };
  retryRefresh = recover;
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', refresh);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pageshow', onPageShow);
  refresh();
  return () => {
    disposed = true;
    cancelScheduled?.();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', refresh);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pageshow', onPageShow);
    if (retryRefresh === recover) retryRefresh = undefined;
    controller?.abort();
  };
};
