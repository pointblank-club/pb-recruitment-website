import type { ProblemScore } from '../problem.types';
import { formatScore } from '@/lib/utils';

interface LeaderboardRowDetailsProps {
  problemScores: ProblemScore[];
}

export const LeaderboardRowDetails = ({ problemScores }: LeaderboardRowDetailsProps) => (
  <div className="space-y-4 font-['DM_Sans']">
    <h4 className="text-sm text-gray-400">DSA QUESTIONS</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {problemScores.filter((problem) => problem.type === 'code').map((problem) => {
        const result = problem.solved_at != null
          ? 'Solved'
          : problem.score > 0
          ? 'Partially Solved'
          : problem.attempts > 0
          ? 'Wrong Answer'
          : 'Not Attempted';
        const resultColor = result === 'Solved'
          ? 'text-green-400'
          : result === 'Partially Solved'
          ? 'text-yellow-400'
          : result === 'Wrong Answer'
          ? 'text-red-400'
          : 'text-gray-400';
        const passed = problem.test_cases_passed;
        const total = problem.total_test_cases;
        const hasTestCases = passed !== undefined && total !== undefined &&
          Number.isSafeInteger(passed) && Number.isSafeInteger(total) &&
          total > 0 && passed >= 0 && passed <= total;

        return (
          <div key={problem.problem_id} className="bg-gray-900 border border-gray-700 p-4 space-y-3">
            <h5 className="text-sm text-white break-words">{problem.problem_name}</h5>
            <p className="text-sm text-white">
              {formatScore(problem.score)} / {formatScore(problem.max_score)} points
            </p>
            <p className={`text-sm font-semibold ${resultColor}`}>{result}</p>
            {result === 'Partially Solved' && hasTestCases && (
              <p className="text-xs text-gray-400">
                Test cases: {passed} / {total} passed · {total - passed} failed
              </p>
            )}
          </div>
        );
      })}
    </div>
  </div>
);
