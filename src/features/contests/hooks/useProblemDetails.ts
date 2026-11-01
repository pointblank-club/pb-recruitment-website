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
    const fetchProblem = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await contestApi.getProblemById(contestId, problemId);
        setProblem(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load problem');
        console.error('Error fetching problem:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (contestId && problemId) {
      fetchProblem();
    }
  }, [contestId, problemId]);

  return { problem, isLoading, error };
};

