import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  MAX_TAB_SWITCHES,
  type LocalTabSwitchState,
  getPendingObservationPrefix,
  getTabSwitchStateKey,
  readLocalTabSwitchState,
  removePendingTabSwitchObservation,
  writeLocalTabSwitchSnapshot,
  writePendingTabSwitchObservation,
} from '@/lib/contestStorage';
import { contestApi } from '@/services/api/contestApi';
import {
  type TabSwitchApiStatus,
  dropStalePendingEvents,
  enqueueLocalTabSwitch,
  getDisplayedTabSwitchCount,
  getPendingTabSwitchCount,
  isEffectivelyTerminated,
  mergeLocalTabSwitchStates,
  reconcileContestSessionStatus,
  reconcileServerSnapshot,
} from '../tabSwitchSync';

interface UseTabSwitchTrackerOptions {
  contestId?: string;
  userId?: string;
  isSessionActive?: boolean;
  isCountingEnabled?: boolean;
  maxSwitches?: number;
}

export interface UseTabSwitchTrackerResult {
  tabSwitchCount: number;
  maxSwitches: number;
  isWarningModalOpen: boolean;
  isTerminated: boolean;
  isServerConfirmedTermination: boolean;
  apiStatus: TabSwitchApiStatus;
  pendingSyncCount: number;
  closeWarningModal: () => void;
  openWarningModal: () => void;
  reconcileNow: () => Promise<void>;
  notifyServerTermination: () => void;
}

interface TrackerScope {
  contestId: string;
  userId: string;
  maxSwitches: number;
  controller: AbortController;
  timers: Set<ReturnType<typeof setTimeout>>;
  state: LocalTabSwitchState;
  apiStatus: TabSwitchApiStatus;
  isFlushRunning: boolean;
  inFlightReconcile: Promise<void> | null;
  pendingReconcileFollowUp: boolean;
  initialReconcilePromise: Promise<void>;
  wakeFlush: (() => void) | null;
  provisionalLock: boolean;
}

