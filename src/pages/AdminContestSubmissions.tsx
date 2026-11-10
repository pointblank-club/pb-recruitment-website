import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Code2,
  Search,
  Filter,
  User,
  Clock,
  Cpu,
  Layers,
  AlertCircle,
  FileCode,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import {
  adminApi,
  type AdminProblemSummary,
  type ContestRegistration,
  type AdminSubmissionItem,
  type AdminSubmissionDetails,
} from "@/services/api/adminApi";
import { SubmittedSolutionViewer } from "@/features/contests/components/SubmittedSolutionViewer";
import type { SubmissionDetailsResponse } from "@/services/api/contestApi";
import {
  formatVerdict,
  getVerdictClasses,
  formatSubmittedAt,
} from "@/features/contests/submissionUtils";
import { toast } from "react-toastify";

const PAGE_SIZE = 200;

export default function AdminContestSubmissions() {
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Filters derived directly from URL search parameters
  const selectedUserId = searchParams.get("userId") || "";
  const selectedProblemId = searchParams.get("problemId") || "";

  // Data states
  const [contestName, setContestName] = useState<string>("");
  const [codeProblems, setCodeProblems] = useState<AdminProblemSummary[]>([]);
  const [registrations, setRegistrations] = useState<ContestRegistration[]>([]);
  const [submissions, setSubmissions] = useState<AdminSubmissionItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [submissionDetails, setSubmissionDetails] = useState<AdminSubmissionDetails | null>(null);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [participantSearch, setParticipantSearch] = useState<string>("");

  // Loading & error states
  const [isLoadingMeta, setIsLoadingMeta] = useState<boolean>(true);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState<boolean>(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string>("");
  const [metaError, setMetaError] = useState<string>("");
  const [retryCount, setRetryCount] = useState<number>(0);
  const [metaRetryCount, setMetaRetryCount] = useState<number>(0);

  // Handlers to update URL search parameters
  const handleUserChange = (userId: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (userId) {
          next.set("userId", userId);
        } else {
          next.delete("userId");
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleProblemChange = (problemId: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (problemId) {
          next.set("problemId", problemId);
        } else {
          next.delete("problemId");
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleRetryDetails = () => {
    setRetryCount((c) => c + 1);
  };

  // Reset page when route or filters change
  useEffect(() => {
    setPage(0);
  }, [contestId, selectedUserId, selectedProblemId, statusFilter]);

  // Load contest metadata, coding problems, and contestants
  useEffect(() => {
    if (!contestId) return;

    let cancelled = false;
    setIsLoadingMeta(true);
    setMetaError("");

    Promise.all([
      adminApi.getContestById(contestId),
      adminApi.getContestProblems(contestId),
      adminApi.getContestRegistrations(contestId),
    ])
      .then(([contest, allProblems, allRegistrations]) => {
        if (cancelled) return;
        setContestName(contest.name ?? contestId);
        // Only keep coding problems
        const coding = allProblems.filter((p) => p.type === "code");
        setCodeProblems(coding);
        setRegistrations(allRegistrations);
        setIsLoadingMeta(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error loading contest metadata:", err);
        setMetaError(err instanceof Error ? err.message : "Failed to load contest data.");
        setIsLoadingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contestId, metaRetryCount]);

  // Load submissions whenever contestId, selectedUserId, selectedProblemId, or page changes
  useEffect(() => {
    if (!contestId) return;

    let cancelled = false;
    setIsLoadingSubmissions(true);
    setSelectedSubmissionId(null);
    setSubmissionDetails(null);

    const params: { user_id?: string; problem_id?: string; verdict?: string; page?: number; page_size?: number } = {
      page,
      page_size: PAGE_SIZE,
    };
    if (statusFilter !== "all") params.verdict = statusFilter;
    if (selectedUserId) {
      params.user_id = selectedUserId;
    }
    if (selectedProblemId) {
      params.problem_id = selectedProblemId;
    }

    adminApi
      .getContestSubmissions(contestId, params)
      .then((res) => {
        if (cancelled) return;
        setSubmissions(res.submissions);
        setTotalCount(res.totalCount);
        setIsLoadingSubmissions(false);

        // If a submission is already selected and still exists in the new list, keep it;
        // otherwise, auto-select the first submission if available
        if (res.submissions.length > 0) {
          setSelectedSubmissionId((prev) => {
            if (!prev || !res.submissions.some((s) => s.id === prev)) {
              return res.submissions[0].id;
            }
            return prev;
          });
        } else {
          setSelectedSubmissionId(null);
          setSubmissionDetails(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load submissions:", err);
        toast.error("Failed to load submissions.");
        setIsLoadingSubmissions(false);
        setSubmissions([]);
        setTotalCount(0);
        setSelectedSubmissionId(null);
        setSubmissionDetails(null);
      });

    return () => {
      cancelled = true;
    };
  }, [contestId, selectedUserId, selectedProblemId, statusFilter, page]);

  // Load submission details when a submission is selected
  useEffect(() => {
    if (!selectedSubmissionId || !contestId) {
      setSubmissionDetails(null);
      setDetailsError("");
      setIsLoadingDetails(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDetails(true);
    setDetailsError("");
    setSubmissionDetails(null);

    adminApi
      .getSubmissionDetails(selectedSubmissionId, contestId)
      .then((details) => {
        if (cancelled) return;
        setSubmissionDetails(details);
        setSubmissions((current) => current.map((item) => item.id === details.id ? { ...item, status: details.status, runtime: details.runtime, memory: details.memory } : item));
        setDetailsError("");
        setIsLoadingDetails(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to fetch submission details:", err);
        toast.error("Failed to fetch submission details.");
        setSubmissionDetails(null);
        setDetailsError(err instanceof Error ? err.message : "Failed to fetch submission details.");
        setIsLoadingDetails(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSubmissionId, contestId, retryCount]);

  // Filtered submissions based on status
  const filteredSubmissions = submissions;

  // Clear details and selection when selection becomes invalid under current filters
  useEffect(() => {
    if (selectedSubmissionId && !filteredSubmissions.some((s) => s.id === selectedSubmissionId)) {
      setSelectedSubmissionId(null);
      setSubmissionDetails(null);
      setDetailsError("");
      setIsLoadingDetails(false);
    }
  }, [filteredSubmissions, selectedSubmissionId]);

  // Filtered participants list for dropdown/selector
  const filteredParticipants = useMemo(() => {
    if (!participantSearch) return registrations;
    const term = participantSearch.toLowerCase();
    return registrations.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        r.user_id.toLowerCase().includes(term) ||
        (r.usn && r.usn.toLowerCase().includes(term))
    );
  }, [registrations, participantSearch]);

  // Currently selected participant info
  const selectedParticipant = useMemo(() => {
    if (!selectedUserId) return null;
    return registrations.find((r) => r.user_id === selectedUserId) || null;
  }, [registrations, selectedUserId]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Active submission for code viewer: only valid if loaded ID matches selected ID
  const selectedSubmission =
    selectedSubmissionId && submissionDetails?.id === selectedSubmissionId
      ? submissionDetails
      : null;

  if (!contestId) {
    return (
      <div className="bg-black text-gray-300 min-h-screen flex flex-col items-center justify-center">
        <p className="text-red-400">Contest ID is required.</p>
      </div>
    );
  }

  if (isLoadingMeta) {
    return (
      <div className="bg-black text-gray-300 min-h-screen flex flex-col font-['DM_Sans']">
        <Navbar />
        <div className="flex-grow container mx-auto px-4 py-8 max-w-7xl flex flex-col items-center justify-center min-h-[400px]">
          <RefreshCw className="animate-spin w-8 h-8 text-green-500 mb-3" />
          <p className="text-gray-400">Loading contest data...</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="bg-black text-gray-300 min-h-screen flex flex-col font-['DM_Sans']">
      <Navbar />

      <div className="flex-grow container mx-auto px-4 py-8 max-w-7xl">
        {metaError && <div role="alert" className="mb-5 rounded border border-red-800 bg-red-950/40 p-4 text-red-300">Unable to load contest filters: {metaError} <button type="button" className="ml-3 underline" onClick={() => setMetaRetryCount((n) => n + 1)}>Retry</button></div>}
        {/* Navigation back button */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-2 text-gray-400 hover:text-green-400 transition-colors"
          >
            <ChevronLeft size={20} />
            Back to Admin Dashboard
          </button>
          <button
            onClick={() => navigate(`/admin/contest/${contestId}/contestants`)}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-green-400 transition-colors"
          >
            <User size={14} />
            View Contestants List
          </button>
        </div>

        {/* Page Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-green-400">
                Participant Submissions & Code
              </h1>
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                Coding Problems
              </span>
            </div>
            <p className="text-gray-400 mt-1">
              Contest: <span className="text-green-400 font-semibold">{contestName || contestId}</span>
            </p>
          </div>
        </div>

        {/* Filters and Controls Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 md:p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Participant selector */}
            <div>
              <label htmlFor="participant-filter" className="block text-gray-400 text-sm mb-1 font-semibold flex items-center gap-1.5">
                <User size={15} className="text-green-400" />
                Select Participant
              </label>
              <select id="participant-filter" aria-label="Select Participant"
                value={selectedUserId}
                onChange={(e) => handleUserChange(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-gray-200 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value="">— All Participants —</option>
                {filteredParticipants.map((r) => (
                  <option key={r.user_id} value={r.user_id}>
                    {r.name} ({r.email || r.usn || r.user_id.slice(0, 8)})
                  </option>
                ))}
              </select>
            </div>

            {/* Coding Problem selector */}
            <div>
              <label htmlFor="problem-filter" className="block text-gray-400 text-sm mb-1 font-semibold flex items-center gap-1.5">
                <FileCode size={15} className="text-green-400" />
                Coding Problem
              </label>
              <select id="problem-filter" aria-label="Coding Problem"
                value={selectedProblemId}
                onChange={(e) => handleProblemChange(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-gray-200 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value="">— All Coding Problems —</option>
                {codeProblems.map((prob) => (
                  <option key={prob.id} value={prob.id}>
                    {prob.name} ({prob.score} pts)
                  </option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div>
              <label htmlFor="verdict-filter" className="block text-gray-400 text-sm mb-1 font-semibold flex items-center gap-1.5">
                <Filter size={15} className="text-green-400" />
                Verdict Status
              </label>
              <select id="verdict-filter" aria-label="Verdict Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-gray-200 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value="all">All Verdicts</option>
                <option value="accepted">Accepted</option>
                <option value="wrong_answer">Wrong Answer</option>
                <option value="tle">Time Limit Exceeded</option>
                <option value="mle">Memory Limit Exceeded</option>
                <option value="rte">Runtime Error</option>
                <option value="failed_to_process">Compilation Error</option>
              </select>
            </div>
          </div>

          {/* Quick search input to filter participant list if large */}
          {registrations.length > 5 && (
            <div className="mt-4 pt-3 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Search size={14} className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Filter participant dropdown..."
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  className="bg-gray-950 border border-gray-800 rounded px-2.5 py-1 text-gray-300 text-xs w-full sm:w-64 focus:outline-none focus:border-green-500"
                />
              </div>

              {selectedParticipant && (
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Viewing participant:</span>
                  <span className="text-green-400 font-semibold">{selectedParticipant.name}</span>
                  <span className="text-gray-500">({selectedParticipant.email})</span>
                  <button
                    onClick={() => handleUserChange("")}
                    className="text-xs text-gray-400 hover:text-white underline ml-2"
                  >
                    Clear Filter
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Master-Detail Submissions Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Submissions List (5 columns) */}
          <div className="lg:col-span-5 flex flex-col space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-bold text-gray-200 flex items-center gap-2">
                <Layers size={16} className="text-green-400" />
                Submissions History
                <span className="text-xs font-mono font-normal bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                  {statusFilter !== "all"
                    ? `${totalCount} filtered`
                    : totalCount > 0
                    ? `${submissions.length} of ${totalCount}`
                    : filteredSubmissions.length}
                </span>
              </h2>
              {selectedUserId && (
                <span className="text-xs text-green-400 font-medium">All participant submissions</span>
              )}
            </div>

            {isLoadingSubmissions ? (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-10 flex flex-col items-center justify-center text-gray-400 text-sm">
                <RefreshCw className="animate-spin w-6 h-6 text-green-500 mb-2" />
                Loading submissions...
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-10 text-center text-gray-400">
                <AlertCircle className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                <p className="font-semibold text-gray-300">No submissions found</p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  {selectedUserId
                    ? "This participant hasn't made any submissions matching the selected filters."
                    : "No submissions recorded for coding problems under the current filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[750px] overflow-y-auto pr-1">
                {filteredSubmissions.map((sub) => {
                  const isSelected = sub.id === selectedSubmissionId;
                  const verdictBadgeClass = getVerdictClasses(sub.status);
                  return (
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      key={sub.id}
                      onClick={() => setSelectedSubmissionId(sub.id)}
                      className={`w-full text-left cursor-pointer rounded-lg p-3.5 border transition-all duration-150 ${
                        isSelected
                          ? "bg-gray-800/90 border-green-500 shadow-lg shadow-green-500/10"
                          : "bg-gray-900 border-gray-800 hover:border-gray-700 hover:bg-gray-850"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm text-gray-200 truncate">
                            {sub.problem_name || "Coding Problem"}
                          </h3>
                          {!selectedUserId && (
                            <p className="text-xs text-gray-400 truncate">
                              {sub.user_name || sub.user_email || sub.user_id.slice(0, 10)}
                            </p>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${verdictBadgeClass}`}
                        >
                          {formatVerdict(sub.status)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 mt-2 pt-2 border-t border-gray-800/60 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-gray-950 text-gray-400 border border-gray-800 uppercase">
                            {sub.language || "code"}
                          </span>
                          {sub.runtime > 0 && (
                            <span className="text-gray-400 flex items-center gap-0.5">
                              <Cpu size={12} />
                              {sub.runtime}ms
                            </span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-gray-400">
                          <Clock size={12} />
                          {formatSubmittedAt(sub.created_at)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-800 text-xs text-gray-400">
                <button
                  type="button"
                  disabled={page === 0 || isLoadingSubmissions}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span>
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1 || isLoadingSubmissions}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Right: Code & Execution Details Pane (7 columns) */}
          <div className="lg:col-span-7 flex flex-col space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-bold text-gray-200 flex items-center gap-2">
                <Code2 size={16} className="text-green-400" />
                Submitted Code Viewer
              </h2>
            </div>

            {!selectedSubmissionId ? (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-16 flex flex-col items-center justify-center text-gray-500 text-center min-h-[500px]">
                <Code2 className="w-12 h-12 text-gray-700 mb-3" />
                <h3 className="text-base font-semibold text-gray-400 mb-1">No Submission Selected</h3>
                <p className="text-xs text-gray-500 max-w-sm">
                  Select a submission from the list on the left to view the participant's code, language, and test case results.
                </p>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
                {/* Submission Metadata Header */}
                {selectedSubmission && (
                  <div className="p-4 bg-gray-950 border-b border-gray-800">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-lg font-bold text-white">
                            {selectedSubmission.problem_name}
                          </h3>
                          <span
                            className={`px-2.5 py-0.5 rounded text-xs font-semibold border ${getVerdictClasses(
                              selectedSubmission.status
                            )}`}
                          >
                            {formatVerdict(selectedSubmission.status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mt-1.5">
                          <span>
                            Participant:{" "}
                            <strong className="text-gray-200">
                              {selectedSubmission.user_name || "Unknown"}
                            </strong>{" "}
                            ({selectedSubmission.user_email || selectedSubmission.user_id})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="bg-gray-800 text-gray-300 px-2.5 py-1 rounded border border-gray-700 uppercase font-semibold">
                          {selectedSubmission.language}
                        </span>
                        {selectedSubmission.runtime > 0 && (
                          <span className="bg-gray-800 text-gray-300 px-2.5 py-1 rounded border border-gray-700">
                            {selectedSubmission.runtime} ms
                          </span>
                        )}
                        {selectedSubmission.memory > 0 && (
                          <span className="bg-gray-800 text-gray-300 px-2.5 py-1 rounded border border-gray-700">
                            {Math.round(selectedSubmission.memory / 1024)} MB
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 text-[11px] text-gray-500 flex items-center justify-between font-mono">
                      <span>Submission ID: {selectedSubmission.id}</span>
                      <span>Submitted: {formatSubmittedAt(selectedSubmission.created_at)}</span>
                    </div>
                  </div>
                )}

                {/* Reused Solution Viewer */}
                <div className="min-h-[300px] flex flex-col">
                  <SubmittedSolutionViewer
                    submission={
                      selectedSubmission
                        ? (selectedSubmission as unknown as SubmissionDetailsResponse)
                        : null
                    }
                    isLoading={isLoadingDetails}
                    error={detailsError}
                    onRetry={handleRetryDetails}
                    hasHistory={Boolean(selectedSubmissionId)}
                  />
                </div>

                {/* Test Cases Results Section */}
                {selectedSubmission?.test_case_results && selectedSubmission.test_case_results.length > 0 && (
                  <div className="p-4 bg-gray-950 border-t border-gray-800">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-green-400" />
                        Test Case Results (
                        {selectedSubmission.test_case_results.filter((tc) => tc.status === "pass").length} /{" "}
                        {selectedSubmission.test_case_results.length} Passed)
                      </h4>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {selectedSubmission.test_case_results.map((tc, idx) => {
                        const isPass = tc.status === "pass";
                        return (
                          <div
                            key={tc.id || idx}
                            className={`p-2 rounded border text-xs font-mono flex items-center justify-between ${
                              isPass
                                ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                                : "bg-rose-950/40 border-rose-800/60 text-rose-300"
                            }`}
                          >
                            <span className="font-semibold flex items-center gap-1.5">
                              {isPass ? (
                                <CheckCircle2 size={13} className="text-emerald-400" />
                              ) : (
                                <XCircle size={13} className="text-rose-400" />
                              )}
                              Case {tc.test_case_id || idx + 1}
                            </span>
                            <span className="text-[11px] opacity-80 uppercase">
                              {tc.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
