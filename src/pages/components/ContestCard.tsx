import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import type { Contest } from "@/models/contest";

interface ContestCardProps {
  contest: Contest;
  onClick: () => void;
}

const ContestCard: React.FC<ContestCardProps> = ({ contest, onClick }) => {
  const navigate = useNavigate();
  const eligibleYearsText = contest.formatEligibleYears();

  return (
    <motion.div
      whileHover={{ y: -8, boxShadow: "0 20px 40px rgba(34, 197, 94, 0.1)" }}
      onClick={onClick}
      className="group relative w-full bg-black border border-gray-700 rounded-xl p-6 hover:border-green-500/50 transition-all duration-300 cursor-pointer overflow-hidden"
    >
      {/* Gradient background on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/0 to-green-500/0 group-hover:from-green-500/5 group-hover:to-transparent transition-all duration-300 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl md:text-2xl font-anton text-beige mb-2 group-hover:text-green-400 transition-colors">
              {contest.name}
            </h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-gray-300 text-sm md:text-base mb-4 line-clamp-2">
          {contest.description}
        </p>

        {/* Time details */}
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm border-t border-gray-700 pt-4">
          <div>
            <p className="text-gray-400 text-xs mb-1">Start Time</p>
            <p className="text-green-400 font-semibold">{new Date(contest.start_time).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">End Time</p>
            <p className="text-red-400 font-semibold">{new Date(contest.end_time).toLocaleString()}</p>
          </div>
        </div>

        {/* Eligibility */}
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Eligible Years:</span>
          <span className="text-green-400 font-medium">
            {eligibleYearsText}
          </span>
        </div>

        {/* Call to action buttons */}
        <div className="flex items-center gap-3 mt-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${
              contest.isRegistrationOpen()
                ? "bg-green text-black hover:bg-green-600"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
            disabled={!contest.isRegistrationOpen()}
          >
            {contest.isRegistrationOpen() ? "Register" : "Registration Closed"}
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/contests/${contest.id}/leaderboard`);
            }}
            className="py-2 px-3 rounded-lg border border-gray-700 bg-gray-900 text-gray-300 hover:text-white hover:border-gray-500 transition-all text-sm font-semibold flex items-center gap-1.5"
            title="View Contest Leaderboard"
          >
            <Trophy size={16} className="text-yellow-400" />
            Leaderboard
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

export default ContestCard;
