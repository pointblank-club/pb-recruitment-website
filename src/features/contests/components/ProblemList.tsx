import { useAuth } from '@/lib/AuthContext';
import { getProblemAttempted } from '@/lib/contestStorage';
import type { Problem, ProblemProgress } from '../problem.types';
import { ProblemAccordion } from './ProblemAccordion';

interface ProblemListProps {
  problems: Problem[];
  contestId: string;
}

export const ProblemList = ({ problems, contestId }: ProblemListProps) => {
  const { user } = useAuth();
  const progress: Record<string, ProblemProgress> = {};
  if (user) {
    problems.forEach((problem) => {
      let status = problem.progress ?? 'unavailable';
      if ((status === 'unsolved' || status === 'unavailable') && getProblemAttempted(contestId, user.uid, problem.id)) {
        status = 'attempted';
      }
      progress[problem.id] = status;
    });
  }
  return <ProblemAccordion problems={problems} contestId={contestId} progress={progress} />;
};
