import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import { adminApi, type PlagiarismPair, type PlagiarismReport } from "@/services/api/adminApi";
import { toast } from "react-toastify";

const PAGE_SIZE = 100;
const inProgress = new Set(["pending", "processing", "queued", "running"]);

const errorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
};

const AdminContestPlagiarism: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const [contestName, setContestName] = useState("");
  const [report, setReport] = useState<PlagiarismReport | null>(null);
  const [pairs, setPairs] = useState<PlagiarismPair[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pairsMessage, setPairsMessage] = useState("");
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const sequence = useRef(0);
  const pageRef = useRef(0);
  const reportRef = useRef<PlagiarismReport | null>(null);
  pageRef.current = page;
  reportRef.current = report;

  const load = useCallback(async (requestedPage = 0) => {
    if (!contestId) return;
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    setPairsMessage("");
    try {
      const nextReport = await adminApi.getPlagiarismReport(contestId);
      if (current !== sequence.current) return;
      const groups = nextReport.reports ?? [];
      let nextPairs: PlagiarismPair[] = [];
      let nextTotal = 0;
      let nextTruncated = false;
      let message = "";
      if (groups.some((group) => group.status === "finished")) {
        try {
          const result = await adminApi.getPlagiarismPairs(contestId, requestedPage);
          nextPairs = result.pairs;
          nextTotal = result.total;
          nextTruncated = result.truncated;
        } catch (pairsError) {
          if (axios.isAxiosError(pairsError) && pairsError.response?.status === 409) {
            message = "Pairs are not ready yet. Refresh shortly.";
          } else {
            throw pairsError;
          }
        }
      } else {
        message = "No finished groups have pairs available yet.";
      }
      if (current !== sequence.current) return;
      setReport(nextReport);
      setPairs(nextPairs);
      setTotal(nextTotal);
      setTruncated(nextTruncated);
      setPairsMessage(message);
    } catch (loadError) {
      if (current !== sequence.current) return;
      setReport(null);
      setPairs([]);
      setTotal(0);
      setTruncated(false);
      setError(errorMessage(loadError));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
    }, [contestId]);

  useEffect(() => {
    if (!contestId) return;
    void Promise.all([
      adminApi.getContestById(contestId).catch(() => null),
      load(0),
    ]).then(([contest]) => setContestName(contest?.name ?? contestId));
    const timer = window.setInterval(() => {
      const currentReport = reportRef.current;
      const isRunning = inProgress.has(currentReport?.status ?? "")
        || (currentReport?.reports ?? []).some((group) => inProgress.has(group.status));
      if (isRunning) void load(pageRef.current);
    }, 30000);
    return () => {
      sequence.current += 1;
      window.clearInterval(timer);
    };
  }, [contestId, load]);

  const review = async (pair: PlagiarismPair, status: PlagiarismPair["review_status"]) => {
    const label = status === "cleared" ? "Reason for clearing this flag:" : "Admin review note (optional):";
    const note = status === "unreviewed" ? "" : window.prompt(label, pair.review_note ?? "");
    if (note === null) return;
    setSaving((current) => new Set(current).add(pair.key));
    try {
      await adminApi.reviewPlagiarismPair(contestId!, pair, status, note);
      sequence.current += 1;
      setPairs((current) => current.map((item) => item.report_id === pair.report_id && item.key === pair.key
        ? { ...item, review_status: status, review_note: note } : item));
    } catch (saveError) {
      toast.error(`Could not update plagiarism review: ${errorMessage(saveError)}`);
    } finally {
      setSaving((current) => { const next = new Set(current); next.delete(pair.key); return next; });
    }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-black text-gray-300 flex flex-col">
      <Navbar />
      <main className="container mx-auto flex-grow px-4 py-8">
        <button onClick={() => navigate("/admin")} className="mb-6 flex items-center gap-2 text-gray-400 hover:text-green-400">
          <ChevronLeft size={20} /> Back to Admin Dashboard
        </button>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-3xl font-bold text-green-400">Plagiarism review</h1><p className="text-gray-400">Contest: {contestName || contestId}</p></div>
          <button onClick={() => void load(page)} disabled={loading} className="rounded bg-gray-700 px-4 py-2 text-white disabled:opacity-50">{loading ? "Loading..." : "Refresh"}</button>
        </div>
        <p className="mb-5 text-sm text-amber-200">Pairs are candidates for review; similarity alone is not proof. Overlap metrics are measured in k-grams.</p>
        {error && <p className="mb-4 text-red-300">{error}</p>}
        {report && <section className="mb-6 rounded border border-gray-800 bg-gray-900 p-4">
          <h2 className="mb-3 font-semibold">Report status: {report.status}</h2>
          {(report.reports ?? []).length === 0 && <p className="text-sm text-gray-400">Group details are not available yet.</p>}
          <div className="space-y-2">{(report.reports ?? []).map((group, index) => <div key={`${group.problem_id}:${group.language}:${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-800 pt-2 text-sm">
            <span>{group.problem_id} / {group.language}</span><span className="text-gray-400">{group.status}</span>
            {group.report_url && <a href={group.report_url} target="_blank" rel="noreferrer" className="text-green-400 underline">Open Dolos report</a>}
            {group.error && <span className="text-red-300">{group.error}</span>}
          </div>)}</div>
          {report.error && <p className="mt-3 text-sm text-red-300">{report.error}</p>}
        </section>}
        {pairsMessage && <p className="mb-4 text-gray-400">{pairsMessage}</p>}
        {truncated && <p className="mb-4 rounded bg-amber-950 p-3 text-amber-200">The backend truncated the pair results. Open the group reports for the full evidence.</p>}
        {total > 0 && <p className="mb-3 text-sm text-gray-400">{page * PAGE_SIZE + 1}–{page * PAGE_SIZE + pairs.length} of {total}</p>}
        <section className="space-y-3">{pairs.map((pair) => <article key={`${pair.report_id}:${pair.key}`} className="rounded border border-gray-800 bg-gray-900 p-4">
          <p className="font-medium">{pair.left_name || pair.left_user_id || pair.left_file} ↔ {pair.right_name || pair.right_user_id || pair.right_file}</p>
          <p className="mt-1 text-xs text-gray-400">{pair.left_file} ↔ {pair.right_file}</p>
          <p className="mt-1 text-sm text-gray-400">Similarity {(pair.similarity * 100).toFixed(1)}% · longest match {pair.longest_fragment} k-grams · overlap {pair.total_overlap} k-grams · {pair.review_status}</p>
          {pair.review_note && <p className="mt-1 text-sm text-gray-400">Review note: {pair.review_note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">{(["cleared", "confirmed", "unreviewed"] as const).map((status) => <button key={status} disabled={saving.has(pair.key)} onClick={() => void review(pair, status)} className="rounded bg-gray-700 px-3 py-1 text-sm text-white disabled:opacity-50">{status === "cleared" ? "Clear flag" : status === "confirmed" ? "Confirm flag" : "Reset review"}</button>)}</div>
        </article>)}</section>
        {pageCount > 1 && <div className="mt-5 flex items-center justify-between"><button disabled={page === 0 || loading} onClick={() => { const next = page - 1; setPage(next); void load(next); }} className="rounded bg-gray-700 px-4 py-2 disabled:opacity-50">Previous</button><span>Page {page + 1} of {pageCount}</span><button disabled={page + 1 >= pageCount || loading} onClick={() => { const next = page + 1; setPage(next); void load(next); }} className="rounded bg-gray-700 px-4 py-2 disabled:opacity-50">Next</button></div>}
      </main>
      <Footer />
    </div>
  );
};

export default AdminContestPlagiarism;
