import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Contest } from "@/models/contest";
import { adminApi, type PlagiarismPair } from "@/services/api/adminApi";
import { toast } from "react-toastify";

type RegistrationStatus = "upcoming" | "open" | "closed";
type RunningStatus = "upcoming" | "open" | "closed";

interface ContestManagerProps {
  contests: Contest[];
  setContests: (contests: Contest[]) => void;
}

const ContestManager: React.FC<ContestManagerProps> = ({ contests, setContests }) => {
  const navigate = useNavigate();
  const [plagiarism, setPlagiarism] = useState<Record<string, {status: string; report_url?: string; error?: string}>>({});
  const [plagiarismPairs, setPlagiarismPairs] = useState<Record<string, PlagiarismPair[]>>({});

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const ended = contests.filter((contest) => contest.end_time <= Date.now());
      const results = await Promise.all(ended.map(async (contest) => {
        try {
          const report = await adminApi.getPlagiarismReport(contest.id);
          const pairs = report.status === 'finished' ? await adminApi.getPlagiarismPairs(contest.id) : null;
          return [contest.id, report, pairs] as const;
        }
        catch { return [contest.id, null, null] as const; }
      }));
      if (active) {
        const reports: Record<string, {status: string; report_url?: string; error?: string}> = {};
        const pairsByContest: Record<string, PlagiarismPair[]> = {};
        results.forEach(([id, report, pairs]) => {
          if (report) reports[id] = report;
          if (pairs) pairsByContest[id] = pairs;
        });
        setPlagiarism((current) => ({...current, ...reports}));
        setPlagiarismPairs((current) => ({...current, ...pairsByContest}));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [contests]);

  const handlePairReview = async (contestId: string, pair: PlagiarismPair, status: PlagiarismPair['review_status']) => {
    const note = status === 'cleared' ? (window.prompt('Reason for clearing this flag:', pair.review_note ?? '') ?? null) : (status === 'confirmed' ? (window.prompt('Admin review note (optional):', pair.review_note ?? '') ?? null) : '');
    if (note === null) return;
    try {
      await adminApi.reviewPlagiarismPair(contestId, pair.key, status, note);
      setPlagiarismPairs((current) => ({...current, [contestId]: (current[contestId] ?? []).map((item) => item.key === pair.key ? {...item, review_status: status, review_note: note} : item)}));
    } catch { toast.error('Could not update plagiarism review.'); }
  };

  const getRegistrationStatus = (contest: Contest): RegistrationStatus => {
    const now = Date.now();
    if (contest.registration_start_time > now) return "upcoming";
    if (contest.registration_start_time <= now && contest.registration_end_time >= now) return "open";
    return "closed";
  };

  const getRunningStatus = (contest: Contest): RunningStatus => {
    const now = Date.now();
    if (contest.start_time > now) return "upcoming";
    if (contest.start_time <= now && contest.end_time >= now) return "open";
    return "closed";
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('en-IN');
  };

  const handleEdit = (contest: Contest) => {
    navigate(`/admin/contest/${contest.id}/edit`);
  };

  const [consolidatingId, setConsolidatingId] = useState<string | null>(null);

  const handleConsolidate = async (contestId: string) => {
    if (
      !window.confirm(
        "Grade pending MCQs and save final rankings; active contests or pending code submissions will be rejected. Proceed?"
      )
    ) {
      return;
    }

    setConsolidatingId(contestId);
    try {
      const res = await adminApi.consolidateContest(contestId, { force: false });
      toast.success(
        `Consolidation complete! Ranked ${res.participants_ranked} participants, graded ${res.mcqs_graded} MCQs.`
      );
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 409) {
          toast.error(
            `Consolidation rejected (409): ${err.response.data?.error || "Contest is still running or has pending submissions."}`
          );
        } else {
          toast.error(`Consolidation failed: ${err.response?.data?.error || err.message}`);
        }
      } else {
        toast.error(`Consolidation failed: ${err instanceof Error ? err.message : "An unexpected error occurred"}`);
      }
    } finally {
      setConsolidatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this contest?")) {
      try {
        await adminApi.deleteContest(id);
        setContests(contests.filter((c) => c.id !== id));
        toast.success("Contest deleted successfully.");
      } catch {
        toast.error("Error deleting contest. Please try again later.");
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "text-green-400";
      case "upcoming":
        return "text-blue-400";
      case "closed":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h2 className="text-2xl md:text-3xl font-bold text-green-400">Contest Management</h2>
        <button
          onClick={() => navigate('/admin/contest/create')}
          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-5 md:px-6 py-2.5 md:py-3 rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-green-500/50"
        >
          Create Contest
        </button>
      </div>

      <div className="grid gap-4">
        {contests.length === 0 ? (
          <div className="text-center py-12 bg-gray-900 rounded-lg border border-gray-800">
            <p className="text-gray-400">No contests created yet. Click "Add Contest" to create one.</p>
          </div>
        ) : (
          contests.map((contest) => {
            const regStatus = getRegistrationStatus(contest);
            const runStatus = getRunningStatus(contest);
            return (
              <div
                key={contest.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4 md:p-6 hover:border-green-500 transition-all duration-200"
              >
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-4 mb-3">
                      <h3 className="text-lg md:text-xl font-bold text-green-400 break-words">{contest.name}</h3>
                      <span className="text-sm text-gray-400 truncate">({contest.eligible_to})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
                      <div>
                        <span className="text-gray-500">Registration:</span>
                        <span className={`ml-2 font-semibold ${getStatusColor(regStatus)}`}>
                          {regStatus.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Contest:</span>
                        <span className={`ml-2 font-semibold ${getStatusColor(runStatus)}`}>
                          {runStatus.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Contest ID:</span>
                        <span className="text-gray-300 ml-2">{contest.id}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm bg-gray-800 p-4 rounded">
                      <div>
                        <p className="text-gray-500">Registration Start:</p>
                        <p className="text-gray-300">{formatTimestamp(contest.registration_start_time)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Registration End:</p>
                        <p className="text-gray-300">{formatTimestamp(contest.registration_end_time)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Contest Start:</p>
                        <p className="text-gray-300">{formatTimestamp(contest.start_time)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Contest End:</p>
                        <p className="text-gray-300">{formatTimestamp(contest.end_time)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 md:ml-4 w-full md:w-auto mt-2 md:mt-0">
                    <button
                      onClick={() => handleEdit(contest)}
                      className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(contest.id)}
                      className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors font-semibold"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => navigate(`/admin/contest/${contest.id}/problems`)}
                      className="w-full bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded transition-colors font-semibold"
                    >
                      Manage Problems
                    </button>
                    <button
                      onClick={() => navigate(`/admin/contest/${contest.id}/contestants`)}
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded transition-colors font-semibold"
                    >
                      View Contestants
                    </button>
                    <button
                      disabled={consolidatingId !== null}
                      onClick={() => handleConsolidate(contest.id)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded transition-colors font-semibold disabled:opacity-50"
                    >
                      {consolidatingId === contest.id ? "Consolidating..." : "Consolidate & Rank"}
                    </button>
                    {runStatus === "closed" && (
                      <div className="rounded bg-gray-800 px-3 py-2 text-sm text-gray-300">
                        <span>Plagiarism check: {plagiarism[contest.id]?.status ?? "pending"}</span>
                        {plagiarism[contest.id]?.report_url && (
                          <a className="ml-2 text-green-400 underline" href={plagiarism[contest.id]?.report_url} target="_blank" rel="noreferrer">Open Dolos report</a>
                        )}
                        {plagiarism[contest.id]?.error && <p className="mt-1 text-red-300">{plagiarism[contest.id]?.error}</p>}
                        {(plagiarismPairs[contest.id] ?? []).map((pair) => (
                          <div key={pair.key} className="mt-3 border-t border-gray-700 pt-3">
                            <p className="text-gray-200">{pair.left_name || pair.left_user_id} ↔ {pair.right_name || pair.right_user_id}</p>
                            <p className="text-xs text-gray-400">Similarity {(pair.similarity * 100).toFixed(1)}% · longest match {pair.longest_fragment} · overlap {pair.total_overlap} · {pair.review_status}</p>
                            {pair.review_note && <p className="text-xs text-gray-400">Review note: {pair.review_note}</p>}
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => void handlePairReview(contest.id, pair, 'cleared')} className="rounded bg-green-700 px-2 py-1 text-xs text-white">Clear flag</button>
                              <button onClick={() => void handlePairReview(contest.id, pair, 'confirmed')} className="rounded bg-red-800 px-2 py-1 text-xs text-white">Confirm flag</button>
                              <button onClick={() => void handlePairReview(contest.id, pair, 'unreviewed')} className="rounded bg-gray-700 px-2 py-1 text-xs text-white">Reset review</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ContestManager;
