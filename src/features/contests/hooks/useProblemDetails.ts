import { useState, useEffect } from 'react';
import { contestApi } from '@/services/api/contestApi';
import { useAuth } from '@/lib/AuthContext';
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
  const { loading: authLoading, user } = useAuth();

  useEffect(() => {
    // Wait until Firebase auth finishes initializing before making the request.
    // Otherwise on page refresh, auth.currentUser is temporarily null, sending no Bearer token
    // to an open contest where the backend requires the user to be registered -> 403 Forbidden!
    if (authLoading) {
      return;
    }

    let isMounted = true;

    const fetchProblem = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await contestApi.getProblemById(contestId, problemId);
        if (isMounted) setProblem(data);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load problem');
          console.error('Error fetching problem:', err);
        }
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
  }, [authLoading, contestId, problemId, user]);

  return { problem, isLoading: isLoading || authLoading, error };
};
