import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  getContestTabSwitches,
  setContestTabSwitches,
  incrementContestTabSwitches,
  getContestTerminatedByTabSwitch,
  setContestTerminatedByTabSwitch,
  setContestSubmitted,
  clearContestTabSwitches,
  clearContestTerminatedByTabSwitch,
  clearContestSubmitted,
  getContestPendingTabSwitchSync,
  setContestPendingTabSwitchSync,
  clearContestPendingTabSwitchSync,
} from '@/lib/contestStorage';
import { contestApi } from '@/services/api/contestApi';

interface UseTabSwitchTrackerOptions {
  contestId?: string;
  userId?: string;
  enabled?: boolean;
  maxSwitches?: number;
  onTerminate?: () => void;
}

interface UseTabSwitchTrackerResult {
  tabSwitchCount: number;
  isWarningModalOpen: boolean;
  isTerminated: boolean;
  closeWarningModal: () => void;
  handleExitDueToTabSwitch: () => void;
  resetTrackerState: () => void;
}

export const useTabSwitchTracker = ({
  contestId,
  userId,
  enabled = true,
  maxSwitches = 5,
  onTerminate,
}: UseTabSwitchTrackerOptions): UseTabSwitchTrackerResult => {
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState<boolean>(false);
  const [isTerminated, setIsTerminated] = useState<boolean>(false);

  const lastHiddenTimeRef = useRef<number>(0);
  const isUnloadingRef = useRef<boolean>(false);
  const isTerminatedRef = useRef<boolean>(false);
  const countRef = useRef<number>(0);
  const didSwitchRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    isTerminatedRef.current = isTerminated;
  }, [isTerminated]);

  useEffect(() => {
    countRef.current = tabSwitchCount;
  }, [tabSwitchCount]);

  const syncTabSwitchToBackend = useCallback(async (targetCount: number) => {
    if (!contestId || !userId) return;
    setContestPendingTabSwitchSync(contestId, userId, targetCount);

    let attempts = 0;
    const maxAttempts = 4;
    while (attempts < maxAttempts && isMountedRef.current) {
      try {
        const response = await contestApi.recordTabSwitch(contestId, targetCount);
        if (response && response.tab_switch_count >= targetCount) {
          if (getContestPendingTabSwitchSync(contestId, userId) <= targetCount) {
            clearContestPendingTabSwitchSync(contestId, userId);
          }
          return;
        }
      } catch {
        // Retry below
      }
      attempts++;
      if (attempts < maxAttempts && isMountedRef.current) {
        await new Promise((resolve) => {
          retryTimeoutRef.current = setTimeout(resolve, Math.min(1000 * Math.pow(2, attempts - 1), 5000));
        });
      }
    }
  }, [contestId, userId]);

  // Initial load and sync
  useEffect(() => {
    isMountedRef.current = true;

    if (!contestId || !userId) {
      setTabSwitchCount(0);
      setIsTerminated(false);
      setIsWarningModalOpen(false);
      return;
    }

    const storedCount = getContestTabSwitches(contestId, userId);
    const storedTerminated = getContestTerminatedByTabSwitch(contestId, userId) || storedCount >= maxSwitches;

    setTabSwitchCount(storedCount);
    countRef.current = storedCount;
    setIsTerminated(storedTerminated);
    isTerminatedRef.current = storedTerminated;

    if (storedTerminated) {
      setIsWarningModalOpen(true);
    }

    const initialPending = getContestPendingTabSwitchSync(contestId, userId);
    if (initialPending > 0) {
      void syncTabSwitchToBackend(Math.max(initialPending, storedCount));
    }

    let cancelled = false;
    const syncWithBackend = async () => {
      try {
        const session = await contestApi.getContestSessionStatus(contestId);
        if (cancelled || !session || !isMountedRef.current) return;

        const currentLocalCount = countRef.current;
        const pendingSync = getContestPendingTabSwitchSync(contestId, userId);
        const hasUnacknowledgedLocalSwitches = pendingSync > 0 || currentLocalCount > session.tab_switch_count;

        if (hasUnacknowledgedLocalSwitches) {
          // Local has unacknowledged switches; retry until backend converges. Do not wipe local state!
          void syncTabSwitchToBackend(currentLocalCount);
        } else if (session.tab_switch_count === 0 && !session.is_tab_switch_terminated) {
          // Admin reset confirmed: backend acknowledged reset to 0 and no local switches are pending
          clearContestTabSwitches(contestId, userId);
          clearContestTerminatedByTabSwitch(contestId, userId);
          clearContestPendingTabSwitchSync(contestId, userId);
          if (!session.is_submitted) {
            clearContestSubmitted(contestId, userId);
          }
          setTabSwitchCount(0);
          countRef.current = 0;
          setIsTerminated(false);
          isTerminatedRef.current = false;
          setIsWarningModalOpen(false);
        } else if (session.tab_switch_count > currentLocalCount) {
          // Backend count is higher (e.g. from another tab or previous session)
          setTabSwitchCount(session.tab_switch_count);
          countRef.current = session.tab_switch_count;
          setContestTabSwitches(contestId, userId, session.tab_switch_count);
          clearContestPendingTabSwitchSync(contestId, userId);
        }

        // Independently evaluate backend termination and maxSwitches threshold
        const shouldTerminate = Boolean(session.is_tab_switch_terminated || countRef.current >= maxSwitches);
        if (shouldTerminate) {
          setIsTerminated(true);
          isTerminatedRef.current = true;
          setContestTerminatedByTabSwitch(contestId, userId, true);
          setContestSubmitted(contestId, userId);
          setIsWarningModalOpen(true);
        }
      } catch {
        // Fall back to local storage
      }
    };

    void syncWithBackend();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [contestId, userId, maxSwitches, syncTabSwitchToBackend]);

  // Listen for beforeunload to avoid counting page reloads (F5 / Cmd+R)
  useEffect(() => {
    const handleBeforeUnload = () => {
      isUnloadingRef.current = true;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Listen for visibilitychange
  useEffect(() => {
    if (!enabled || !contestId || !userId) return;

    const handleVisibilityChange = () => {
      if (isUnloadingRef.current) return;

      const now = Date.now();

      if (document.visibilityState === 'hidden') {
        if (isTerminatedRef.current) return;

        // Debounce if multiple visibility events fire within 1 second
        if (now - lastHiddenTimeRef.current < 1000) return;
        lastHiddenTimeRef.current = now;
        didSwitchRef.current = true;

        const storedNextCount = incrementContestTabSwitches(contestId, userId);
        const nextCount = Math.max(storedNextCount, countRef.current + 1);
        setTabSwitchCount(nextCount);
        countRef.current = nextCount;

        // Record on backend asynchronously with retry
        void syncTabSwitchToBackend(nextCount);

        if (nextCount >= maxSwitches) {
          isTerminatedRef.current = true;
          setIsTerminated(true);
          setContestTerminatedByTabSwitch(contestId, userId, true);
          setContestSubmitted(contestId, userId);
        }
      } else if (document.visibilityState === 'visible') {
        // The candidate has returned to the contest tab
        if (!didSwitchRef.current) return;
        didSwitchRef.current = false;

        const currentCount = countRef.current;
        setIsWarningModalOpen(true);

        if (currentCount >= maxSwitches || isTerminatedRef.current) {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          toast.error(`Contest Terminated: Maximum ${maxSwitches} tab switches reached.`);
          onTerminate?.();
        } else {
          toast.warn(
            `Tab switch detected (${currentCount}/${maxSwitches})! ${maxSwitches - currentCount} switches remaining before contest termination.`
          );
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [contestId, userId, enabled, maxSwitches, onTerminate, syncTabSwitchToBackend]);

  const closeWarningModal = useCallback(() => {
    if (!isTerminated) {
      setIsWarningModalOpen(false);
    }
  }, [isTerminated]);

  const handleExitDueToTabSwitch = useCallback(() => {
    setIsWarningModalOpen(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onTerminate?.();
  }, [onTerminate]);

  const resetTrackerState = useCallback(() => {
    if (contestId && userId) {
      clearContestTabSwitches(contestId, userId);
      clearContestTerminatedByTabSwitch(contestId, userId);
      clearContestSubmitted(contestId, userId);
      clearContestPendingTabSwitchSync(contestId, userId);
    }
    setTabSwitchCount(0);
    countRef.current = 0;
    setIsTerminated(false);
    isTerminatedRef.current = false;
    setIsWarningModalOpen(false);
  }, [contestId, userId]);

  return {
    tabSwitchCount,
    isWarningModalOpen,
    isTerminated,
    closeWarningModal,
    handleExitDueToTabSwitch,
    resetTrackerState,
  };
};
