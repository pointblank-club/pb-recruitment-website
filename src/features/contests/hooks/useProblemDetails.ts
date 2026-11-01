import { useState, useEffect } from 'react';
import { contestApi } from '@/services/api/contestApi';
import type { Problem } from '../problem.types';

interface UseProblemDetailsResult {
  problem: Problem | null;
  isLoading: boolean;
  error: string | null;
}

export const useProblemDetails = (
  contestId: string,
  problemId: string
): UseProblemDetailsResult => {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchProblem = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await contestApi.getProblemById(contestId, problemId);
        if (isMounted) setProblem(data);
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load problem');
        console.error('Error fetching problem:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    if (contestId && problemId) {
      void fetchProblem();
    }

    return () => {
      isMounted = false;
    };
  }, [contestId, problemId]);

  return { problem, isLoading, error };
};

