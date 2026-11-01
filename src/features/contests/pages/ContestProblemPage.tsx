import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useProblemDetails } from '../hooks/useProblemDetails';
import { CodeProblemView } from '../components/CodeProblemView';
import { MCQProblemView } from '../components/MCQProblemView';
import { SubmissionPanel } from '../components/SubmissionPanel';
import { SubmittedSolutionViewer } from '../components/SubmittedSolutionViewer';
import { useProblemSubmissions } from '../hooks/useProblemSubmissions';
import type { ContestOutletContext } from '../layouts/ContestLayout';
import { contestApi, type SubmissionDetailsResponse } from '@/services/api/contestApi';
import { AlertCircle, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const ContestProblemPage = () => {
  const { contestId, problemId } = useParams<{ contestId: string; problemId: string }>();
  const navigate = useNavigate();
  const {
    isContestEnded = false,
    isAuthenticated = false,
    isRegistered = false,
  } = useOutletContext<ContestOutletContext>() || {};

  // For ended contests: only registered + authenticated users see code/submissions.
  // Guests and unregistered users see ONLY the problem statement (hideIDE = true).
  const hideIDE = isContestEnded ? !(isAuthenticated && isRegistered) : !isAuthenticated;

  const { problem, isLoading, error } = useProblemDetails(contestId || '', problemId || '');

  // During active contest: load and poll submissions.
  // After contest ends: skip loading submission history completely to avoid redundant network calls.
  const {
    activeSubmission,
    history,
    historyError,
    isHistoryLoading,
    hasMoreHistory,
    submitCode,
    submitMCQ,
    runCode,
    retryPolling,
    refreshHistory,
    loadMoreHistory,
  } = useProblemSubmissions(contestId || '', problemId || '', {
    skip: !isAuthenticated || isContestEnded,
  });

  // State to hold the registered user's latest submitted solution details (including code)
  const [latestSubmission, setLatestSubmission] = useState<SubmissionDetailsResponse | null>(null);
  const [isLoadingSubmission, setIsLoadingSubmission] = useState(false);

  useEffect(() => {
    if (!isContestEnded || !isAuthenticated || !isRegistered || !problemId) {
      return;
    }

    const cacheKey = `submission_details_${problemId}`;

    // 1. Try reading from sessionStorage immediately (0ms, 0 network requests)
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed: SubmissionDetailsResponse = JSON.parse(cached);
        if (parsed && (parsed.code || parsed.option)) {
          setLatestSubmission(parsed);
          return;
        }
      }
    } catch {
      // sessionStorage unavailable or parse error; continue to fetch
    }

    let isMounted = true;
    setIsLoadingSubmission(true);

    // Fetch user's latest submission directly
    contestApi
      .listUserSubmissions(problemId, 0)
      .then(async (submissions) => {
        if (!isMounted) return;
        if (!submissions || submissions.length === 0) {
          setLatestSubmission(null);
          return;
        }

        const firstSub = submissions[0];
        if (firstSub.code) {
          setLatestSubmission(firstSub);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(firstSub));
          } catch {
            // ignore
          }
          return;
        }

        // Fetch full code details if not present in the list item
        try {
          const details = await contestApi.getSubmissionDetails(firstSub.id);
          if (!isMounted) return;
          setLatestSubmission(details);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(details));
          } catch {
            // ignore
          }
        } catch {
          if (isMounted) setLatestSubmission(firstSub);
        }
      })
      .catch((err) => {
        console.error('Failed to load user submission for problem:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingSubmission(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isContestEnded, isAuthenticated, isRegistered, problemId]);

  if (!contestId || !problemId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-gray-400">
          <p>Please select a problem from the list.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-green-500" />
          <p className="text-gray-400">Loading problem details...</p>
        </div>
      </div>
    );
  }

  if (error || !problem) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-red-950/20 border border-red-900/50 rounded-lg p-6 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">Failed to Load Problem</h3>
            <p className="text-sm text-gray-400">
              {error || 'Problem not found'}
            </p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="border-red-800 hover:bg-red-900/30 text-white"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Derive option index for MCQ if submitted
  const submittedOptionIndex =
    latestSubmission?.option && latestSubmission.option.length > 0
      ? latestSubmission.option[0]
      : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Informational banners when contest has ended */}
      {isContestEnded && !isAuthenticated && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300">
          <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span>
            This contest has ended.{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-green-400 hover:underline"
            >
              Sign in
            </button>{' '}
            to view your contest details.
          </span>
        </div>
      )}

      {isContestEnded && isAuthenticated && !isRegistered && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300">
          <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span>
            This contest has ended. You were not registered for this contest, so only the problem statement is visible.
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 h-full overflow-hidden">
        {problem.type === 'code' ? (
          isContestEnded && isAuthenticated && isRegistered ? (
            /* Post-contest registered view: Exactly 50/50 uniform split */
            <div className="flex-1 flex min-h-0 h-full overflow-hidden">
              <div className="w-1/2 min-h-0 h-full border-r border-gray-700 overflow-hidden flex flex-col">
                <CodeProblemView
                  key={problem.id}
                  problem={problem}
                  isContestEnded={true}
                  hideIDE={true}
                />
              </div>
              <div className="w-1/2 min-h-0 h-full overflow-hidden flex flex-col">
                <SubmittedSolutionViewer
                  submission={latestSubmission}
                  isLoading={isLoadingSubmission}
                />
              </div>
            </div>
          ) : (
            /* Active contest OR post-contest unauthenticated / unregistered */
            <CodeProblemView
              key={problem.id}
              problem={problem}
              onSubmit={isAuthenticated && !isContestEnded ? submitCode : undefined}
              onRun={isAuthenticated && !isContestEnded ? runCode : undefined}
              isContestEnded={isContestEnded}
              hideIDE={hideIDE}
            />
          )
        ) : (
          <MCQProblemView
            key={problem.id}
            problem={problem}
            onSubmit={isAuthenticated && !isContestEnded ? submitMCQ : undefined}
            isContestEnded={isContestEnded}
            submittedOption={isContestEnded && isRegistered ? submittedOptionIndex : null}
          />
        )}
      </div>

      {/* Submission panel: ONLY shown during active live contests */}
      {isAuthenticated && !isContestEnded && (
        <SubmissionPanel
          problemType={problem.type}
          activeSubmission={activeSubmission}
          history={history}
          historyError={historyError}
          isHistoryLoading={isHistoryLoading}
          hasMoreHistory={hasMoreHistory}
          onRetryPolling={retryPolling}
          onRefreshHistory={refreshHistory}
          onLoadMoreHistory={loadMoreHistory}
        />
      )}
    </div>
  );
};
