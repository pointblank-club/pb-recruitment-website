import {
  MAX_TAB_SWITCHES,
  type LocalTabSwitchState,
  type PendingTabSwitchEvent,
  readLocalTabSwitchState,
  writeLocalTabSwitchSnapshot,
  setContestSubmitted,
} from '@/lib/contestStorage';
import { contestApi } from '@/services/api/contestApi';

export type TabSwitchApiStatus = 'idle' | 'supported' | 'unsupported' | 'unauthorized' | 'offline';

export interface ServerTabSwitchSnapshot {
  tab_switch_count: number;
  is_tab_switch_terminated: boolean;
  generation: number;
}

export const createTabSwitchObservationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const getDisplayedTabSwitchCount = (
  state: LocalTabSwitchState,
  maxSwitches: number = MAX_TAB_SWITCHES
): number => {
  const safeMax = Math.max(1, maxSwitches);
  return Math.min(safeMax, Math.max(0, state.serverCount));
};

export const getPendingTabSwitchCount = (state: LocalTabSwitchState): number => {
  if (state.isTerminated) return 0;
  return state.pendingEvents.filter((event) => event.generation === state.resetGeneration).length;
};

export const isEffectivelyTerminated = (
  state: LocalTabSwitchState,
  apiStatus: TabSwitchApiStatus,
  maxSwitches: number = MAX_TAB_SWITCHES
): boolean => {
  // Never invent or enforce a local termination when the backend API is unsupported/unavailable (e.g. 404/501).
  if (apiStatus === 'unsupported' || apiStatus === 'unauthorized') {
    return false;
  }
  const safeMax = Math.max(1, maxSwitches);
  return state.isTerminated || state.serverCount >= safeMax;
};

export const enqueueLocalTabSwitch = (
  state: LocalTabSwitchState,
  maxSwitches: number = MAX_TAB_SWITCHES,
  now: number = Date.now(),
  observationId: string = createTabSwitchObservationId()
): LocalTabSwitchState => {
  const safeMax = Math.max(1, maxSwitches);
  const sameGenPending = state.pendingEvents.filter((event) => event.generation === state.resetGeneration);
  if (state.isTerminated || state.serverCount >= safeMax || sameGenPending.length >= safeMax) {
    return state;
  }
  if ((state.ackedIds ?? []).includes(observationId)) {
    return state;
  }
  if (state.pendingEvents.some((event) => event.observation_id === observationId)) {
    return state;
  }

  const nextEvent: PendingTabSwitchEvent = {
    observation_id: observationId,
    generation: state.resetGeneration,
    created_at: now,
  };

  return {
    ...state,
    pendingEvents: [...state.pendingEvents, nextEvent],
    updatedAt: Math.max(now, state.updatedAt + 1),
  };
};

export const reconcileServerSnapshot = (
  localState: LocalTabSwitchState,
  snapshot: ServerTabSwitchSnapshot,
  maxSwitches: number = MAX_TAB_SWITCHES,
  acknowledgedObservationId?: string,
  now: number = Date.now(),
  options: { acceptLowerGeneration?: boolean } = {}
): LocalTabSwitchState => {
  const safeMax = Math.max(1, maxSwitches);
  const serverGen = Math.max(0, Math.floor(Number(snapshot.generation) || 0));
  const serverCount = Math.max(0, Math.min(safeMax, Math.floor(Number(snapshot.tab_switch_count) || 0)));
  const serverTerminated = Boolean(snapshot.is_tab_switch_terminated || serverCount >= safeMax);

  // Ignore delayed responses belonging to an older reset generation unless explicitly authoritative.
  if (serverGen < localState.resetGeneration && !options.acceptLowerGeneration) {
    return localState;
  }

  const bumpUpdatedAt = Math.max(now, localState.updatedAt + 1);

  // Server generation changed (forward reset OR authoritative lower gen): adopt server state & drop mismatched retries.
  if (serverGen !== localState.resetGeneration) {
    const remainingPending = serverTerminated
      ? []
      : localState.pendingEvents.filter(
          (event) => event.generation === serverGen && event.observation_id !== acknowledgedObservationId
        );

    return {
      serverCount,
      isTerminated: serverTerminated,
      resetGeneration: serverGen,
      pendingEvents: remainingPending,
      ackedIds: [],
      hasServerSnapshot: true,
      updatedAt: bumpUpdatedAt,
    };
  }

  // Same generation: aggregate count and termination are monotonic/sticky within a generation.
  const nextServerCount = Math.max(localState.serverCount, serverCount);
  const nextTerminated = localState.isTerminated || serverTerminated;
  const nextAcked = new Set(localState.ackedIds ?? []);
  if (acknowledgedObservationId) {
    nextAcked.add(acknowledgedObservationId);
  }
  const remainingPending = nextTerminated
    ? []
    : localState.pendingEvents.filter(
        (event) => event.generation === serverGen && !nextAcked.has(event.observation_id)
      );

  return {
    serverCount: nextServerCount,
    isTerminated: nextTerminated,
    resetGeneration: serverGen,
    pendingEvents: remainingPending,
    ackedIds: Array.from(nextAcked).slice(-32),
    hasServerSnapshot: true,
    updatedAt: bumpUpdatedAt,
  };
};

