import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Code2 } from 'lucide-react';
import type { LeaderboardEntry } from '../problem.types';
import { formatTimestamp } from '@/lib/utils';
import { LeaderboardRowDetails } from './LeaderboardRowDetails.tsx';
import { adminApi } from '@/services/api/adminApi';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  contestId?: string;
  isAdmin?: boolean;
}

export const LeaderboardTable = ({
  entries,
  currentUserId,
  contestId,
  isAdmin: propIsAdmin,
}: LeaderboardTableProps) => {
  const navigate = useNavigate();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [isAdminState, setIsAdminState] = useState<boolean>(propIsAdmin ?? false);

  useEffect(() => {
    if (propIsAdmin !== undefined) {
      setIsAdminState(propIsAdmin);
      return;
    }

    let cancelled = false;
    adminApi
      .checkAdminAccess()
      .then(() => {
        if (!cancelled) setIsAdminState(true);
      })
      .catch(() => {
        if (!cancelled) setIsAdminState(false);
      });

    return () => {
      cancelled = true;
    };
  }, [propIsAdmin]);

  const isAdmin = isAdminState;

  const hasProblemBreakdown = entries.some(
    (entry) => entry.problem_scores && entry.problem_scores.length > 0
  );

  const toggleExpand = (userId: string) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'text-green-400 font-bold';
    if (rank === 2) return 'text-gray-300 font-bold';
    if (rank === 3) return 'text-gray-300 font-bold';
    return 'text-gray-400';
  };

  if (entries.length === 0) {
    return (
      <div className="bg-black border border-gray-800 p-12 text-center">
        <p className="text-gray-400 text-lg font-['DM_Sans']">No participants yet</p>
      </div>
    );
  }

  return (
    <div className="bg-black border border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider font-['DM_Sans']">
                Rank
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider font-['DM_Sans']">
                Name
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider font-['DM_Sans']">
                USN
              </th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-400 uppercase tracking-wider font-['DM_Sans']">
                Solved
              </th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-400 uppercase tracking-wider font-['DM_Sans']">
                Score
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider font-['DM_Sans']">
                Last Submit
              </th>
              {hasProblemBreakdown && (
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-400 uppercase tracking-wider font-['DM_Sans']">
                  Details
                </th>
              )}
              {isAdmin && (
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-400 uppercase tracking-wider font-['DM_Sans']">
                  Code
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {entries.map((entry) => {
              const isCurrentUser = entry.user_id === currentUserId;
              const isExpanded = expandedUserId === entry.user_id;

              return (
                <>
                  <tr
                    key={entry.user_id}
                    className={`hover:bg-gray-900 transition-colors ${
                      isCurrentUser ? 'bg-gray-900' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-lg font-['DM_Sans'] ${getRankColor(entry.rank)}`}>
                        {entry.rank}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white font-['DM_Sans']">
                        {entry.username}
                        {isCurrentUser && (
                          <span className="ml-2 px-2 py-0.5 bg-green-400 text-black text-xs font-['DM_Sans']">
                            YOU
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-['DM_Sans'] text-gray-400">
                        {entry.usn}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-['DM_Sans'] text-white">
                        {entry.problems_solved}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-bold text-green-400 font-['DM_Sans']">
                        {entry.total_score}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-400 font-['DM_Sans']">
                        {(entry.last_submission_time == 0?"-":formatTimestamp(entry.last_submission_time))}
                      </span>
                    </td>
                    {hasProblemBreakdown && (
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {entry.problem_scores && entry.problem_scores.length > 0 && (
                          <button
                            onClick={() => toggleExpand(entry.user_id)}
                            className="text-green-400 hover:text-green-300 text-sm font-['DM_Sans'] border border-gray-700 px-2 py-1 hover:border-green-400 transition-colors"
                          >
                            {isExpanded ? 'HIDE' : 'VIEW'}
                          </button>
                        )}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() =>
                            navigate(
                              `/admin/contest/${contestId}/submissions?userId=${entry.user_id}`
                            )
                          }
                          className="text-emerald-400 hover:text-emerald-300 text-xs font-semibold font-['DM_Sans'] border border-emerald-700/60 bg-emerald-950/40 px-2.5 py-1 hover:border-emerald-500 transition-colors rounded inline-flex items-center gap-1.5"
                          title={`View all code submissions for ${entry.username}`}
                        >
                          <Code2 size={13} />
                          View Code
                        </button>
                      </td>
                    )}
                  </tr>
                  {isExpanded && entry.problem_scores && (
                    <tr>
                      <td colSpan={6 + (hasProblemBreakdown ? 1 : 0) + (isAdmin ? 1 : 0)} className="px-6 py-4 bg-gray-900 border-t border-gray-800">
                        <LeaderboardRowDetails
                          problemScores={entry.problem_scores}
                          userId={entry.user_id}
                          contestId={contestId}
                          isAdmin={isAdmin}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
