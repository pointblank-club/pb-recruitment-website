import { Link } from 'react-router-dom';
import type { Problem, ProblemProgress } from '../problem.types';

interface ProblemCardProps {
  problem: Problem;
  contestId: string;
  progress?: ProblemProgress;
}

const progressColors: Record<ProblemProgress, string> = {
  unsolved: 'border-gray-600/60 bg-gray-900/60 hover:bg-gray-800/70',
  attempted: 'border-amber-600/50 bg-amber-950/40 hover:bg-amber-950/60',
  judging: 'border-blue-600/50 bg-blue-950/40 hover:bg-blue-950/60',
  failed: 'border-red-600/50 bg-red-950/40 hover:bg-red-950/60',
  solved: 'border-green-600/50 bg-green-950/40 hover:bg-green-950/60',
  unavailable: 'border-gray-700/60 bg-black hover:bg-gray-900',
};

const progressLabels: Record<ProblemProgress, string> = {
  unsolved: 'Unsolved',
  attempted: 'Attempted',
  judging: 'Judging',
  failed: 'Failed',
  solved: 'Solved',
  unavailable: 'Status unavailable',
};

export const ProblemCard = ({ problem, contestId, progress }: ProblemCardProps) => {

  return (
    <Link
      to={`/contests/${contestId}/problems/${problem.id}`}
      className={`block w-full p-4 border rounded ${progress ? progressColors[progress] : 'border-gray-300/30 bg-black hover:bg-gray-900'}`}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex-1">
          <h3 className="font-medium text-white font-['DM_Sans']">{problem.name}</h3>
          <div className="text-sm text-gray-400 mt-1 font-['DM_Sans']">
            {problem.type} • {problem.score} points
          </div>
        </div>
        <div className="flex items-center gap-3">
          {progress && <span className="rounded bg-black/40 px-2 py-1 text-xs text-gray-200">{progressLabels[progress]}</span>}
          <span className="text-gray-500">→</span>
        </div>
      </div>
    </Link>
  );
};
