import type { ProblemScore } from '../problem.types';
import { formatTimestamp } from '@/lib/utils';

interface LeaderboardRowDetailsProps {
  problemScores: ProblemScore[];
}

export const LeaderboardRowDetails = ({ problemScores }: LeaderboardRowDetailsProps) => {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-['DM_Sans'] text-gray-400 mb-4">PROBLEM BREAKDOWN</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {problemScores.map((problemScore) => {
          const scorePercentage = (problemScore.score / problemScore.max_score) * 100;

          return (
            <div
              key={problemScore.problem_id}
              className="bg-gray-900 border border-gray-700 p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <h5 className="text-sm font-['DM_Sans'] text-white flex-1">
                  {problemScore.problem_name}
                </h5>
                {/* Removed decorative solved/unsolved icons as requested */}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 font-['DM_Sans']">SCORE:</span>
                  <span className="font-['DM_Sans'] text-white">
                    {problemScore.score} / {problemScore.max_score}
                  </span>
                </div>

                <div className="w-full bg-gray-800 h-1">
                  <div
                    className={`h-1 transition-all ${
                      scorePercentage === 100
                        ? 'bg-green-400'
                        : scorePercentage > 0
                        ? 'bg-yellow-400'
                        : 'bg-gray-600'
                    }`}
                    style={{ width: `${scorePercentage}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 font-['DM_Sans']">
                  <span title="Includes judge errors, which do not count toward the final-ranking attempt penalty">SUBMISSIONS: {problemScore.attempts}</span>
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
