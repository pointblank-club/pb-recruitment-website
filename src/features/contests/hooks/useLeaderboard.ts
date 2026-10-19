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
  const [error, setError] = useState<string | null>(null);
  const currentUserId = user?.uid;

  const requestGenRef = useRef(0);
  const prevContestIdRef = useRef(contestId);

  // Fetch contest metadata only when contestId changes
  useEffect(() => {
    let isCancelled = false;
    if (!contestId) {
      setContest(null);
      setIsContestLoading(false);
      return;
    }

    setIsContestLoading(true);
    contestApi.getContestById(contestId).then((data) => {
      if (!isCancelled) {
        setContest(data);
        if (!data) {
          setError("Contest not found");
        }
      }
    }).catch((err) => {
      if (!isCancelled) {
        setError(err instanceof Error ? err.message : "Failed to fetch contest metadata");
      }
      console.error("Failed to fetch contest metadata:", err);
    }).finally(() => {
      if (!isCancelled) {
        setIsContestLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [contestId]);

  const fetchLeaderboard = useCallback(
    async (targetPage: number, isBackground = false) => {
      if (!contestId) {
        setLeaderboard([]);
        setIsLeaderboardLoading(false);
        setError(null);
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
        setError(null);
      } catch (err) {
        if (generation !== requestGenRef.current) return;
        if (!isBackground) {
          setError(err instanceof Error ? err.message : "Failed to fetch leaderboard");
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
      if (page !== 0) {
        setPage(0);
        return;
      }
    }

    fetchLeaderboard(page, false);

    if (!refreshIntervalMs) return;
    const interval = setInterval(() => {
      fetchLeaderboard(page, true);
    }, refreshIntervalMs);

    const genRef = requestGenRef;
    return () => {
      // Invalidate outstanding work during cleanup
      genRef.current++;
      clearInterval(interval);
    };
  }, [contestId, page, fetchLeaderboard, refreshIntervalMs]);

  const currentUserRank = useMemo(() => {
    return leaderboard.find((entry) => entry.user_id === currentUserId);
  }, [leaderboard, currentUserId]);

  const isLoading = (isLeaderboardLoading || isContestLoading) && !error;

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
    refresh: () => fetchLeaderboard(page, false),
  };
};
