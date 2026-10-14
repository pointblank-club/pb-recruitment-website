import { useState, useEffect, useMemo, useCallback } from "react";
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentUserId = user?.uid;

  const fetchLeaderboard = useCallback(
    async (isBackground = false) => {
      if (!contestId) {
        setLeaderboard([]);
        setContest(null);
        setIsLoading(false);
        setError(null);
        return;
      }

      if (!isBackground) setIsLoading(true);

      try {
        const [res, contestData] = await Promise.all([
          contestApi.getContestLeaderboard(contestId, page),
          contestApi.getContestById(contestId),
        ]);
        setLeaderboard(res.entries);
        setTotalParticipants(res.totalCount);
        setTotalPages(res.totalPages);
        setContest(contestData);
        setError(null);
      } catch (err) {
        if (!isBackground) {
          setError(err instanceof Error ? err.message : "Failed to fetch leaderboard");
        }
      } finally {
        if (!isBackground) setIsLoading(false);
      }
    },
    [contestId, page]
  );

  useEffect(() => {
    fetchLeaderboard(false);

    if (!refreshIntervalMs) return;
    const interval = setInterval(() => fetchLeaderboard(true), refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetchLeaderboard, refreshIntervalMs]);

  const currentUserRank = useMemo(() => {
    return leaderboard.find((entry) => entry.user_id === currentUserId);
  }, [leaderboard, currentUserId]);

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
    refresh: () => fetchLeaderboard(false),
  };
};
