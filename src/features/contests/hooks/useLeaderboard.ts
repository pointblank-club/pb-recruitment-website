import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { LeaderboardEntry, Contest } from "../problem.types";
import { contestApi } from "@/services/api/contestApi";
import { useAuth } from "@/lib/AuthContext";

export const useLeaderboard = (contestId: string, refreshIntervalMs: number = 30000) => {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [contest, setContest] = useState<Contest | null>(null);
  const [isContestLoading, setIsContestLoading] = useState(true);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true);
  const [contestError, setContestError] = useState<string | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const currentUserId = user?.uid;

  const requestGenRef = useRef(0);
  const prevContestIdRef = useRef(contestId);
  const contestRef = useRef<Contest | null>(null);
  contestRef.current = contest;

  const fetchContest = useCallback(async () => {
    if (!contestId) {
      setContest(null);
      setIsContestLoading(false);
      setContestError(null);
      return;
    }

    const currentId = contestId;
    setIsContestLoading(true);
    try {
      const data = await contestApi.getContestById(contestId);
      if (prevContestIdRef.current !== currentId) return;
      setContest(data);
      if (!data) {
        setContestError("Contest not found");
      } else {
        setContestError(null);
      }
    } catch (err) {
      if (prevContestIdRef.current !== currentId) return;
      console.error("Failed to fetch contest metadata:", err);
      setContestError(err instanceof Error ? err.message : "Failed to fetch contest metadata");
    } finally {
      if (prevContestIdRef.current === currentId) {
        setIsContestLoading(false);
      }
    }
  }, [contestId]);

  useEffect(() => {
    fetchContest();
  }, [fetchContest]);

  const fetchLeaderboard = useCallback(
    async (targetPage: number, isBackground = false) => {
      if (!contestId) {
        setLeaderboard([]);
        setIsLeaderboardLoading(false);
        setLeaderboardError(null);
        return;
      }

      const generation = ++requestGenRef.current;
      if (!isBackground) setIsLeaderboardLoading(true);

      try {
        const res = await contestApi.getContestLeaderboard(contestId, targetPage);

        // Discard responses from obsolete requests
        if (generation !== requestGenRef.current) {
          return;
        }

        // Clamp page if total count/pages shrank below selected page
        if (res.totalPages > 0 && targetPage >= res.totalPages) {
          const clampedPage = Math.max(0, res.totalPages - 1);
          setTotalParticipants(res.totalCount);
          setTotalPages(res.totalPages);
          setPage(clampedPage);
          return;
        }

        setLeaderboard(res.entries);
        setTotalParticipants(res.totalCount);
        setTotalPages(res.totalPages);
        setLeaderboardError(null);
      } catch (err) {
        if (generation !== requestGenRef.current) return;
        if (!isBackground) {
          setLeaderboardError(err instanceof Error ? err.message : "Failed to fetch leaderboard");
        }
      } finally {
        if (generation === requestGenRef.current) {
          setIsLeaderboardLoading(false);
        }
      }
    },
    [contestId]
  );

  useEffect(() => {
    // If contest changed, reset page to 0 immediately
    if (prevContestIdRef.current !== contestId) {
      prevContestIdRef.current = contestId;
      setContest(null);
      setContestError(null);
      if (page !== 0) {
        setPage(0);
        return;
      }
    }

    fetchLeaderboard(page, false);

    if (!refreshIntervalMs) return;
    const interval = setInterval(() => {
      if (!contestRef.current) {
        fetchContest();
      }
      fetchLeaderboard(page, true);
    }, refreshIntervalMs);

    const genRef = requestGenRef;
    return () => {
      // Invalidate outstanding work during cleanup
      genRef.current++;
      clearInterval(interval);
    };
  }, [contestId, page, fetchLeaderboard, fetchContest, refreshIntervalMs]);

  const currentUserRank = useMemo(() => {
    return leaderboard.find((entry) => entry.user_id === currentUserId);
  }, [leaderboard, currentUserId]);

  const error = contestError || leaderboardError;
  const isLoading = (isLeaderboardLoading || isContestLoading) && !error;

  const refresh = useCallback(() => {
    if (!contest) {
      fetchContest();
    }
    fetchLeaderboard(page, false);
  }, [contest, fetchContest, fetchLeaderboard, page]);

  return {
    leaderboard,
    contest,
    currentUserRank,
    page,
    setPage,
    totalPages,
    totalParticipants,
    isLoading,
    error,
    refresh,
  };
};