export const useTabSwitchTracker = ({
  contestId,
  userId,
  isSessionActive = true,
  isCountingEnabled = true,
  maxSwitches = MAX_TAB_SWITCHES,
}: UseTabSwitchTrackerOptions): UseTabSwitchTrackerResult => {
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [isTerminated, setIsTerminated] = useState<boolean>(false);
  const [isServerConfirmedTermination, setIsServerConfirmedTermination] = useState<boolean>(false);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState<boolean>(false);
  const [apiStatus, setApiStatus] = useState<TabSwitchApiStatus>('idle');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  const activeScopeRef = useRef<TrackerScope | null>(null);
  const isCountingEnabledRef = useRef<boolean>(isCountingEnabled);
  isCountingEnabledRef.current = isCountingEnabled;

  const isScopeActive = useCallback((scope: TrackerScope): boolean => (
    activeScopeRef.current === scope && !scope.controller.signal.aborted
  ), []);

  const publishScopeState = useCallback((scope: TrackerScope) => {
    if (!isScopeActive(scope)) return;
    const displayed = getDisplayedTabSwitchCount(scope.state, scope.maxSwitches);
    const pending = getPendingTabSwitchCount(scope.state);
    const authoritativeTerminated = isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches);
    const effectiveTerminated =
      authoritativeTerminated ||
      (scope.provisionalLock && scope.apiStatus !== 'unsupported' && scope.apiStatus !== 'unauthorized');
    setTabSwitchCount(displayed);
    setIsTerminated(effectiveTerminated);
    setIsServerConfirmedTermination(scope.apiStatus !== 'unsupported' && scope.state.isTerminated);
    setApiStatus(scope.apiStatus);
    setPendingSyncCount(pending);
  }, [isScopeActive]);

  const scheduleTimer = useCallback((scope: TrackerScope, ms: number, cb: () => void) => {
    if (!isScopeActive(scope)) return null;
    const handle = setTimeout(() => {
      scope.timers.delete(handle);
      if (isScopeActive(scope)) cb();
    }, ms);
    scope.timers.add(handle);
    return handle;
  }, [isScopeActive]);

  const waitRetry = useCallback((scope: TrackerScope, ms: number): Promise<void> => (
    new Promise((resolve) => {
      if (!isScopeActive(scope)) {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        scope.wakeFlush = null;
        if (handle) {
          clearTimeout(handle);
          scope.timers.delete(handle);
        }
        resolve();
      };
      const handle = setTimeout(done, ms);
      scope.timers.add(handle);
      scope.wakeFlush = done;
    })
  ), [isScopeActive]);

  const flushQueueRef = useRef<(scope: TrackerScope) => Promise<void>>(async () => {});

  const reconcileScope = useCallback((scope: TrackerScope, rerunIfInFlight = false): Promise<void> => {
    if (!isScopeActive(scope)) return Promise.resolve();
    if (scope.inFlightReconcile) {
      if (rerunIfInFlight) {
        scope.pendingReconcileFollowUp = true;
      }
      return scope.inFlightReconcile;
    }

    const promise = (async () => {
      const prevResetGen = scope.state.resetGeneration;
      const prevAuthoritativeTerminated = isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches);
      const prevEffectiveTerminated =
        prevAuthoritativeTerminated ||
        (scope.provisionalLock && scope.apiStatus !== 'unsupported' && scope.apiStatus !== 'unauthorized');

      const outcome = await reconcileContestSessionStatus({
        contestId: scope.contestId,
        userId: scope.userId,
        currentState: scope.state,
        getCurrentState: () => scope.state,
        maxSwitches: scope.maxSwitches,
        signal: scope.controller.signal,
      });

      if (!isScopeActive(scope) || outcome.aborted) return;

      if (outcome.apiStatus !== 'offline') {
        scope.provisionalLock = false;
      }

      scope.state = outcome.state;
      scope.apiStatus = outcome.apiStatus;
      publishScopeState(scope);

      const nowTerminated = isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches);

      if (scope.apiStatus === 'unsupported') {
        setIsWarningModalOpen(false);
        return;
      }

      if (outcome.resetDetected || (prevEffectiveTerminated && !nowTerminated && !scope.provisionalLock)) {
        setIsWarningModalOpen(false);
        if (prevResetGen < outcome.state.resetGeneration && prevAuthoritativeTerminated) {
          toast.info('Your tab-switch violations were reset by an administrator. You may continue the contest.');
        }
      } else if (!prevAuthoritativeTerminated && nowTerminated) {
        setIsWarningModalOpen(true);
      }

      if (scope.state.pendingEvents.length > 0 && !scope.state.isTerminated && scope.apiStatus === 'supported') {
        scope.wakeFlush?.();
        void flushQueueRef.current(scope);
      }
    })().finally(() => {
      if (scope.inFlightReconcile === promise) {
        scope.inFlightReconcile = null;
        if (scope.pendingReconcileFollowUp && isScopeActive(scope)) {
          scope.pendingReconcileFollowUp = false;
          void reconcileScope(scope);
        }
      }
    });

    scope.inFlightReconcile = promise;
    return promise;
  }, [isScopeActive, publishScopeState]);

  const flushQueue = useCallback(async (scope: TrackerScope): Promise<void> => {
    if (!isScopeActive(scope) || scope.isFlushRunning) return;
    if (scope.apiStatus === 'unsupported' || scope.apiStatus === 'unauthorized') return;

    const getStatus = (s: TrackerScope): TabSwitchApiStatus => s.apiStatus;

    scope.isFlushRunning = true;
    try {
      await scope.initialReconcilePromise;
      if (!isScopeActive(scope)) return;

      let retryAttempt = 0;
      let conflictAttempt = 0;

      while (isScopeActive(scope)) {
        const statusBeforeReconcile = getStatus(scope);
        if (statusBeforeReconcile === 'unsupported' || statusBeforeReconcile === 'unauthorized') break;

        // Reconcile before replaying if we don't yet have an authoritative snapshot or just recovered from offline.
        if (!scope.state.hasServerSnapshot || statusBeforeReconcile === 'offline') {
          await reconcileScope(scope);
          if (!isScopeActive(scope)) break;
          const statusAfterReconcile = getStatus(scope);
          if (statusAfterReconcile === 'unsupported' || statusAfterReconcile === 'unauthorized') break;
          if (statusAfterReconcile === 'offline') {
            if (retryAttempt >= 5) break;
            const delay = Math.min(1000 * Math.pow(2, retryAttempt), 16_000);
            retryAttempt++;
            await waitRetry(scope, delay);
            continue;
          }
        }

        const fromStorage = readLocalTabSwitchState(scope.contestId, scope.userId);
        scope.state = mergeLocalTabSwitchStates(scope.state, fromStorage);

        if (scope.state.isTerminated || scope.state.pendingEvents.length === 0) {
          publishScopeState(scope);
          break;
        }

        const head = scope.state.pendingEvents[0];
        if (head.generation !== scope.state.resetGeneration) {
          scope.state = dropStalePendingEvents(scope.state, head.generation);
          removePendingTabSwitchObservation(scope.contestId, scope.userId, head.generation, head.observation_id);
          writeLocalTabSwitchSnapshot(scope.contestId, scope.userId, scope.state);
          publishScopeState(scope);
          continue;
        }

        const prevTerminated = isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches);
        const result = await contestApi.recordTabSwitch(
          scope.contestId,
          {
            observation_id: head.observation_id,
            generation: head.generation,
            count: 1,
          },
          {
            signal: scope.controller.signal,
            expectedUserId: scope.userId,
          }
        );

        if (!isScopeActive(scope)) break;

        if (result.kind === 'ok') {
          retryAttempt = 0;
          conflictAttempt = 0;
          scope.apiStatus = 'supported';
          scope.provisionalLock = false;
          const latestStorage = readLocalTabSwitchState(scope.contestId, scope.userId);
          const merged = mergeLocalTabSwitchStates(scope.state, latestStorage);
          scope.state = reconcileServerSnapshot(
            merged,
            {
              tab_switch_count: result.data.tab_switch_count,
              is_tab_switch_terminated: result.data.is_terminated,
              generation: result.data.generation,
            },
            scope.maxSwitches,
            head.observation_id
          );
          removePendingTabSwitchObservation(scope.contestId, scope.userId, head.generation, head.observation_id);
          writeLocalTabSwitchSnapshot(scope.contestId, scope.userId, scope.state);
          publishScopeState(scope);

          const nowTerminated = isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches);
          if (!prevTerminated && nowTerminated) {
            setIsWarningModalOpen(true);
          } else if (prevTerminated && !nowTerminated) {
            setIsWarningModalOpen(false);
          }
          continue;
        }

        if (result.kind === 'stale_generation') {
          conflictAttempt++;
          retryAttempt = 0;
          scope.apiStatus = 'supported';
          scope.provisionalLock = false;
          const latestStorage = readLocalTabSwitchState(scope.contestId, scope.userId);
          const merged = mergeLocalTabSwitchStates(scope.state, latestStorage);
          if (result.data && typeof result.data.generation === 'number') {
            scope.state = reconcileServerSnapshot(
              merged,
              {
                tab_switch_count: result.data.tab_switch_count ?? 0,
                is_tab_switch_terminated: Boolean(result.data.is_terminated),
                generation: result.data.generation,
              },
              scope.maxSwitches,
              head.observation_id,
              Date.now(),
              { acceptLowerGeneration: merged.resetGeneration === head.generation }
            );
            if (scope.state.pendingEvents.some((event) => event.observation_id === head.observation_id)) {
              scope.state = dropStalePendingEvents(scope.state, head.generation, head.observation_id);
            }
            removePendingTabSwitchObservation(scope.contestId, scope.userId, head.generation, head.observation_id);
            writeLocalTabSwitchSnapshot(scope.contestId, scope.userId, scope.state);
            publishScopeState(scope);

            const nowTerminated = isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches);
            if (!prevTerminated && nowTerminated) {
              setIsWarningModalOpen(true);
            } else if (prevTerminated && !nowTerminated) {
              setIsWarningModalOpen(false);
            }
          } else {
            scope.state = dropStalePendingEvents(merged, head.generation, head.observation_id);
            removePendingTabSwitchObservation(scope.contestId, scope.userId, head.generation, head.observation_id);
            writeLocalTabSwitchSnapshot(scope.contestId, scope.userId, scope.state);
            publishScopeState(scope);
            await reconcileScope(scope);
          }

          if (scope.state.pendingEvents.length > 0 && !scope.state.isTerminated) {
            if (conflictAttempt >= 5) {
              break;
            }
            const conflictWaitMs = Math.min(1000 * Math.pow(2, conflictAttempt - 1), 16_000);
            await waitRetry(scope, conflictWaitMs);
          }
          continue;
        }

        if (result.kind === 'unsupported') {
          scope.apiStatus = 'unsupported';
          scope.provisionalLock = false;
          publishScopeState(scope);
          setIsWarningModalOpen(false);
          break;
        }

        if (result.kind === 'unauthorized') {
          scope.apiStatus = 'unauthorized';
          scope.provisionalLock = false;
          publishScopeState(scope);
          break;
        }

        if (result.kind === 'invalid') {
          const latestStorage = readLocalTabSwitchState(scope.contestId, scope.userId);
          const merged = mergeLocalTabSwitchStates(scope.state, latestStorage);
          const nextAcked = Array.from(new Set([...(merged.ackedIds ?? []), head.observation_id])).slice(-32);
          scope.state = {
            ...merged,
            pendingEvents: merged.pendingEvents.filter((event) => event.observation_id !== head.observation_id),
            ackedIds: nextAcked,
            updatedAt: Math.max(Date.now(), merged.updatedAt + 1),
          };
          removePendingTabSwitchObservation(scope.contestId, scope.userId, head.generation, head.observation_id);
          writeLocalTabSwitchSnapshot(scope.contestId, scope.userId, scope.state);
          publishScopeState(scope);
          await reconcileScope(scope);
          continue;
        }

        if (result.aborted) break;

        // Transient network / 429 / 5xx error: stay offline cleanly and retry with bounded backoff.
        scope.apiStatus = 'offline';
        publishScopeState(scope);
        if (retryAttempt >= 5) {
          break;
        }
        const baseDelay = Math.min(1000 * Math.pow(2, retryAttempt), 16_000);
        const waitMs = result.retryAfterMs ? Math.max(baseDelay, result.retryAfterMs) : baseDelay;
        retryAttempt++;
        await waitRetry(scope, waitMs);
      }
    } finally {
      scope.isFlushRunning = false;
    }
  }, [isScopeActive, publishScopeState, reconcileScope, waitRetry]);

  flushQueueRef.current = flushQueue;

  // Scope setup, initial reconciliation before replay, reconnect/storage listeners, and strict cleanup.
  useEffect(() => {
    if (!contestId || !userId || !isSessionActive) {
      activeScopeRef.current = null;
      setTabSwitchCount(0);
      setIsTerminated(false);
      setIsServerConfirmedTermination(false);
      setIsWarningModalOpen(false);
      setApiStatus('idle');
      setPendingSyncCount(0);
      return;
    }

    const controller = new AbortController();
    const initialLocal = readLocalTabSwitchState(contestId, userId);

    let resolveInitialReconcile: () => void = () => {};
    const initialReconcilePromise = new Promise<void>((resolve) => {
      resolveInitialReconcile = resolve;
    });

    const scope: TrackerScope = {
      contestId,
      userId,
      maxSwitches,
      controller,
      timers: new Set(),
      state: initialLocal,
      apiStatus: initialLocal.hasServerSnapshot ? 'supported' : 'idle',
      isFlushRunning: false,
      inFlightReconcile: null,
      pendingReconcileFollowUp: false,
      initialReconcilePromise,
      wakeFlush: null,
      provisionalLock: false,
    };

    activeScopeRef.current = scope;
    publishScopeState(scope);

    if (isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches)) {
      setIsWarningModalOpen(true);
    }

    const runInitialSync = async () => {
      await reconcileScope(scope);
      resolveInitialReconcile();
      if (!isScopeActive(scope)) return;
      if (scope.state.pendingEvents.length > 0 && !scope.state.isTerminated) {
        const statusNow = scope.apiStatus as TabSwitchApiStatus;
        if (statusNow === 'supported') {
          void flushQueue(scope);
        } else if (statusNow === 'offline') {
          scheduleTimer(scope, 1000, () => {
            void flushQueue(scope);
          });
        }
      }
    };

    void runInitialSync();

    const handleOnline = () => {
      if (!isScopeActive(scope)) return;
      scope.wakeFlush?.();
      void reconcileScope(scope, true);
    };

    const handleFocus = () => {
      if (!isScopeActive(scope)) return;
      scope.wakeFlush?.();
      void reconcileScope(scope, true);
    };

    const handleStorage = (event: StorageEvent) => {
      if (!isScopeActive(scope)) return;
      const stateKey = getTabSwitchStateKey(scope.contestId, scope.userId);
      const obsPrefix = getPendingObservationPrefix(scope.contestId, scope.userId);
      if (event.key !== null && event.key !== stateKey && !event.key.startsWith(obsPrefix)) {
        return;
      }

      const prevTerminated = isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches);
      const fromStorage = readLocalTabSwitchState(scope.contestId, scope.userId);
      scope.state = mergeLocalTabSwitchStates(scope.state, fromStorage);
      publishScopeState(scope);

      const nowTerminated = isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches);
      if (!prevTerminated && nowTerminated) {
        setIsWarningModalOpen(true);
      } else if (prevTerminated && !nowTerminated) {
        setIsWarningModalOpen(false);
      }

      if (scope.state.pendingEvents.length > 0 && !scope.state.isTerminated) {
        scope.wakeFlush?.();
        void flushQueue(scope);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);

    return () => {
      controller.abort();
      scope.wakeFlush?.();
      scope.timers.forEach((timer) => clearTimeout(timer));
      scope.timers.clear();
      resolveInitialReconcile();
      if (activeScopeRef.current === scope) {
        activeScopeRef.current = null;
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
    };
  }, [contestId, userId, isSessionActive, maxSwitches, flushQueue, isScopeActive, publishScopeState, reconcileScope, scheduleTimer]);

  // If the candidate stays on the locked workspace view, periodically check whether an admin reset their session.
  useEffect(() => {
    if (!isTerminated || !isSessionActive) return;
    const scope = activeScopeRef.current;
    if (!scope || !isScopeActive(scope)) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false && isScopeActive(scope)) {
        void reconcileScope(scope);
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [isTerminated, isSessionActive, isScopeActive, reconcileScope]);

  // Lifecycle & visibility transition tracking: counts genuine visible->hidden->visible transitions,
  // stays exempt on real reloads/closes, and recovers immediately if a beforeunload prompt is dismissed.
  useEffect(() => {
    if (!isSessionActive || !contestId || !userId) return;

    let wasHidden = document.visibilityState === 'hidden';
    let isUnloading = false;
    let pendingUnloadCheckTimer: ReturnType<typeof setTimeout> | null = null;
    let shouldNotifyOnReturn = false;

    const clearPendingUnloadTimer = () => {
      if (pendingUnloadCheckTimer) {
        clearTimeout(pendingUnloadCheckTimer);
        activeScopeRef.current?.timers.delete(pendingUnloadCheckTimer);
        pendingUnloadCheckTimer = null;
      }
    };

    const commitSwitch = () => {
      const scope = activeScopeRef.current;
      if (!scope || !isScopeActive(scope) || !isCountingEnabledRef.current) return;
      if (scope.apiStatus === 'unsupported') return;
      if (isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches)) return;

      const fromStorage = readLocalTabSwitchState(scope.contestId, scope.userId);
      const merged = mergeLocalTabSwitchStates(scope.state, fromStorage);
      const next = enqueueLocalTabSwitch(merged, scope.maxSwitches);
      if (next === merged) return;

      scope.state = next;
      const added = next.pendingEvents[next.pendingEvents.length - 1];
      if (added) {
        writePendingTabSwitchObservation(scope.contestId, scope.userId, added);
      }
      publishScopeState(scope);
      shouldNotifyOnReturn = true;

      scope.wakeFlush?.();
      void flushQueue(scope);
    };

    const notifyReturnIfNeeded = () => {
      if (!shouldNotifyOnReturn) return;
      shouldNotifyOnReturn = false;

      const scope = activeScopeRef.current;
      if (!scope || !isScopeActive(scope)) return;
      if (scope.apiStatus === 'unsupported') return;

      const count = getDisplayedTabSwitchCount(scope.state, scope.maxSwitches);
      const pending = getPendingTabSwitchCount(scope.state);
      const remaining = Math.max(0, scope.maxSwitches - (count + pending));
      const terminatedNow = isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches);
      setIsWarningModalOpen(true);

      if (terminatedNow) {
        toast.error(`Session Locked: Maximum ${scope.maxSwitches} tab switches reached.`);
      } else if (pending > 0) {
        toast.warn(
          `Tab switch detected (Confirmed: ${count}/${scope.maxSwitches}, +${pending} syncing). ${remaining} ${remaining === 1 ? 'switch' : 'switches'} remaining before contest lock.`
        );
      } else {
        toast.warn(
          `Tab switch detected (${count}/${scope.maxSwitches})! ${remaining} ${remaining === 1 ? 'switch' : 'switches'} remaining before contest lock.`
        );
      }
    };

    const handleBeforeUnload = () => {
      isUnloading = true;
    };

    const handlePageHide = () => {
      isUnloading = true;
      clearPendingUnloadTimer();
    };

    const handlePageShow = () => {
      isUnloading = false;
      clearPendingUnloadTimer();
    };

    const handleWindowFocus = () => {
      isUnloading = false;
    };

    const handleVisibilityChange = () => {
      const scope = activeScopeRef.current;
      if (!scope || !isScopeActive(scope)) return;

      if (document.visibilityState === 'hidden') {
        if (wasHidden) return;
        wasHidden = true;

        if (!isCountingEnabledRef.current) return;
        if (isEffectivelyTerminated(scope.state, scope.apiStatus, scope.maxSwitches)) return;

        if (isUnloading) {
          clearPendingUnloadTimer();
          pendingUnloadCheckTimer = scheduleTimer(scope, 50, () => {
            pendingUnloadCheckTimer = null;
            isUnloading = false;
            commitSwitch();
          });
          return;
        }

        commitSwitch();
      } else if (document.visibilityState === 'visible') {
        wasHidden = false;
        isUnloading = false;

        if (pendingUnloadCheckTimer) {
          clearPendingUnloadTimer();
          commitSwitch();
        }

        notifyReturnIfNeeded();
        scope.wakeFlush?.();
        void reconcileScope(scope);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearPendingUnloadTimer();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [contestId, userId, isSessionActive, flushQueue, isScopeActive, publishScopeState, reconcileScope, scheduleTimer]);

  const closeWarningModal = useCallback(() => {
    setIsWarningModalOpen(false);
  }, []);

  const openWarningModal = useCallback(() => {
    setIsWarningModalOpen(true);
  }, []);

  const reconcileNow = useCallback(async () => {
    const scope = activeScopeRef.current;
    if (scope && isScopeActive(scope)) {
      await reconcileScope(scope, true);
    }
  }, [isScopeActive, reconcileScope]);

  const notifyServerTermination = useCallback(() => {
    const scope = activeScopeRef.current;
    if (!scope || !isScopeActive(scope)) return;
    // Keep only a non-persisted provisional lock until GET /session-status returns an authoritative snapshot.
    scope.provisionalLock = true;
    publishScopeState(scope);
    scope.wakeFlush?.();
    void reconcileScope(scope, true);
  }, [isScopeActive, publishScopeState, reconcileScope]);

  return {
    tabSwitchCount,
    maxSwitches,
    isWarningModalOpen,
    isTerminated,
    isServerConfirmedTermination,
    apiStatus,
    pendingSyncCount,
    closeWarningModal,
    openWarningModal,
    reconcileNow,
    notifyServerTermination,
  };
};
