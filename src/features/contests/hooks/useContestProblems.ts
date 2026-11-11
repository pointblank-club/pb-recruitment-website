import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import type { Problem } from '../problem.types';
import { contestApi } from '@/services/api/contestApi';
import { isPermanentRequestError, jitterDelay, requestTimeout, retryAfterDelay } from '@/lib/requestPolicy';

export const useContestProblems = (contestId: string) => {
  const { user } = useAuth();
  const scope = `${contestId}:${user?.uid ?? ''}`;
  const [result, setResult] = useState<{
    scope: string;
    problems: Problem[];
    isLoading: boolean;
    error: string | null;
  }>({ scope: '', problems: [], isLoading: true, error: null });

  useEffect(() => {
    if (!contestId) return;
    const controller = new AbortController();
    let cancelTimer: (() => void) | undefined;
    let delay = 2000;
    let hasLoaded = false;
    let consecutiveErrors = 0;

    const schedule = (retryAfter = 0) => {
      cancelTimer = requestTimeout(() => { void fetchProblems(); }, Math.max(jitterDelay(delay), retryAfter));
      delay = Math.min(delay * 2, 15000);
    };
    const fetchProblems = async () => {
      try {
        const problems = await contestApi.getContestProblems(contestId, controller.signal);
        if (controller.signal.aborted) return;
        hasLoaded = true;
        consecutiveErrors = 0;
        setResult({ scope, problems, isLoading: false, error: null });
        if (problems.some((problem) => problem.progress === 'judging')) schedule();
      } catch (err) {
        if (controller.signal.aborted) return;
        consecutiveErrors += 1;
        if (hasLoaded && consecutiveErrors < 3 && !isPermanentRequestError(err)) schedule(retryAfterDelay(err));
        else setResult({
          scope, problems: [], isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch problems',
        });
      }
    };

    void fetchProblems();
    return () => {
      controller.abort();
      cancelTimer?.();
    };
  }, [contestId, scope]);

  return result.scope === scope
    ? result
    : { problems: [], isLoading: true, error: null };
};
