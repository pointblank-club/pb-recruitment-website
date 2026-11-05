import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getProblemAttempted } from '@/lib/contestStorage';
import { contestApi } from '@/services/api/contestApi';
import type { Problem, ProblemProgress } from '../problem.types';
import { ProblemAccordion } from './ProblemAccordion';

interface ProblemListProps {
  problems: Problem[];
  contestId: string;
}

const submissionProgress = async (problemId: string): Promise<ProblemProgress> => {
  let latestStatus: string | undefined;
  for (let page = 0; ; page += 1) {
    const submissions = await contestApi.listUserSubmissions(problemId, page);
    if (page === 0) latestStatus = submissions[0]?.status;
    if (submissions.some((submission) => submission.status === 'accepted' || submission.status === 'completed')) return 'solved';
    if (submissions.length < 20) break;
  }
  if (!latestStatus) return 'unsolved';
  return latestStatus === 'pending' || latestStatus === 'processing' ? 'judging' : 'failed';
};

export const ProblemList = ({ problems, contestId }: ProblemListProps) => {
  const { user } = useAuth();
  const userId = user?.uid;
  const scope = `${contestId}:${userId ?? ''}`;
  const [progress, setProgress] = useState<{
    scope: string;
    problems: Problem[];
    byId: Record<string, ProblemProgress>;
  }>({ scope: '', problems: [], byId: {} });

  useEffect(() => {
    if (!userId || problems.length === 0) return;
    let cancelled = false;
    const local: Record<string, ProblemProgress> = {};
    problems.forEach((problem) => {
      local[problem.id] = getProblemAttempted(contestId, userId, problem.id) ? 'attempted' : 'loading';
    });
    setProgress({ scope, problems, byId: local });

    void Promise.allSettled(problems.map((problem) => submissionProgress(problem.id))).then((results) => {
      if (cancelled) return;
      const byId = { ...local };
      results.forEach((result, index) => {
        const status = result.status === 'fulfilled' ? result.value : 'unavailable';
        const problemId = problems[index].id;
        byId[problemId] = local[problemId] === 'attempted' && (status === 'unsolved' || status === 'unavailable')
          ? 'attempted'
          : status;
      });
      setProgress({ scope, problems, byId });
    });
    return () => { cancelled = true; };
  }, [contestId, problems, scope, userId]);

  const byId = progress.scope === scope && progress.problems === problems ? progress.byId : {};
  return <ProblemAccordion problems={problems} contestId={contestId} progress={byId} />;
};
