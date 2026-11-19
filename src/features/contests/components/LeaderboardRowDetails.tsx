import { useNavigate } from 'react-router-dom';
import { Code2, HelpCircle } from 'lucide-react';
import type { ProblemScore } from '../problem.types';
import { formatTimestamp, formatScore } from '@/lib/utils';

interface LeaderboardRowDetailsProps {
  problemScores: ProblemScore[];
  userId?: string;
  contestId?: string;
  isAdmin?: boolean;
}

export const LeaderboardRowDetails = ({
  problemScores,
  userId,
  contestId,
  isAdmin = false,
}: LeaderboardRowDetailsProps) => {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-['DM_Sans'] text-gray-400 mb-4">PROBLEM BREAKDOWN</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {problemScores.map((problemScore) => {
          const scorePercentage = problemScore.max_score > 0
            ? (problemScore.score / problemScore.max_score) * 100
            : 0;
          const type = problemScore.type;
          const isMcq = type === 'mcq';
          const isPartial = !isMcq && scorePercentage > 0 && scorePercentage < 100;

          return (
            <div
              key={problemScore.problem_id}
              className="bg-gray-900 border border-gray-700 p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                  <h5 className="text-sm font-['DM_Sans'] text-white">
                    {problemScore.problem_name}
                  </h5>
                  {type && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase font-mono border ${
                        isMcq
                          ? 'bg-purple-950/80 text-purple-300 border-purple-800/80'
                          : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                      }`}
                    >
                      {isMcq ? 'MCQ' : 'Code'}
                    </span>
                  )}
                  {isPartial && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase font-mono border bg-yellow-950/80 text-yellow-300 border-yellow-800/80">
                      Partial
                    </span>
                  )}
                </div>
                {/* Removed decorative solved/unsolved icons as requested */}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 font-['DM_Sans']">SCORE:</span>
                  <span className="font-['DM_Sans'] text-white">
                    {formatScore(problemScore.score)} / {formatScore(problemScore.max_score)}
                  </span>
                </div>

                <div className="w-full bg-gray-800 h-1">
                  <div
                    className={`h-1 transition-all ${
                      scorePercentage >= 100
                        ? 'bg-green-400'
                        : scorePercentage > 0
                        ? 'bg-yellow-400'
                        : 'bg-gray-600'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, scorePercentage))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 font-['DM_Sans'] pt-1">
                  <span title="Includes judge errors, which do not count toward the final-ranking attempt penalty">
                    SUBMISSIONS: {problemScore.attempts}
                  </span>

                  {isAdmin && contestId && userId && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/admin/contest/${contestId}/submissions?${new URLSearchParams({ userId, problemId: problemScore.problem_id })}`
                        )
                      }
                      className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors inline-flex items-center gap-1 border ${
                        isMcq
                          ? 'text-purple-400 hover:text-purple-300 border-purple-800 bg-purple-950/60 hover:border-purple-600'
                          : 'text-emerald-400 hover:text-emerald-300 border-emerald-800 bg-emerald-950/60 hover:border-emerald-600'
                      }`}
                      title="View all submissions for this problem"
                    >
                      {isMcq ? <HelpCircle size={12} /> : <Code2 size={12} />}
                      {isMcq ? 'View Submission' : 'View Code'}
                    </button>
                  )}

                  {problemScore.solved_at && (
                    <span>{formatTimestamp(problemScore.solved_at)}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
