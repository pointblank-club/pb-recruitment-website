import { Link } from 'react-router-dom';
import type { Problem, ProblemProgress } from '../problem.types';

interface ProblemCardProps {
  problem: Problem;
  contestId: string;
  progress?: ProblemProgress;
  index?: number;
}

const stripStyles: Record<ProblemProgress, string> = {
  unsolved: 'border-[#262C36] bg-[#161B22] hover:border-[#3B4657] hover:bg-[#1C2128]',
  attempted: 'border-amber-600/50 bg-amber-950/40 hover:border-amber-500/70 hover:bg-amber-950/60',
  judging: 'border-blue-600/50 bg-blue-950/40 hover:border-blue-500/70 hover:bg-blue-950/60',
  failed: 'border-red-600/50 bg-red-950/40 hover:border-red-500/70 hover:bg-red-950/60',
  solved: 'border-emerald-600/50 bg-emerald-950/40 hover:border-emerald-500/70 hover:bg-emerald-950/60',
  unavailable: 'border-[#262C36] bg-[#161B22] hover:border-[#3B4657] hover:bg-[#1C2128]',
};

const progressBadgeStyles: Record<ProblemProgress, string> = {
  unsolved: 'border-[#30363D] bg-[#21262D] text-[#8B949E]',
  attempted: 'border-amber-800/60 bg-amber-950/60 text-amber-300',
  judging: 'border-blue-800/60 bg-blue-950/60 text-blue-300',
  failed: 'border-red-800/60 bg-red-950/60 text-red-300',
  solved: 'border-emerald-800/60 bg-emerald-950/60 text-emerald-300',
  unavailable: 'border-[#30363D]/60 bg-[#161B22] text-[#8B949E]',
};

const progressLabels: Record<ProblemProgress, string> = {
  unsolved: 'Not Attempted',
  attempted: 'Attempted',
  judging: 'Judging',
  failed: 'Failed',
  solved: 'Solved',
  unavailable: 'Status unavailable',
};

export const ProblemCard = ({ problem, contestId, progress, index }: ProblemCardProps) => {
  const currentStripStyle =
    progress && stripStyles[progress]
      ? stripStyles[progress]
      : 'border-[#262C36] bg-[#161B22] hover:border-[#3B4657] hover:bg-[#1C2128]';

  const getDisplayName = () => {
    if (problem.type === 'mcq') {
      // Strip leading "MCQ", "MCQ 1", "MCQ:", "MCQ -", etc.
      const cleaned = problem.name.replace(/^mcq\s*[\d]*\s*[-:–.]?\s*/i, '').trim();
      if (index !== undefined) {
        return cleaned ? `${index}. ${cleaned}` : `${index}`;
      }
      return cleaned || problem.name;
    }
    if (index !== undefined) {
      const cleaned = problem.name.replace(/^(\d+|problem\s*\d+)[\.:–-]\s*/i, '').trim() || problem.name;
      return `${index}. ${cleaned}`;
    }
    return problem.name;
  };

  return (
    <Link
      to={`/contests/${contestId}/problems/${problem.id}`}
      onClick={() => {
        sessionStorage.setItem(`contest_tab_${contestId}`, problem.type);
      }}
      className={`group flex items-center justify-between w-full px-4 py-3 border transition-all ${currentStripStyle}`}
    >
      <div className="flex-1 min-w-0 pr-4">
        <h3 className="font-medium text-[#F0F6FC] text-sm sm:text-base font-['DM_Sans'] truncate group-hover:text-green-400 transition-colors">
          {getDisplayName()}
        </h3>
        <div className="text-xs text-[#8B949E] mt-0.5 font-['DM_Sans'] flex items-center gap-2">
          {problem.type === 'code' && (
            <>
              <span className="capitalize">{problem.type}</span>
              <span>•</span>
            </>
          )}
          <span>{problem.score} points</span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {progress && (
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${progressBadgeStyles[progress]}`}>
            {progressLabels[progress]}
          </span>
        )}
        <span className="text-[#8B949E] group-hover:text-[#F0F6FC] group-hover:translate-x-0.5 transition-all text-sm">
          →
        </span>
      </div>
    </Link>
  );
};
