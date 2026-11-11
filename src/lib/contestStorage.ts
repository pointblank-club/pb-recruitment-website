export const getContestSubmitted = (contestId: string, userId: string): boolean => {
  try {
    return localStorage.getItem(`contest_submitted_${contestId}_${userId}`) === 'true';
  } catch {
    return false;
  }
};

export const setContestSubmitted = (contestId: string, userId: string): void => {
  try {
    localStorage.setItem(`contest_submitted_${contestId}_${userId}`, 'true');
  } catch {
    // Ignore storage failure (e.g. disabled storage or private browsing)
  }
};

export const clearContestSubmitted = (contestId: string, userId: string): void => {
  try {
    localStorage.removeItem(`contest_submitted_${contestId}_${userId}`);
  } catch {
    // Ignore storage failure
  }
};

export const getProblemAttempted = (contestId: string, userId: string, problemId: string): boolean => {
  try {
    return localStorage.getItem(`contest_run_${contestId}_${userId}_${problemId}`) === 'true';
  } catch {
    return false;
  }
};

export const setProblemAttempted = (contestId: string, userId: string, problemId: string): void => {
  try {
    localStorage.setItem(`contest_run_${contestId}_${userId}_${problemId}`, 'true');
  } catch {
    // Run still works when browser storage is unavailable.
  }
};

export const getContestRegistered = (contestId: string, userId: string): boolean => {
  try {
    return localStorage.getItem(`contest_registered_${contestId}_${userId}`) === 'true';
  } catch {
    return false;
  }
};

export const setContestRegistered = (contestId: string, userId: string): void => {
  try {
    localStorage.setItem(`contest_registered_${contestId}_${userId}`, 'true');
  } catch {
    // Ignore storage failure (e.g. disabled storage or private browsing)
  }
};

export const removeContestRegistered = (contestId: string, userId: string): void => {
  try {
    localStorage.removeItem(`contest_registered_${contestId}_${userId}`);
  } catch {
    // Ignore storage failure
  }
};

export const MAX_TAB_SWITCHES = 5;

export interface PendingTabSwitchEvent {
  observation_id: string;
  generation: number;
  created_at: number;
}

export interface LocalTabSwitchState {
  serverCount: number;
  isTerminated: boolean;
  resetGeneration: number;
  pendingEvents: PendingTabSwitchEvent[];
  hasServerSnapshot: boolean;
  updatedAt: number;
}

export const createEmptyTabSwitchState = (): LocalTabSwitchState => ({
  serverCount: 0,
  isTerminated: false,
  resetGeneration: 0,
  pendingEvents: [],
  hasServerSnapshot: false,
  updatedAt: 0,
});

export const getTabSwitchStateKey = (contestId: string, userId: string): string =>
  `contest_tab_state_${contestId}_${userId}`;

const toNonNegInt = (value: unknown, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
};

export const normalizeTabSwitchState = (raw: unknown): LocalTabSwitchState => {
  if (typeof raw !== 'object' || raw === null) {
    return createEmptyTabSwitchState();
  }
  const obj = raw as Record<string, unknown>;
  const resetGeneration = toNonNegInt(obj.resetGeneration, 0);
  const serverCount = Math.min(MAX_TAB_SWITCHES, toNonNegInt(obj.serverCount, 0));
  const isTerminated = Boolean(obj.isTerminated);
  const hasServerSnapshot = Boolean(obj.hasServerSnapshot);
  const updatedAt = toNonNegInt(obj.updatedAt, 0);

  const seenIds = new Set<string>();
  const pendingEvents: PendingTabSwitchEvent[] = [];
  if (Array.isArray(obj.pendingEvents) && !isTerminated) {
    for (const item of obj.pendingEvents) {
      if (typeof item !== 'object' || item === null) continue;
      const evt = item as Record<string, unknown>;
      const rawId = evt.observation_id ?? evt.event_id;
      if (typeof rawId !== 'string' || rawId.length === 0) continue;
      const evtGen = toNonNegInt(evt.generation ?? evt.reset_generation, -1);
      if (evtGen !== resetGeneration) continue;
      if (seenIds.has(rawId)) continue;
      seenIds.add(rawId);
      pendingEvents.push({
        observation_id: rawId,
        generation: evtGen,
        created_at: toNonNegInt(evt.created_at, 0),
      });
    }
  }

  return {
    serverCount,
    isTerminated,
    resetGeneration,
    pendingEvents,
    hasServerSnapshot,
    updatedAt,
  };
};

const clearLegacyTabSwitchKeys = (contestId: string, userId: string): void => {
  try {
    localStorage.removeItem(`contest_tab_switches_${contestId}_${userId}`);
    localStorage.removeItem(`contest_tab_switches_terminated_${contestId}_${userId}`);
    localStorage.removeItem(`contest_pending_tab_sync_${contestId}_${userId}`);
  } catch {
    // Ignore storage failure
  }
};

export const readLocalTabSwitchState = (contestId: string, userId: string): LocalTabSwitchState => {
  try {
    const raw = localStorage.getItem(getTabSwitchStateKey(contestId, userId));
    if (!raw) return createEmptyTabSwitchState();
    return normalizeTabSwitchState(JSON.parse(raw));
  } catch {
    return createEmptyTabSwitchState();
  }
};

export const writeLocalTabSwitchState = (
  contestId: string,
  userId: string,
  state: LocalTabSwitchState
): boolean => {
  try {
    const normalized = normalizeTabSwitchState(state);
    localStorage.setItem(getTabSwitchStateKey(contestId, userId), JSON.stringify(normalized));
    clearLegacyTabSwitchKeys(contestId, userId);
    return true;
  } catch {
    return false;
  }
};

export const getContestTerminatedByTabSwitch = (contestId: string, userId: string): boolean =>
  readLocalTabSwitchState(contestId, userId).isTerminated;
