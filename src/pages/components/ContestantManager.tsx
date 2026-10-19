import { adminApi } from "@/services/api/adminApi";
import axios from "axios";
import React, { useState } from "react";

interface Contestant {
  id: string;
  name: string;
  email: string;
  status: "Active" | "Banned" | "Hidden";
  registrationDate: string;
  score: number;
}

interface ContestantManagerProps {
  contestId: string;
  contestants: Contestant[];
  setContestants: React.Dispatch<React.SetStateAction<Contestant[]>>;
}

const ContestantManager: React.FC<ContestantManagerProps> = ({ contestId, contestants, setContestants }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [updatingMap, setUpdatingMap] = useState<Record<string, boolean>>({});

  const contestIdRef = React.useRef(contestId);
  React.useEffect(() => {
    contestIdRef.current = contestId;
  }, [contestId]);

  const handleStatusChange = async (id: string, newStatus: "Active" | "Banned" | "Hidden") => {
    const targetContestId = contestId;
    const current = contestants.find((c) => c.id === id);
    const prevStatus = current?.status || "Active";
    if (prevStatus === newStatus) return;

    // Optimistically update ONLY this contestant
    setContestants((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
    );
    setUpdatingMap((prev) => ({ ...prev, [id]: true }));

    try {
      await adminApi.updateContestantStatus(targetContestId, id, newStatus);
    } catch (err: unknown) {
      console.error("Failed to update status:", err);
      // Only roll back if the admin is still viewing the same contest
      if (contestIdRef.current === targetContestId) {
        setContestants((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: prevStatus } : c))
        );
        let errorMsg = "An unexpected error occurred";
        if (axios.isAxiosError(err)) {
          errorMsg = err.response?.data?.error || err.message;
        } else if (err instanceof Error) {
          errorMsg = err.message;
        }
        alert(`Failed to update status: ${errorMsg}`);
      }
    } finally {
      if (contestIdRef.current === targetContestId) {
        setUpdatingMap((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
  };

  const filteredContestants = contestants.filter((contestant) => {
    const matchesSearch =
      contestant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contestant.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contestant.id.includes(searchTerm);
    const matchesStatus = filterStatus === "All" || contestant.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-green-900 text-green-300 border-green-700";
      case "Banned":
        return "bg-red-900 text-red-300 border-red-700";
      case "Hidden":
        return "bg-yellow-900 text-yellow-300 border-yellow-700";
      default:
        return "bg-gray-900 text-gray-300 border-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800/60 border border-gray-700/80 rounded-lg p-3 text-xs text-gray-400">
        💡 <span className="font-semibold text-gray-300">Note:</span> If this contest has already been consolidated, updating a contestant's moderation status requires re-running contest consolidation to recalculate and freeze the updated ranking snapshot.
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 mb-2">Search Contestants</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, or ID..."
              className="w-full bg-gray-900 border border-gray-700 rounded px-4 py-2 text-gray-300 focus:border-green-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-gray-400 mb-2">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-4 py-2 text-gray-300 focus:border-green-500 focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Hidden">Hidden</option>
              <option value="Banned">Banned</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {filteredContestants.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
            <p className="text-gray-400">No contestants found for this contest.</p>
          </div>
        ) : (
          filteredContestants.map((contestant) => (
            <div
              key={contestant.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 hover:border-green-500 transition-all duration-200"
            >
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-4 mb-3">
                    <h4 className="text-xl font-bold text-green-400">{contestant.name}</h4>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                        contestant.status
                      )}`}
                    >
                      {contestant.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p className="text-gray-300">{contestant.email}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Contestant ID:</span>
                      <p className="text-gray-300">{contestant.id}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Score:</span>
                      <p className="text-green-400 font-semibold">{contestant.score}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Registered:</span>
                      <p className="text-gray-300">{contestant.registrationDate}</p>
                    </div>
                  </div>
                </div>
                <div className="md:ml-4">
                  <label className="block text-gray-400 text-sm mb-2">Change Status</label>
                  <select
                    value={contestant.status}
                    disabled={Boolean(updatingMap[contestant.id])}
                    onChange={(e) =>
                      handleStatusChange(
                        contestant.id,
                        e.target.value as "Active" | "Banned" | "Hidden"
                      )
                    }
                    className={`bg-gray-900 border border-gray-700 rounded px-4 py-2 text-gray-300 focus:border-green-500 focus:outline-none ${updatingMap[contestant.id] ? "opacity-50 cursor-wait" : ""}`}
                  >
                    <option value="Active">Active</option>
                    <option value="Hidden">Hidden</option>
                    <option value="Banned">Banned</option>
                  </select>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ContestantManager;