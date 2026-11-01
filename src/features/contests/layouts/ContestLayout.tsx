import { Navigate, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { ContestHeader } from '../components/ContestHeader';
import { EndContestModal } from '../components/EndContestModal';
import { useContest } from '../hooks/useContest';
import { useAuth } from '@/lib/AuthContext';
import { getContestSubmitted, setContestSubmitted } from '@/lib/contestStorage';
import type { Contest } from '../problem.types';

export interface ContestOutletContext {
  contest: Contest | null;
  timeRemaining: number;
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
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const hasExitedRef = useRef(false);
  const wasLiveRef = useRef(false);
  const isRefetchingRef = useRef(false);

  const { contest, isLoading: isContestLoading, refetch } = useContest(contestId || '');
  const isLeaderboardPage = location.pathname.endsWith('/leaderboard');

  useEffect(() => {
    hasExitedRef.current = false;
    wasLiveRef.current = false;
  }, [contestId]);

  useEffect(() => {
    if (!contest) return;

    // Check if the user already ended this contest early on this device
    // Only redirect if the contest is still currently running
    const isSubmittedEarly = Boolean(
      user?.uid && contestId && getContestSubmitted(contestId, user.uid)
    );

    if (isSubmittedEarly && !hasExitedRef.current && !isLeaderboardPage && Date.now() < contest.end_time) {
      hasExitedRef.current = true;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      toast.info("You have already ended this contest on this device.");
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
        if (wasLiveRef.current && !hasExitedRef.current && !isLeaderboardPage) {
          if (isRefetchingRef.current) return true;
          isRefetchingRef.current = true;
          const updatedContest = await refetch();
          isRefetchingRef.current = false;
          // The user may have left (e.g. to the leaderboard) while the refetch was in flight
          if (cancelled) return true;
          if (updatedContest && Date.now() < updatedContest.end_time) {
            return false;
          }

          hasExitedRef.current = true;
          setTimeRemaining(0);
          setProgress(100);
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          toast.info("Time is up! The contest has ended.");
          navigate(`/contest/${contestId}`, { replace: true });
          return true;
        }

        setTimeRemaining(0);
        setProgress(100);
        return true;
      }

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

  const handleConfirmEndContest = () => {
    setIsEndModalOpen(false);
    if (user?.uid && contestId) {
      setContestSubmitted(contestId, user.uid);
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    toast.info("Contest ended on this device. Only your submitted solutions will be scored.");
    navigate(`/contest/${contestId}`, { replace: true });
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
  const isLive = !!contest && Date.now() >= contest.start_time && Date.now() < contest.end_time;
  if (!user && isLive && !isLeaderboardPage) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }

  const isContestEnded = contest ? Date.now() >= contest.end_time : false;
  const canEnd = !!contest?.is_registered && !isLeaderboardPage && timeRemaining > 0;

  return (
    <div className="w-full bg-black h-screen flex flex-col overflow-hidden">
      <ContestHeader 
        timeRemaining={timeRemaining}
        progress={progress}
        contestName={contest?.name || 'Contest'}
        contestId={contestId}
        onSubmitContest={canEnd ? handleOpenEndModal : undefined}
      />
      
      <div className="flex-1 min-h-0 overflow-auto flex flex-col">
        <Outlet context={{
          contest,
          timeRemaining,
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
    </div>
  );
};
