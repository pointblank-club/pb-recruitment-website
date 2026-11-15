let serverTimeMs = NaN;
let receivedAt = 0;
let latestRequestStartedAt = -Infinity;
const readyListeners = new Set<() => void>();

// NaN keeps time comparisons closed until a backend response establishes UTC.
export const getServerTime = (): number => serverTimeMs + performance.now() - receivedAt;
export const getLastClockSync = (): number => Number.isFinite(serverTimeMs) ? receivedAt : -Infinity;

export const syncServerClock = (timestamp: unknown, startedAt: number, finishedAt = performance.now()): boolean => {
  if (typeof timestamp !== 'string' || !/^\d+$/.test(timestamp)) return false;
  const time = Number(timestamp);
  const roundTrip = finishedAt - startedAt;
  const wasUnknown = !Number.isFinite(serverTimeMs);
  if (!Number.isSafeInteger(time) || time < 1_000_000_000_000 || time > 8_640_000_000_000_000 ||
      !Number.isFinite(roundTrip) || roundTrip < 0 || (roundTrip > 2000 && !wasUnknown) || startedAt <= latestRequestStartedAt) return false;

  // shortcut: RTT includes server processing; skip slow refinements and add server timing if tighter precision is needed.
  // A slow first response still supplies UTC; omit its uncertain latency correction.
  serverTimeMs = time + (roundTrip <= 2000 ? roundTrip / 2 : 0);
  receivedAt = finishedAt;
  latestRequestStartedAt = startedAt;
  if (wasUnknown) readyListeners.forEach(listener => listener());
  return true;
};

export const subscribeClockReady = (listener: () => void): (() => void) => {
  readyListeners.add(listener);
  return () => { readyListeners.delete(listener); };
};
