import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import ProblemManager from "./components/ProblemManager";
import { adminApi, type AdminProblemSummary } from "@/services/api/adminApi";

const AdminContestProblems: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const [problems, setProblems] = useState<AdminProblemSummary[]>([]);
  const [contestName, setContestName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadPage = useCallback(async () => {
    if (!contestId) return;

    setIsLoading(true);
    setLoadError("");

    const [contestResult, problemsResult] = await Promise.allSettled([
      adminApi.getContestById(contestId),
      adminApi.getContestProblems(contestId),
    ]);

    if (contestResult.status === "fulfilled" && contestResult.value) {
      setContestName(contestResult.value.name);
    } else {
      setContestName(contestId);
    }

    if (problemsResult.status === "fulfilled") {
      setProblems(problemsResult.value);
    } else {
      setProblems([]);
      setLoadError("Existing problems could not be loaded. You can retry or create a new problem.");
    }

    setIsLoading(false);
  }, [contestId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handleProblemSaved = (problem: AdminProblemSummary) => {
    setProblems((current) => {
      const exists = current.some((item) => item.id === problem.id);
      return exists
        ? current.map((item) => item.id === problem.id ? problem : item)
        : [...current, problem];
    });
    setLoadError("");
  };

  const handleProblemDeleted = (problemId: string) => {
    setProblems((current) => current.filter((problem) => problem.id !== problemId));
  };

  if (!contestId) {
    return (
      <div className="bg-black text-gray-300 min-h-screen flex flex-col items-center justify-center">
        <p className="text-red-400">Contest ID is required</p>
      </div>
    );
  }

  return (
    <div className="bg-black text-gray-300 min-h-screen flex flex-col">
      <Navbar />
      
      <div className="flex-grow container mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => navigate("/admin")}
          className="flex items-center gap-2 text-gray-400 hover:text-green-400 mb-6 transition-colors"
        >
          <ChevronLeft size={20} />
          Back to Admin Dashboard
        </button>

        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-green-400 mb-2">Manage Problems</h1>
          <p className="text-gray-400">
            Contest: <span className="text-green-400">{contestName || contestId}</span>
          </p>
        </div>

        {loadError && (
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-yellow-700 bg-yellow-950/40 p-4 text-yellow-200 sm:flex-row sm:items-center sm:justify-between">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => void loadPage()}
              className="rounded bg-yellow-700 px-4 py-2 font-semibold text-white hover:bg-yellow-600"
            >
              Retry
            </button>
          </div>
        )}

        {/* Problem Manager */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          {isLoading ? (
            <p className="py-8 text-center text-gray-400">Loading problems...</p>
          ) : (
            <ProblemManager
              contestId={contestId}
              problems={problems}
              onProblemSaved={handleProblemSaved}
              onProblemDeleted={handleProblemDeleted}
            />
          )}
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default AdminContestProblems;
