export const clearCodeDrafts = (): boolean => {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith('contest_code_draft_')) localStorage.removeItem(key);
    }
    return true;
  } catch {
    return false;
  }
};

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

export const getContestEntered = (contestId: string, userId: string): boolean => {
  try {
    return localStorage.getItem(`contest_entered_${contestId}_${userId}`) === 'true';
  } catch {
    return false;
  }
};

export const setContestEntered = (contestId: string, userId: string): void => {
  try {
    localStorage.setItem(`contest_entered_${contestId}_${userId}`, 'true');
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
  ackedIds?: string[];
  hasServerSnapshot: boolean;
  updatedAt: number;
}

export const createEmptyTabSwitchState = (): LocalTabSwitchState => ({
  serverCount: 0,
  isTerminated: false,
  resetGeneration: 0,
  pendingEvents: [],
  ackedIds: [],
  hasServerSnapshot: false,
  updatedAt: 0,
});

export const getTabSwitchStateKey = (contestId: string, userId: string): string =>
  `contest_tab_state_${contestId}_${userId}`;

export const getPendingObservationPrefix = (contestId: string, userId: string): string =>
  `contest_tab_obs_${contestId}_${userId}_`;

export const getPendingObservationKey = (
  contestId: string,
  userId: string,
  generation: number,
  observationId: string
): string => `${getPendingObservationPrefix(contestId, userId)}${generation}_${observationId}`;

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

  const seenAcked = new Set<string>();
  const ackedIds: string[] = [];
  if (Array.isArray(obj.ackedIds)) {
    for (const id of obj.ackedIds) {
      if (typeof id === 'string' && id.length > 0 && !seenAcked.has(id)) {
        seenAcked.add(id);
        ackedIds.push(id);
      }
    }
  }

  const seenIds = new Set<string>();
  const pendingEvents: PendingTabSwitchEvent[] = [];
  if (Array.isArray(obj.pendingEvents) && !isTerminated) {
    for (const item of obj.pendingEvents) {
      if (typeof item !== 'object' || item === null) continue;
      const evt = item as Record<string, unknown>;
      const rawId = evt.observation_id ?? evt.event_id;
      if (typeof rawId !== 'string' || rawId.length === 0) continue;
      if (seenAcked.has(rawId)) continue;
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
    ackedIds: ackedIds.slice(-32),
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

const listPendingObservationStorageKeys = (contestId: string, userId: string): string[] => {
  const prefix = getPendingObservationPrefix(contestId, userId);
  const matched: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      matched.push(key);
    }
  }
  return matched;
};

const sortPendingEvents = (events: PendingTabSwitchEvent[]): PendingTabSwitchEvent[] =>
  [...events].sort((a, b) =>
    a.created_at !== b.created_at
      ? a.created_at - b.created_at
      : a.observation_id.localeCompare(b.observation_id)
  );

export const readLocalTabSwitchState = (contestId: string, userId: string): LocalTabSwitchState => {
  try {
    const raw = localStorage.getItem(getTabSwitchStateKey(contestId, userId));
    const base = raw ? normalizeTabSwitchState(JSON.parse(raw)) : createEmptyTabSwitchState();
    if (base.isTerminated) {
      return { ...base, pendingEvents: [] };
    }

    const ackedSet = new Set(base.ackedIds ?? []);
    const byId = new Map<string, PendingTabSwitchEvent>();
    for (const evt of base.pendingEvents) {
      if (evt.generation === base.resetGeneration && !ackedSet.has(evt.observation_id)) {
        byId.set(evt.observation_id, evt);
      }
    }

    for (const key of listPendingObservationStorageKeys(contestId, userId)) {
      const obsRaw = localStorage.getItem(key);
      if (!obsRaw) continue;
      try {
        const parsed = JSON.parse(obsRaw) as Record<string, unknown>;
        const rawId = parsed.observation_id ?? parsed.event_id;
        if (typeof rawId !== 'string' || rawId.length === 0) continue;
        if (ackedSet.has(rawId)) continue;
        const obsGen = toNonNegInt(parsed.generation ?? parsed.reset_generation, -1);
        if (obsGen !== base.resetGeneration) continue;
        byId.set(rawId, {
          observation_id: rawId,
          generation: obsGen,
          created_at: toNonNegInt(parsed.created_at, 0),
        });
      } catch {
        // Skip malformed individual observation entry
      }
    }

    return {
      ...base,
      pendingEvents: sortPendingEvents(Array.from(byId.values())),
    };
  } catch {
    return createEmptyTabSwitchState();
  }
};

export const writePendingTabSwitchObservation = (
  contestId: string,
  userId: string,
  event: PendingTabSwitchEvent
): boolean => {
  try {
    const key = getPendingObservationKey(contestId, userId, event.generation, event.observation_id);
    localStorage.setItem(key, JSON.stringify({
      observation_id: event.observation_id,
      generation: event.generation,
      created_at: toNonNegInt(event.created_at, 0),
    }));
    clearLegacyTabSwitchKeys(contestId, userId);
    return true;
  } catch {
    return false;
  }
};

export const removePendingTabSwitchObservation = (
  contestId: string,
  userId: string,
  generation: number,
  observationId: string
): boolean => {
  try {
    localStorage.removeItem(getPendingObservationKey(contestId, userId, generation, observationId));
    return true;
  } catch {
    return false;
  }
};

export const clearStaleTabSwitchObservations = (
  contestId: string,
  userId: string,
  activeGeneration: number,
  clearAll: boolean
): void => {
  try {
    for (const key of listPendingObservationStorageKeys(contestId, userId)) {
      if (clearAll) {
        localStorage.removeItem(key);
        continue;
      }
      const suffix = key.slice(getPendingObservationPrefix(contestId, userId).length);
      const sepIdx = suffix.indexOf('_');
      const keyGen = sepIdx > 0 ? Number(suffix.slice(0, sepIdx)) : NaN;
      if (!Number.isFinite(keyGen) || keyGen !== activeGeneration) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failure
  }
};

// Persists only snapshot metadata + prunes stale observation keys; never overwrites sibling tabs' active UUID keys.
export const writeLocalTabSwitchSnapshot = (
  contestId: string,
  userId: string,
  state: LocalTabSwitchState
): boolean => {
  try {
    const normalized = normalizeTabSwitchState(state);
    const ackedSet = new Set(normalized.ackedIds ?? []);
    const snapshotOnly = {
      serverCount: normalized.serverCount,
      isTerminated: normalized.isTerminated,
      resetGeneration: normalized.resetGeneration,
      ackedIds: normalized.ackedIds,
      hasServerSnapshot: normalized.hasServerSnapshot,
      updatedAt: normalized.updatedAt,
    };
    localStorage.setItem(getTabSwitchStateKey(contestId, userId), JSON.stringify(snapshotOnly));
    clearStaleTabSwitchObservations(contestId, userId, normalized.resetGeneration, normalized.isTerminated);
    if (!normalized.isTerminated && ackedSet.size > 0) {
      for (const id of ackedSet) {
        localStorage.removeItem(getPendingObservationKey(contestId, userId, normalized.resetGeneration, id));
      }
    }
    clearLegacyTabSwitchKeys(contestId, userId);
    return true;
  } catch {
    return false;
  }
};

export const writeLocalTabSwitchState = (
  contestId: string,
  userId: string,
  state: LocalTabSwitchState
): boolean => {
  try {
    const normalized = normalizeTabSwitchState(state);
    for (const key of listPendingObservationStorageKeys(contestId, userId)) {
      localStorage.removeItem(key);
    }
    if (!normalized.isTerminated) {
      for (const evt of normalized.pendingEvents) {
        writePendingTabSwitchObservation(contestId, userId, evt);
      }
    }
    return writeLocalTabSwitchSnapshot(contestId, userId, normalized);
  } catch {
    return false;
  }
};

export const getContestTerminatedByTabSwitch = (contestId: string, userId: string): boolean =>
  readLocalTabSwitchState(contestId, userId).isTerminated;
