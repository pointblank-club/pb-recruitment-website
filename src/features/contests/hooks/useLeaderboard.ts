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
  const metadataGenRef = useRef(0);
  const prevContestIdRef = useRef(contestId);
  const contestRef = useRef<Contest | null>(null);
  contestRef.current = contest;
  const contestErrorRef = useRef<string | null>(null);
  contestErrorRef.current = contestError;
  const isFetchingLeaderboardRef = useRef(false);
  const hasLoadedDataRef = useRef(false);

  const fetchContest = useCallback(async () => {
    if (!contestId) {
      setContest(null);
      setIsContestLoading(false);
      setContestError(null);
      return;
    }

    const gen = ++metadataGenRef.current;
    const currentId = contestId;
    setIsContestLoading(true);

    try {
      const data = await contestApi.getContestById(contestId);
      if (gen !== metadataGenRef.current || prevContestIdRef.current !== currentId) return;

      setContest(data);
      if (!data) {
        setContestError("Contest not found");
      } else {
        setContestError(null);
      }
    } catch (err) {
      if (gen !== metadataGenRef.current || prevContestIdRef.current !== currentId) return;
      console.error("Failed to fetch contest metadata:", err);
      setContestError(err instanceof Error ? err.message : "Failed to fetch contest metadata");
    } finally {
      if (gen === metadataGenRef.current && prevContestIdRef.current === currentId) {
        setIsContestLoading(false);
      }
    }
  }, [contestId]);

  useEffect(() => {
    fetchContest();
    const metaRef = metadataGenRef;
    return () => {
      metaRef.current++;
    };
  }, [fetchContest]);

  const fetchLeaderboard = useCallback(
    async (targetPage: number, isBackground = false) => {
      if (!contestId) {
        setLeaderboard([]);
        setIsLeaderboardLoading(false);
        setLeaderboardError(null);
        hasLoadedDataRef.current = false;
        return;
      }

      // If a fetch is already in flight for this page, skip background tick
      if (isBackground && isFetchingLeaderboardRef.current) {
        return;
      }

      const generation = ++requestGenRef.current;
      isFetchingLeaderboardRef.current = true;
      if (!isBackground) {
        setIsLeaderboardLoading(true);
      }

      try {
        const res = await contestApi.getContestLeaderboard(contestId, targetPage);

        // Discard responses from obsolete requests
        if (generation !== requestGenRef.current) {
          return;
        }

        // Clamp page if total count/pages shrank below selected page
        const clampedPage = Math.max(0, res.totalPages - 1);
        if (targetPage > clampedPage) {
          setTotalParticipants(res.totalCount);
          setTotalPages(res.totalPages);
          setPage(clampedPage);
          return;
        }

        setLeaderboard(res.entries);
        setTotalParticipants(res.totalCount);
        setTotalPages(res.totalPages);
        setLeaderboardError(null);
        hasLoadedDataRef.current = true;
      } catch (err) {
        if (generation !== requestGenRef.current) return;
        // Suppress background errors only if valid data is already loaded and displayed
        if (!isBackground || !hasLoadedDataRef.current) {
          setLeaderboardError(err instanceof Error ? err.message : "Failed to fetch leaderboard");
        }
      } finally {
        if (generation === requestGenRef.current) {
          isFetchingLeaderboardRef.current = false;
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
      requestGenRef.current++;
      hasLoadedDataRef.current = false;
      setContest(null);
      setContestError(null);
      setLeaderboard([]);
      setLeaderboardError(null);
      if (page !== 0) {
        setPage(0);
        return;
      }
    }

    fetchLeaderboard(page, false);

    const interval = refreshIntervalMs ? setInterval(() => {
      if (!contestRef.current || contestErrorRef.current) {
        fetchContest();
      }
      fetchLeaderboard(page, true);
    }, refreshIntervalMs) : undefined;

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
    if (!contest || contestError) {
      fetchContest();
    }
    fetchLeaderboard(page, false);
  }, [contest, contestError, fetchContest, fetchLeaderboard, page]);

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
