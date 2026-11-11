import { Navigate, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { ContestHeader } from '../components/ContestHeader';
import { ContestParticipationGate } from '../components/ContestParticipationGate';
import { EndContestModal } from '../components/EndContestModal';
import { TabSwitchWarningModal } from '../components/TabSwitchWarningModal';
import { useContest } from '../hooks/useContest';
import { useTabSwitchTracker } from '../hooks/useTabSwitchTracker';
import { useAuth } from '@/lib/AuthContext';
import { getContestSubmitted, setContestSubmitted, getContestTerminatedByTabSwitch } from '@/lib/contestStorage';

export interface ContestOutletContext {
  isLive: boolean;
  isContestEnded: boolean;
  isAuthenticated: boolean;
  isRegistered: boolean;
  openEndContestModal?: () => void;
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
  const [isWindowFocused, setIsWindowFocused] = useState(() => document.visibilityState === 'visible' && document.hasFocus());
  const hasExitedRef = useRef(false);
  const wasLiveRef = useRef(false);
  const isRefetchingRef = useRef(false);

  const { contest, isLoading: isContestLoading, refetch } = useContest(contestId || '');
  const isLeaderboardPage = location.pathname.endsWith('/leaderboard');

  const isLive = !!contest && Date.now() >= contest.start_time && Date.now() < contest.end_time;
  const isContestEnded = contest ? (hasElapsedDeadline || Date.now() >= contest.end_time) : false;
  const isTrackingActive = Boolean(
    isLive && !isContestEnded && user?.uid && contest?.is_registered && !isLeaderboardPage
  );

  const {
    tabSwitchCount,
    isWarningModalOpen,
    isTerminated: isTabSwitchTerminated,
    closeWarningModal,
    handleExitDueToTabSwitch,
  } = useTabSwitchTracker({
    contestId,
    userId: user?.uid,
    enabled: isTrackingActive,
    maxSwitches: 5,
    onTerminate: () => {
      hasExitedRef.current = true;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      navigate(`/contest/${contestId}`, { replace: true });
    },
  });

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
    if (Date.now() < contest.end_time) {
      setHasElapsedDeadline(false);
    }

    // Check if the user already ended this contest early or was terminated due to tab switches
    // Only redirect if the contest is still currently running
    const isSubmittedEarly = Boolean(
      user?.uid && contestId && getContestSubmitted(contestId, user.uid)
    );
    const isTerminatedByTabSwitch = Boolean(
      user?.uid && contestId && getContestTerminatedByTabSwitch(contestId, user.uid)
    );

    if ((isSubmittedEarly || isTerminatedByTabSwitch) && !hasExitedRef.current && !isLeaderboardPage && Date.now() < contest.end_time) {
      hasExitedRef.current = true;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (isTerminatedByTabSwitch) {
        toast.error("Your contest session has ended because the tab switch limit was reached.");
      } else {
        toast.info("You have already ended this contest on this device.");
      }
      navigate(`/contest/${contestId}`, { replace: true });
      return;
    }

    let cancelled = false;

    const checkAndExitIfEnded = async () => {
      const now = Date.now();
      const endTime = contest.end_time;
      const startTime = contest.start_time;
      const totalDuration = endTime - startTime;

      // Only the problem pages count as participating; watching the leaderboard doesn't.
      if (!isLeaderboardPage && now >= startTime && now < endTime) {
        wasLiveRef.current = true;
      }

      // If contest is over and user was actively participating in it
      if (now >= endTime) {
        // Publish elapsed-deadline state immediately before awaiting refetch
        setHasElapsedDeadline(true);
        setTimeRemaining(0);
        setProgress(100);

        if (wasLiveRef.current && !hasExitedRef.current && !isLeaderboardPage) {
          if (isRefetchingRef.current) return true;
          isRefetchingRef.current = true;
          const updatedContest = await refetch();
          isRefetchingRef.current = false;
          if (updatedContest && Date.now() < updatedContest.end_time) {
            // Reconcile extension: contest was extended while running
            setHasElapsedDeadline(false);
            const newNow = Date.now();
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
  }, [contest, contestId, isLeaderboardPage, navigate, refetch, user?.uid]);

  const handleOpenEndModal = () => {
    setIsEndModalOpen(true);
  };

  const handleLeaveContest = () => {
    hasExitedRef.current = true;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    navigate(`/contest/${contestId}`, { replace: true });
  };

  const handleConfirmEndContest = () => {
    setIsEndModalOpen(false);
    if (user?.uid && contestId) {
      setContestSubmitted(contestId, user.uid);
    }
    toast.info("Contest ended on this device. Only your submitted solutions will be scored.");
    handleLeaveContest();
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

  if (isContestLoading) {
    return (
      <div className="w-full bg-black h-screen flex flex-col overflow-hidden">
        <ContestHeader 
          timeRemaining={0}
          progress={0}
          contestName="Loading..."
          contestId={contestId}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400">Loading contest...</div>
        </div>
      </div>
    );
  }

  // Guests can browse ended contests; a live contest needs a login (the effect above sends upcoming ones to details).
  if (!user && isLive && !isLeaderboardPage) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }

  const isParticipating = !!user && !!contest?.is_registered && isLive && !isLeaderboardPage &&
    !hasExitedRef.current && !getContestSubmitted(contestId, user.uid);
  const canEnd = !!contest?.is_registered && !isLeaderboardPage && timeRemaining > 0;

  return (
    <div className="contest-screen relative w-full bg-black h-screen flex flex-col overflow-hidden">
      <ContestHeader 
        timeRemaining={timeRemaining}
        progress={progress}
        contestName={contest?.name || 'Contest'}
        contestId={contestId}
        onSubmitContest={canEnd ? handleOpenEndModal : undefined}
        isContestEnded={isContestEnded}
        tabSwitchCount={isTrackingActive ? tabSwitchCount : undefined}
        maxTabSwitches={5}
      />
      
      <div className="flex-1 min-h-0 overflow-auto flex flex-col">
        <Outlet context={{
          isLive,
          isContestEnded,
          isAuthenticated: !!user,
          isRegistered: contest?.is_registered ?? false,
          openEndContestModal: canEnd ? handleOpenEndModal : undefined,
        } satisfies ContestOutletContext} />
      </div>

      <EndContestModal
        isOpen={isEndModalOpen}
        onClose={() => setIsEndModalOpen(false)}
        onConfirm={handleConfirmEndContest}
        contestName={contest?.name}
      />

      {isParticipating && (
        <ContestParticipationGate
          key={`${contestId}:${user.uid}`}
          isExitingRef={hasExitedRef}
          endTime={contest!.end_time}
          onLeave={handleLeaveContest}
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
        isOpen={isTrackingActive && isWarningModalOpen}
        count={tabSwitchCount}
        maxSwitches={5}
        isTerminated={isTabSwitchTerminated}
        onAcknowledge={closeWarningModal}
        onExitContest={handleExitDueToTabSwitch}
      />
    </div>
  );
};
