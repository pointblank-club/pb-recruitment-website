export type ServerClockStatus = 'unknown' | 'synced' | 'recovering' | 'error';
let status: ServerClockStatus = 'unknown';
let serverTimeMs = NaN;
let receivedAt = 0;
let latestRequestStartedAt = -Infinity;
let generation = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

// Untrusted UTC never falls back to the machine clock for event admission.
export const getServerTime = (): number => status === 'synced' ? serverTimeMs + performance.now() - receivedAt : NaN;
export const getServerClockStatus = (): ServerClockStatus => status;
export const getClockGeneration = (): number => generation;
export const getLastClockSync = (): number => Number.isFinite(serverTimeMs) ? receivedAt : -Infinity;

export const beginClockRecovery = (): void => {
  generation++;
  latestRequestStartedAt = -Infinity;
  status = 'recovering';
  emit();
};

export const failClockRecovery = (): void => {
  if (status === 'synced') return;
  status = 'error';
  emit();
};

export const syncServerClock = (timestamp: unknown, startedAt: number, finishedAt = performance.now(), requestGeneration = generation): boolean => {
  if (typeof timestamp !== 'string' || !/^\d+$/.test(timestamp)) return false;
  const time = Number(timestamp);
  if (!Number.isSafeInteger(time) || time < 1_000_000_000_000 || time > 8_640_000_000_000_000 ||
      !Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt ||
      startedAt <= latestRequestStartedAt || requestGeneration !== generation) return false;

  // The backend samples at commitment; full request duration includes processing, not just network latency.
  serverTimeMs = time;
  receivedAt = finishedAt;
  latestRequestStartedAt = startedAt;
  status = 'synced';
  emit();
  return true;
};

export const subscribeServerClock = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
