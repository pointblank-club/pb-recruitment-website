import axios from 'axios';

export const jitterDelay = (delay: number) => Math.round(delay * (1 + Math.random() * 0.2));

// Browser timers overflow after about 25 days; split long Retry-After waits into safe chunks.
export const requestTimeout = (callback: () => void, delay: number): (() => void) => {
  const deadline = performance.now() + delay;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => {
      if (performance.now() < deadline) schedule();
      else callback();
    }, Math.min(Math.max(0, deadline - performance.now()), 2_147_483_647));
  };
  schedule();
  return () => clearTimeout(timer);
};

export const isPermanentRequestError = (error: unknown) => {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

export const parseRetryAfterMs = (headers: unknown): number | undefined => {
  if (typeof headers !== 'object' || headers === null) return undefined;
  const values = headers as Record<string, unknown>;
  const value = values['retry-after'] ?? values['Retry-After'];
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  const delay = /^\d+$/.test(text) ? Number(text) * 1000
    : /^[A-Za-z]{3,9}(?:,| )/.test(text) ? Date.parse(text) - Date.now() : NaN;
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
};

export const retryAfterDelay = (error: unknown): number => {
  if (!axios.isAxiosError(error)) return 0;
  const status = error.response?.status;
  if (status !== 429 && status !== 503) return 0;
  const headers = error.response?.headers;
  return parseRetryAfterMs(headers) ?? (status === 429 || headers?.['retry-after'] !== undefined ? 1000 : 0);
};
