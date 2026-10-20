import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import ContestantManager from "./components/ContestantManager";
import { adminApi, type ContestRegistration } from "@/services/api/adminApi";

interface ContestantItem {
  id: string;
  name: string;
  email: string;
  status: "Active" | "Banned" | "Hidden";
  registrationDate: string;
  score: number;
}

const AdminContestContestants: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const [contestants, setContestants] = useState<ContestantItem[]>([]);
  const [contestName, setContestName] = useState<string>("");
  const [loadedContestId, setLoadedContestId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isCancelled = false;

    const fetchData = async () => {
      if (!contestId) return;

      try {
        setLoading(true);
        setError("");
        setLoadedContestId(null);
        
        const [contest, registrations] = await Promise.all([
          adminApi.getContestById(contestId),
          adminApi.getContestRegistrations(contestId),
        ]);

        if (isCancelled) return;

        if (contest) {
          setContestName(contest.name);
        } else {
          setContestName(contestId);
        }

        const mappedContestants: ContestantItem[] = registrations.map((reg: ContestRegistration) => {
          let status: "Active" | "Banned" | "Hidden" = "Active";
          if (reg.disqualified) {
            status = "Banned";
          } else if (reg.hidden) {
            status = "Hidden";
          }

          return {
            id: reg.user_id,
            name: reg.name,
            email: reg.email,
            status,
            registrationDate: reg.registered_at 
              ? new Date(reg.registered_at * 1000).toLocaleDateString() 
              : "N/A",
            score: reg.score ?? 0,
          };
        });

        setContestants(mappedContestants);
        setLoadedContestId(contestId);
      } catch (err: unknown) {
        if (isCancelled) return;
        console.error("Error fetching contestants:", err);
        setError(err instanceof Error ? err.message : "Failed to load contestants");
        setContestants([]);
        setLoadedContestId(contestId);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [contestId]);

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
          <h1 className="text-3xl font-bold text-green-400 mb-2">View Contestants</h1>
          <p className="text-gray-400">
            Contest: <span className="text-green-400">{contestName || contestId}</span>
          </p>
        </div>

        {/* Contestant Manager */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          {loading || loadedContestId !== contestId ? (
            <p className="text-gray-400">Loading contestants...</p>
          ) : error ? (
            <p className="text-red-400">{error}</p>
          ) : (
            <ContestantManager
              key={contestId}
              contestId={contestId}
              contestants={contestants}
              setContestants={setContestants}
            />
          )}
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default AdminContestContestants;
