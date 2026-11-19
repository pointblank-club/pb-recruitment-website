import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Loader2, Pause, Play } from "lucide-react";
import { toast } from "react-toastify";
import { adminApi } from "@/services/api/adminApi";
import { useAuth } from "@/lib/AuthContext";

interface LeaderboardFreezeControlProps {
  contestId: string;
}

const LeaderboardFreezeControl = ({ contestId }: LeaderboardFreezeControlProps) => {
  const { user } = useAuth();
  const userId = user?.uid;
  const [isFrozen, setIsFrozen] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const scopeRef = useRef({ contestId, userId });
  scopeRef.current = { contestId, userId };
  const statusRequestGenerationRef = useRef(0);
  const mutationGenerationRef = useRef(0);
  const mutationInFlightRef = useRef(false);

  const isCurrentScope = (targetContestId: string, targetUserId: string | undefined) =>
    scopeRef.current.contestId === targetContestId && scopeRef.current.userId === targetUserId;

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (axios.isAxiosError<{ error?: string }>(err)) {
      return err.response?.data?.error || err.message;
    }
    return err instanceof Error ? err.message : fallback;
  };

  const loadStatus = useCallback(async (options: { preserveError?: boolean; quiet?: boolean } = {}) => {
    const generation = ++statusRequestGenerationRef.current;
    const targetContestId = contestId;
    const targetUserId = userId;
    if (!options.quiet) setLoading(true);
    if (!options.preserveError) setError("");
    try {
      const status = await adminApi.getLeaderboardFreezeStatus(targetContestId);
      if (generation !== statusRequestGenerationRef.current || !isCurrentScope(targetContestId, targetUserId)) return;
      setIsFrozen(status.frozen);
    } catch (err: unknown) {
      if (generation !== statusRequestGenerationRef.current || !isCurrentScope(targetContestId, targetUserId)) return;
      setError(getErrorMessage(err, "Failed to load leaderboard status."));
    } finally {
      if (!options.quiet && generation === statusRequestGenerationRef.current && isCurrentScope(targetContestId, targetUserId)) {
        setLoading(false);
      }
    }
  }, [contestId, userId]);

  useEffect(() => {
    setIsFrozen(null);
    setLoading(true);
    setUpdating(false);
    setError("");
    mutationInFlightRef.current = false;
    void loadStatus();

    const statusGenerationRefForCleanup = statusRequestGenerationRef;
    const mutationGenerationRefForCleanup = mutationGenerationRef;
    const mutationInFlightRefForCleanup = mutationInFlightRef;
    return () => {
      statusGenerationRefForCleanup.current++;
      mutationGenerationRefForCleanup.current++;
      mutationInFlightRefForCleanup.current = false;
    };
  }, [contestId, loadStatus, userId]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && !mutationInFlightRef.current) {
        void loadStatus({ quiet: true });
      }
    };
    const refreshOnFocus = () => {
      if (!mutationInFlightRef.current) void loadStatus({ quiet: true });
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadStatus]);

  const handleToggle = async () => {
    if (isFrozen === null || updating || mutationInFlightRef.current) return;
    const nextFrozen = !isFrozen;
    const operation = ++mutationGenerationRef.current;
    const targetContestId = contestId;
    const targetUserId = userId;
    const isCurrentMutation = () => operation === mutationGenerationRef.current &&
      isCurrentScope(targetContestId, targetUserId);

    // A read started before this mutation could report the old server state.
    statusRequestGenerationRef.current++;
    mutationInFlightRef.current = true;
    setUpdating(true);
    setError("");
    try {
      const status = await adminApi.setLeaderboardFrozen(targetContestId, nextFrozen);
      if (!isCurrentMutation()) return;
      setIsFrozen(status.frozen);
      toast.success(status.frozen
        ? "Public leaderboard frozen. Scores are still updating."
        : "Public leaderboard unfrozen with the latest ranking.");
    } catch (err: unknown) {
      if (!isCurrentMutation()) return;
      const message = getErrorMessage(err, "Failed to update leaderboard mode.");
      setError(message);
      toast.error(message);
      // The server may have committed the PUT even if its response was lost.
      await loadStatus({ preserveError: true, quiet: true });
    } finally {
      if (isCurrentMutation()) {
        mutationInFlightRef.current = false;
        setUpdating(false);
      }
    }
  };

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-900 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">Public leaderboard</h2>
          {!loading && isFrozen !== null && (
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${isFrozen
              ? "border-amber-600/60 bg-amber-950/60 text-amber-300"
              : "border-green-700 bg-green-950/60 text-green-300"}`}>
              {isFrozen ? "FROZEN" : "LIVE"}
            </span>
          )}
        </div>
        <p className="max-w-2xl text-sm text-gray-400">
          Freezing holds the public ranking at its current snapshot. Submissions and scores continue processing; unfreezing shows the latest ranking.
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {error && isFrozen === null && (
          <button
            type="button"
            onClick={() => void loadStatus()}
            disabled={loading}
            className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:border-gray-400 disabled:opacity-50"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading || updating || isFrozen === null}
          className={`inline-flex min-w-44 items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-50 ${isFrozen
            ? "bg-green-700 hover:bg-green-600"
            : "bg-amber-700 hover:bg-amber-600"}`}
        >
          {loading || updating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isFrozen ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
          {loading ? "Loading..." : updating ? "Updating..." : isFrozen ? "Unfreeze rankings" : "Freeze rankings"}
        </button>
      </div>
    </section>
  );
};

export default LeaderboardFreezeControl;
