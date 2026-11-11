import axios from 'axios';

export const jitterDelay = (delay: number) => Math.round(delay * (1 + Math.random() * 0.2));

// Browser timers overflow after about 25 days; split long Retry-After waits into safe chunks.
export const requestTimeout = (callback: () => void, delay: number): (() => void) => {
  const deadline = Date.now() + delay;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => {
      if (Date.now() < deadline) schedule();
      else callback();
    }, Math.min(Math.max(0, deadline - Date.now()), 2_147_483_647));
  };
  schedule();
  return () => clearTimeout(timer);
};

export const isPermanentRequestError = (error: unknown) => {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

export const retryAfterDelay = (error: unknown): number => {
  if (!axios.isAxiosError(error)) return 0;
  const status = error.response?.status;
  if (status !== 429 && status !== 503) return 0;
  const value = error.response?.headers?.['retry-after'];
  if (typeof value !== 'string') return status === 429 ? 1000 : 0;
  const delay = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 1000;
};
