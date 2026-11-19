import { useServerTime, useServerClockStatus } from '@/hooks/useServerTime';
import { getServerTime } from '@/lib/serverClock';
import { retryServerClock } from '@/services/api/serverClock';
import { Button } from '@/components/ui/button';
import { Navigate, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { ShieldAlert, LogOut, AlertTriangle } from 'lucide-react';
import { ContestHeader } from '../components/ContestHeader';
import { ContestParticipationGate } from '../components/ContestParticipationGate';
import { EndContestModal } from '../components/EndContestModal';
import { TabSwitchWarningModal } from '../components/TabSwitchWarningModal';
import { useContest } from '../hooks/useContest';
import { useTabSwitchTracker } from '../hooks/useTabSwitchTracker';
import { useContestEventBlocker } from '../hooks/useContestEventBlocker';
import { useAuth } from '@/lib/AuthContext';
import {
  MAX_TAB_SWITCHES,
  getContestSubmitted,
  setContestSubmitted,
  getContestEntered,
  setContestEntered,
} from '@/lib/contestStorage';
import { contestApi } from '@/services/api/contestApi';
import { useYandexConnection } from '@/features/yandex/useYandexConnection';
import { needsYandexReconnect } from '@/lib/yandexConnect';

export interface ContestOutletContext {
  isLive: boolean;
  isContestEnded: boolean;
  isAuthenticated: boolean;
  isRegistered: boolean;
  isTabSwitchTerminated?: boolean;
  onTabSwitchTerminated?: () => void;
  openEndContestModal?: () => void;
  isSubmitting?: boolean;
  setIsSubmitting?: (isSubmitting: boolean) => void;
}

export const ContestLayout = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hasElapsedDeadline, setHasElapsedDeadline] = useState(false);
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [isEndingContest, setIsEndingContest] = useState(false);
  const [endContestError, setEndContestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasEnteredContest, setHasEnteredContest] = useState(() =>
    Boolean(user?.uid && contestId && getContestEntered(contestId, user.uid))
  );
  const [isWindowFocused, setIsWindowFocused] = useState(() => document.visibilityState === 'visible' && document.hasFocus());
  const hasExitedRef = useRef(false);
  const wasLiveRef = useRef(false);
  const isRefetchingRef = useRef(false);
  const endAbortRef = useRef<AbortController | null>(null);

  const { contest, isLoading: isContestLoading, refetch } = useContest(contestId || '');
  const isLeaderboardPage = location.pathname.endsWith('/leaderboard');

  const now = useServerTime();
  const clockStatus = useServerClockStatus();
  const clockReady = Number.isFinite(now);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workspaceFocusRef = useRef<HTMLElement | null>(null);
  const clockNoticeRef = useRef<HTMLDivElement>(null);
  const workspaceScope = `${contestId}:${user?.uid ?? ''}`;
  const admittedScopeRef = useRef<string | null>(null);
  const routeScope = `${workspaceScope}:${location.pathname}`;
  const admittedRouteRef = useRef<string | null>(null);
  const isLive = !!contest && now >= contest.start_time && now <= contest.end_time;
  const isContestEnded = contest ? (hasElapsedDeadline || now > contest.end_time) : false;

  const isSubmittedLocally = Boolean(
    user?.uid && contestId && getContestSubmitted(contestId, user.uid)
  );

  const {
    browser,
    tabSwitchCount,
    pendingSyncCount,
    maxSwitches,
    isWarningModalOpen,
    isTerminated: isTabSwitchTerminated,
    isServerConfirmedTermination,
    apiStatus: tabSwitchApiStatus,
    closeWarningModal,
    openWarningModal,
    notifyServerTermination,
    isSessionEnded,
  } = useTabSwitchTracker({
    contestId,
    userId: user?.uid,
    isSessionActive: Boolean(isLive && !isContestEnded && user?.uid && contest?.is_registered && !isSubmittedLocally),
    isCountingEnabled: Boolean(clockReady && isLive && !isContestEnded && user?.uid && contest?.is_registered && !isSubmittedLocally && hasEnteredContest),
    isBrowserSessionEnabled: !isLeaderboardPage,
    maxSwitches: MAX_TAB_SWITCHES,
  });
  const workspaceBlocked = !clockReady || !browser.ready || browser.locked;
  useEffect(() => {
    if (workspaceBlocked) clockNoticeRef.current?.focus();
    else (workspaceFocusRef.current?.isConnected ? workspaceFocusRef.current : workspaceRef.current)?.focus();
  }, [workspaceBlocked, clockStatus, browser.error, browser.locked]);
  useEffect(() => {
    if (isContestLoading || admittedScopeRef.current !== workspaceScope) admittedScopeRef.current = null;
    if (!isContestLoading && contest && !workspaceBlocked) {
      admittedScopeRef.current = workspaceScope;
      admittedRouteRef.current = routeScope;
    }
  }, [workspaceScope, routeScope, isContestLoading, contest, workspaceBlocked]);

  const isSubmittedManually = Boolean(isSubmittedLocally || isSessionEnded);
  const isTrackingActive = Boolean(
    !workspaceBlocked && isLive && !isContestEnded && user?.uid && contest?.is_registered && !isSubmittedManually
  );
  const isEventRestrictionsActive = isTrackingActive && !isTabSwitchTerminated;
  useContestEventBlocker({ enabled: isEventRestrictionsActive });
  // Re-checked every few minutes, so a token Yandex rejects mid-contest is noticed.
  const { connection: yandexConnection } = useYandexConnection(user?.uid, {
    enabled: isEventRestrictionsActive,
    pollMs: 5 * 60_000,
  });
  const showYandexNotice = isEventRestrictionsActive && Boolean(yandexConnection?.enabled) &&
    (!yandexConnection?.connected || needsYandexReconnect(yandexConnection));

  useEffect(() => {
    endAbortRef.current?.abort();
    endAbortRef.current = null;
    setIsEndModalOpen(false);
    setIsEndingContest(false);
    setEndContestError(null);
    setHasEnteredContest(Boolean(user?.uid && contestId && getContestEntered(contestId, user.uid)));
  }, [contestId, user?.uid]);

  useEffect(() => {
    return () => {
      endAbortRef.current?.abort();
    };
  }, []);

  const handleEnteredChange = useCallback((entered: boolean) => {
    setHasEnteredContest(entered);
    if (entered && contestId && user?.uid) {
      setContestEntered(contestId, user.uid);
    }
  }, [contestId, user?.uid]);

  useEffect(() => {
    if (!contestId || !user?.uid) return;
    const key = `contest_submitted_${contestId}_${user.uid}`;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) {
        if (getContestSubmitted(contestId, user.uid) && !hasExitedRef.current && !isLeaderboardPage) {
          hasExitedRef.current = true;
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          toast.info("This contest session has ended.");
          navigate(`/contest/${contestId}`, { replace: true });
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [contestId, user?.uid, isLeaderboardPage, navigate]);

  useEffect(() => {
    if (isSessionEnded && !hasExitedRef.current && !isLeaderboardPage && contest && getServerTime() < contest.end_time) {
      hasExitedRef.current = true;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      toast.info("This contest session has ended.");
      navigate(`/contest/${contestId}`, { replace: true });
    }
  }, [isSessionEnded, isLeaderboardPage, contest, contestId, navigate, clockReady]);

  useEffect(() => {
    if (isTabSwitchTerminated && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [isTabSwitchTerminated]);

  useEffect(() => {
    const handleBlur = () => setIsWindowFocused(false);
    const handleFocus = () => setIsWindowFocused(true);
    const handleVisibilityChange = () => {
      setIsWindowFocused(document.visibilityState === 'visible' && document.hasFocus());
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    hasExitedRef.current = false;
    wasLiveRef.current = false;
    setHasElapsedDeadline(false);
  }, [contestId]);

  useEffect(() => {
    if (!contest) return;

    // Clear hasElapsedDeadline whenever current contest metadata confirms a future deadline
    if (getServerTime() < contest.end_time) {
      setHasElapsedDeadline(false);
    }

    // Check if the user already manually ended this contest on this device
    // Only redirect if the contest is still currently running
    const isSubmittedEarly = Boolean(
      user?.uid && contestId && getContestSubmitted(contestId, user.uid)
    );

    if (isSubmittedEarly && !hasExitedRef.current && !isLeaderboardPage && getServerTime() < contest.end_time) {
      hasExitedRef.current = true;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      toast.info("This contest session has ended.");
      navigate(`/contest/${contestId}`, { replace: true });
      return;
    }

    let cancelled = false;

    const checkAndExitIfEnded = async () => {
      const now = getServerTime();
      if (!Number.isFinite(now)) return false;
      const endTime = contest.end_time;
      const startTime = contest.start_time;
      const totalDuration = endTime - startTime;

      // Only the problem pages count as participating; watching the leaderboard doesn't.
      if (!isLeaderboardPage && now >= startTime && now <= endTime) {
        wasLiveRef.current = true;
      }

      // If contest is over and user was actively participating in it
      if (now > endTime) {
        // Publish elapsed-deadline state immediately before awaiting refetch
        setHasElapsedDeadline(true);
        setTimeRemaining(0);
        setProgress(100);

        if (wasLiveRef.current && !hasExitedRef.current && !isLeaderboardPage) {
          if (isRefetchingRef.current) return true;
          isRefetchingRef.current = true;
          const updatedContest = await refetch();
          isRefetchingRef.current = false;
          if (updatedContest && getServerTime() < updatedContest.end_time) {
            // Reconcile extension: contest was extended while running
            setHasElapsedDeadline(false);
            const newNow = getServerTime();
            const newRemaining = Math.floor((updatedContest.end_time - newNow) / 1000);
            const newTotal = updatedContest.end_time - updatedContest.start_time;
            const newElapsed = newNow - updatedContest.start_time;
            setTimeRemaining(Math.max(0, newRemaining));
            setProgress(newTotal > 0 ? Math.min(100, Math.max(0, (newElapsed / newTotal) * 100)) : 0);
            return false;
          }
          // The user may have left (e.g. to the leaderboard) while the refetch was in flight
          if (cancelled) return true;

          hasExitedRef.current = true;
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          toast.info("Time is up! The contest has ended.");
          navigate(`/contest/${contestId}`, { replace: true });
          return true;
        }

        return true;
      }

      // Common nonexpired path: contest deadline is in the future
      setHasElapsedDeadline(false);

      // If contest hasn't started yet and user is in problem/test area
      if (now < startTime) {
        setTimeRemaining(Math.max(0, Math.floor((endTime - now) / 1000)));
        setProgress(0);

        if (!hasExitedRef.current && !isLeaderboardPage) {
          hasExitedRef.current = true;
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          toast.info("The contest has not started yet.");
          navigate(`/contest/${contestId}`, { replace: true });
        }
        return true;
      }

      const remaining = Math.floor((endTime - now) / 1000); // in seconds
      const elapsed = now - startTime;
      const progressPercentage = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

      setTimeRemaining(Math.max(0, remaining));
      setProgress(Math.min(100, Math.max(0, progressPercentage)));
      return false;
    };

    // Run check immediately
    checkAndExitIfEnded();

    const interval = setInterval(checkAndExitIfEnded, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [contest, contestId, isLeaderboardPage, navigate, refetch, user?.uid, clockReady]);

  const handleOpenEndModal = () => {
    setEndContestError(null);
    setIsEndModalOpen(true);
  };

  const handleLeaveContest = () => {
    hasExitedRef.current = true;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    navigate(`/contest/${contestId}`, { replace: true });
  };

  const handleConfirmEndContest = async () => {
    if (isEndingContest || !Number.isFinite(getServerTime())) return;
    if (isSubmitting) {
      toast.warning("A submission is currently being processed. Please wait for it to complete.");
      return;
    }
    const targetContestId = contestId;
    const targetUserId = user?.uid;
    if (!targetContestId || !targetUserId) {
      handleLeaveContest();
      return;
    }

    endAbortRef.current?.abort();
    const controller = new AbortController();
    endAbortRef.current = controller;

    setIsEndingContest(true);
    setEndContestError(null);

    const isCurrent = () =>
      !controller.signal.aborted &&
      contestId === targetContestId &&
      user?.uid === targetUserId;

    try {
      await contestApi.endContestSession(targetContestId, { signal: controller.signal });
      if (!isCurrent()) return;
      setContestSubmitted(targetContestId, targetUserId);
      setIsEndModalOpen(false);
      toast.info("Contest ended. Only your submitted solutions will be scored.");
      handleLeaveContest();
    } catch (err: unknown) {
      if (controller.signal.aborted || !isCurrent()) return;

      try {
        const result = await contestApi.getContestSessionStatus(targetContestId, { signal: controller.signal });
        if (!isCurrent()) return;
        if (result.kind === 'ok' && result.status.is_session_ended) {
          setContestSubmitted(targetContestId, targetUserId);
          setIsEndModalOpen(false);
          toast.info("Contest ended. Only your submitted solutions will be scored.");
          handleLeaveContest();
          return;
        }
      } catch {
        // Status check failed or ambiguous
      }

      if (!isCurrent()) return;
      let message = "Failed to end contest session. Please try again.";
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string; error?: string } | undefined;
        message = data?.message || data?.error || err.message || message;
      } else if (err instanceof Error) {
        message = err.message || message;
      }
      setEndContestError(message);
      toast.error(message);
    } finally {
      if (endAbortRef.current === controller) {
        endAbortRef.current = null;
        if (isCurrent()) {
          setIsEndingContest(false);
        }
      }
    }
  };

  if (!contestId) {
    return (
      <div className="w-full bg-black h-screen flex flex-col overflow-hidden">
        <ContestHeader 
          timeRemaining={0}
          progress={0}
          contestName="Invalid Contest"
        />
        <div className="px-6 py-6">
          <div className="text-red-400">Invalid contest ID</div>
        </div>
      </div>
    );
  }

  const clockNotice = (
    <div ref={clockNoticeRef} tabIndex={-1} aria-labelledby="clock-recovery-status"
      className="max-w-md rounded-lg border border-gray-700 bg-gray-900 p-6 text-white">
      <p id="clock-recovery-status" role="status">
        {clockStatus === 'error'
          ? 'Server time could not be verified. Check your connection and retry.'
          : 'Verifying server time…'}
      </p>
      <p className="mt-2 text-sm text-gray-300">Your work is preserved. The workspace will unlock when server time is verified.</p>
      <Button className="mt-4" variant="secondary" onClick={retryServerClock} disabled={clockStatus !== 'error'}>
        Retry time sync
      </Button>
    </div>
  );

  const browserNotice = (
    <div ref={clockNoticeRef} tabIndex={-1} aria-labelledby="browser-session-status"
      className="max-w-md rounded-lg border border-gray-700 bg-gray-900 p-6 text-white">
      <p id="browser-session-status" role={browser.locked ? 'alert' : 'status'}>
        {browser.locked ? 'Maximum three exam browser sessions reached. Contest participation is locked.' : browser.error || 'Verifying your exam session…'}
      </p>
      <p className="mt-2 text-sm text-gray-300">Your drafts and submitted answers are preserved.</p>
      {browser.locked
        ? <Button className="mt-4" variant="secondary" onClick={handleLeaveContest}>Exit Contest</Button>
        : <Button className="mt-4" variant="secondary" onClick={browser.retry} disabled={!browser.error}>Retry exam session</Button>}
    </div>
  );

  if (isContestLoading || (contest && workspaceBlocked && admittedScopeRef.current !== workspaceScope)) {
    return (
      <div className="w-full bg-black h-screen flex flex-col overflow-hidden">
        <ContestHeader 
          timeRemaining={0}
          progress={0}
          contestName="Loading..."
          contestId={contestId}
        />
        <div className="flex-1 flex items-center justify-center">
          {!clockReady ? clockNotice : !browser.ready || browser.locked ? browserNotice : <div className="text-gray-400">Loading contest...</div>}
        </div>
      </div>
    );
  }

  // Guests can browse ended contests; a live contest needs a login (the effect above sends upcoming ones to details).
  if (!user && isLive && !isLeaderboardPage) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }

  const isParticipating = !!user && !!contest?.is_registered && isLive &&
    !hasExitedRef.current && !isSubmittedManually && !isTabSwitchTerminated;
  const canEnd = !workspaceBlocked && !!contest?.is_registered && !isLeaderboardPage && timeRemaining > 0 && !isTabSwitchTerminated && !isSubmittedManually;

  return (
    <div ref={workspaceRef} tabIndex={-1} className="contest-screen relative w-full bg-black h-screen flex flex-col overflow-hidden">
      <div className="contents" inert={workspaceBlocked} aria-busy={workspaceBlocked}
        onFocusCapture={event => { workspaceFocusRef.current = event.target; }}>
      <ContestHeader 
        timeRemaining={timeRemaining}
        progress={progress}
        contestName={contest?.name || 'Contest'}
        contestId={contestId}
        onSubmitContest={canEnd ? handleOpenEndModal : undefined}
        isContestEnded={isContestEnded}
        tabSwitchCount={isTrackingActive && tabSwitchApiStatus !== 'unsupported' ? tabSwitchCount : undefined}
        pendingTabSwitchCount={isTrackingActive && tabSwitchApiStatus !== 'unsupported' ? pendingSyncCount : 0}
        maxTabSwitches={maxSwitches}
      />

      {showYandexNotice && (
        <div
          role="status"
          className="bg-yellow-950/70 border-b border-yellow-800/70 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-['DM_Sans']"
        >
          <div className="flex items-center gap-2 text-yellow-100">
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span>
              <strong>{yandexConnection?.connected ? 'Yandex backup needs reconnecting.' : 'Yandex backup not connected.'}</strong>{' '}
              Your work here is safe. Connect from the contest page so your solutions are also copied to the backup contest.
            </span>
          </div>
          <button
            type="button"
            onClick={handleLeaveContest}
            className="px-2.5 py-1 rounded bg-yellow-900/60 hover:bg-yellow-800/70 border border-yellow-700 text-yellow-100 font-medium transition-colors"
          >
            Go to contest page
          </button>
        </div>
      )}

      {isTrackingActive && isTabSwitchTerminated && (
        <div
          role="alert"
          className="bg-red-950/80 border-b border-red-800/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-['DM_Sans']"
        >
          <div className="flex items-center gap-2 text-red-200">
            <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>
              {isServerConfirmedTermination ? (
                <>
                  <strong>Session Locked ({tabSwitchCount}/{maxSwitches} tab switches):</strong>{' '}
                  Editing and new submissions are disabled. Previously submitted answers and local code drafts are preserved.
                </>
              ) : (
                <>
                  <strong>Verifying session lock status...</strong>{' '}
                  Submissions are temporarily paused while confirming your session status with the server.
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openWarningModal}
              className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800/70 border border-red-700 text-red-100 font-medium transition-colors"
            >
              Details
            </button>
            <button
              type="button"
              onClick={handleLeaveContest}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Exit Contest
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 min-h-0 overflow-auto flex flex-col">
        {(!workspaceBlocked || admittedRouteRef.current === routeScope) && <Outlet context={{
          isLive: isLive && !workspaceBlocked,
          isContestEnded,
          isAuthenticated: !!user,
          isRegistered: contest?.is_registered ?? false,
          isTabSwitchTerminated,
          onTabSwitchTerminated: notifyServerTermination,
          openEndContestModal: canEnd ? handleOpenEndModal : undefined,
          isSubmitting,
          setIsSubmitting,
        } satisfies ContestOutletContext} />}
      </div>

      <EndContestModal
        isOpen={isEndModalOpen && !workspaceBlocked}
        onClose={() => {
          if (!isEndingContest) {
            setIsEndModalOpen(false);
            setEndContestError(null);
          }
        }}
        onConfirm={handleConfirmEndContest}
        contestName={contest?.name}
        isEnding={isEndingContest}
        isSubmitting={isSubmitting}
        error={endContestError}
      />

      {isParticipating && (
        <ContestParticipationGate
          key={`${contestId}:${user.uid}`}
          isExitingRef={hasExitedRef}
          endTime={contest!.end_time}
          onLeave={handleLeaveContest}
          suspended={workspaceBlocked || isWarningModalOpen || isEndModalOpen}
          hasEntered={hasEnteredContest}
          onEnteredChange={handleEnteredChange}
          onPromptEndContest={handleOpenEndModal}
        />
      )}

      {!isWindowFocused && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#05070a]/95 px-6 text-center text-slate-300 backdrop-blur-2xl">
          <p className="max-w-sm text-sm font-medium">
            Contest content is hidden while this window is inactive.
          </p>
        </div>
      )}

      <TabSwitchWarningModal
        isOpen={isTrackingActive && tabSwitchApiStatus !== 'unsupported' && isWarningModalOpen}
        count={tabSwitchCount}
        pendingCount={pendingSyncCount}
        maxSwitches={maxSwitches}
        isTerminated={isTabSwitchTerminated}
        isServerConfirmed={isServerConfirmedTermination}
        onAcknowledge={closeWarningModal}
        onExitContest={handleLeaveContest}
      />
      </div>
      {workspaceBlocked && (
        <div className="absolute inset-0 z-[10000] flex items-center justify-center bg-black/80 px-6">
          {!clockReady ? clockNotice : browserNotice}
        </div>
      )}
    </div>
  );
};