export const dropStalePendingEvents = (
  localState: LocalTabSwitchState,
  rejectedGeneration: number,
  rejectedObservationId?: string,
  now: number = Date.now()
): LocalTabSwitchState => {
  const nextAcked = new Set(localState.ackedIds ?? []);
  if (rejectedObservationId && rejectedGeneration === localState.resetGeneration) {
    nextAcked.add(rejectedObservationId);
  }
  return {
    ...localState,
    pendingEvents: localState.pendingEvents.filter(
      (event) =>
        event.generation === localState.resetGeneration &&
        event.generation !== rejectedGeneration &&
        !nextAcked.has(event.observation_id)
    ),
    ackedIds: Array.from(nextAcked).slice(-32),
    updatedAt: Math.max(now, localState.updatedAt + 1),
  };
};

export const mergeLocalTabSwitchStates = (
  current: LocalTabSwitchState,
  incoming: LocalTabSwitchState
): LocalTabSwitchState => {
  if (incoming.resetGeneration > current.resetGeneration) {
    return incoming;
  }
  if (incoming.resetGeneration < current.resetGeneration) {
    return current;
  }

  const nextTerminated = current.isTerminated || incoming.isTerminated;
  const ackedSet = new Set([...(current.ackedIds ?? []), ...(incoming.ackedIds ?? [])]);
  const mergedMap = new Map<string, PendingTabSwitchEvent>();

  if (!nextTerminated) {
    for (const evt of [...current.pendingEvents, ...incoming.pendingEvents]) {
      if (evt.generation !== current.resetGeneration) continue;
      if (ackedSet.has(evt.observation_id)) continue;
      const existing = mergedMap.get(evt.observation_id);
      if (!existing || evt.created_at < existing.created_at) {
        mergedMap.set(evt.observation_id, evt);
      }
    }
  }

  const mergedPending = Array.from(mergedMap.values()).sort((a, b) =>
    a.created_at !== b.created_at
      ? a.created_at - b.created_at
      : a.observation_id.localeCompare(b.observation_id)
  );

  return {
    serverCount: Math.max(current.serverCount, incoming.serverCount),
    isTerminated: nextTerminated,
    resetGeneration: current.resetGeneration,
    pendingEvents: mergedPending,
    ackedIds: Array.from(ackedSet).slice(-32),
    hasServerSnapshot: current.hasServerSnapshot || incoming.hasServerSnapshot,
    updatedAt: Math.max(current.updatedAt, incoming.updatedAt),
  };
};

export interface ReconcileSessionOutcome {
  state: LocalTabSwitchState;
  apiStatus: TabSwitchApiStatus;
  resetDetected: boolean;
  wasTerminatedBefore: boolean;
  isSessionEnded?: boolean;
  aborted?: boolean;
}

export const reconcileContestSessionStatus = async ({
  contestId,
  userId,
  currentState,
  getCurrentState,
  maxSwitches = MAX_TAB_SWITCHES,
  signal,
}: {
  contestId: string;
  userId: string;
  currentState?: LocalTabSwitchState;
  getCurrentState?: () => LocalTabSwitchState;
  maxSwitches?: number;
  signal?: AbortSignal;
}): Promise<ReconcileSessionOutcome> => {
  const initialFromStorage = readLocalTabSwitchState(contestId, userId);
  const initialSeed = getCurrentState ? getCurrentState() : currentState;
  const initialBaseline = initialSeed
    ? mergeLocalTabSwitchStates(initialSeed, initialFromStorage)
    : initialFromStorage;
  const result = await contestApi.getContestSessionStatus(contestId, {
    signal,
    expectedUserId: userId,
  });

  if (signal?.aborted || (result.kind === 'error' && result.aborted)) {
    return {
      state: initialBaseline,
      apiStatus: 'offline',
      resetDetected: false,
      wasTerminatedBefore: initialBaseline.isTerminated,
      aborted: true,
    };
  }

  // Re-read storage and latest in-memory state after the async request so switches or POST acks
  // recorded while GET /session-status was in flight are never overwritten by a pre-await snapshot.
  const latestFromStorage = readLocalTabSwitchState(contestId, userId);
  const latestSeed = getCurrentState ? getCurrentState() : currentState;
  const latestBaseline = latestSeed
    ? mergeLocalTabSwitchStates(latestSeed, latestFromStorage)
    : latestFromStorage;
  const baseline = mergeLocalTabSwitchStates(initialBaseline, latestBaseline);

  if (result.kind === 'ok') {
    if (result.status.is_session_ended) {
      setContestSubmitted(contestId, userId);
    }
    const acceptLowerGeneration = baseline.resetGeneration === initialBaseline.resetGeneration;
    const nextState = reconcileServerSnapshot(
      baseline,
      result.status,
      maxSwitches,
      undefined,
      Date.now(),
      { acceptLowerGeneration }
    );
    writeLocalTabSwitchSnapshot(contestId, userId, nextState);
    const resetDetected = nextState.resetGeneration !== initialBaseline.resetGeneration;
    return {
      state: nextState,
      apiStatus: 'supported',
      resetDetected,
      wasTerminatedBefore: initialBaseline.isTerminated,
      isSessionEnded: Boolean(result.status.is_session_ended),
    };
  }

  if (result.kind === 'unsupported') {
    return {
      state: baseline,
      apiStatus: 'unsupported',
      resetDetected: false,
      wasTerminatedBefore: baseline.isTerminated,
    };
  }

  if (result.kind === 'unauthorized') {
    return {
      state: baseline,
      apiStatus: 'unauthorized',
      resetDetected: false,
      wasTerminatedBefore: baseline.isTerminated,
    };
  }

  return {
    state: baseline,
    apiStatus: 'offline',
    resetDetected: false,
    wasTerminatedBefore: baseline.isTerminated,
    aborted: result.aborted,
  };
};
