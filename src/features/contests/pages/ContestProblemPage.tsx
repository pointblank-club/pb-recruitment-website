import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext, useLocation, Link } from 'react-router-dom';
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
  const location = useLocation();
  const {
    isContestEnded = false,
    isAuthenticated = false,
    isRegistered = false,
  } = useOutletContext<ContestOutletContext>() || {};

  // For ended contests: only registered + authenticated users see code/submissions.
  // Guests and unregistered users see ONLY the problem statement (hideIDE = true).
  const hideIDE = isContestEnded ? !(isAuthenticated && isRegistered) : !isAuthenticated;

  const { problem, isLoading, error } = useProblemDetails(contestId || '', problemId || '');

  // After the contest ends only registered users need their history: history[0] is their last submission.
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
    skip: !isAuthenticated || (isContestEnded && !isRegistered),
  });

  // Post-contest: fetch full details (including code) for the latest submission.
  // Keyed on `id:status:attempt` so a resolved verdict or a Retry triggers a refetch.
  const showOwnSubmission = isContestEnded && isAuthenticated && isRegistered;
  const latest = showOwnSubmission ? history[0] : undefined;
  const [attempt, setAttempt] = useState(0);
  const detailsKey = latest ? `${latest.id}:${latest.status}:${attempt}` : undefined;
  const retryOwnSubmission = () => {
    setAttempt((n) => n + 1);
    void refreshHistory();
  };

  const [ownSubmission, setOwnSubmission] = useState<{
    key: string;
    data?: SubmissionDetailsResponse;
    error?: string;
  }>();

  useEffect(() => {
    if (!detailsKey || !latest) return;
    let live = true;
    contestApi.getSubmissionDetails(latest.id).then(
      (data) => live && setOwnSubmission({ key: detailsKey, data }),
      (e) => live && setOwnSubmission({ key: detailsKey, error: e instanceof Error ? e.message : 'Could not load your submission.' }),
    );
    return () => { live = false; };
  }, [detailsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only use details when the key matches (prevents stale cross-user data)
  const shownSubmission = ownSubmission?.key === detailsKey ? ownSubmission : undefined;
  const isLoadingSubmission = isHistoryLoading || (!!latest && !shownSubmission);
  const submissionError = historyError || shownSubmission?.error;

  if (!contestId || !problemId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <div className="text-red-400 font-['DM_Sans']">Invalid contest or problem ID</div>
          <Button
            onClick={() => navigate('/contests')}
            variant="outline"
            className="mt-4"
          >
            Back to Contests
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-green-400 animate-spin mx-auto" />
          <div className="text-gray-400 font-['DM_Sans']">Loading problem details...</div>
        </div>
      </div>
    );
  }

  if (error || !problem) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <div className="text-red-400 font-['DM_Sans'] text-lg">
            {error || 'Failed to load problem'}
          </div>
          <p className="text-gray-400 text-sm">
            The problem could not be loaded. Please try again or contact support if the issue
            persists.
          </p>
          <div className="flex gap-3 justify-center pt-4">
            <Button
              onClick={() => navigate(`/contests/${contestId}/problems`)}
              variant="outline"
            >
              Back to Problems
            </Button>
            <Button
              onClick={() => window.location.reload()}
              className="bg-green-600 hover:bg-green-700"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const submittedOptionIndex = shownSubmission?.data?.option?.[0] ?? null;

  return (
    <div className="flex h-full min-h-[480px] flex-1 flex-col overflow-hidden">
      {/* Informational banners when contest has ended */}
      {isContestEnded && !isAuthenticated && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300">
          <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span>
            This contest has ended.{' '}
            {/* S5: pass return path so login redirects back here */}
            <Link
              to="/login"
              state={{ from: location.pathname }}
              className="text-green-400 hover:underline"
            >
              Sign in
            </Link>{' '}
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

      {/* MCQ has no side pane, so its loading/error/empty states go here (code problems use the viewer) */}
      {showOwnSubmission && problem.type === 'mcq' && (isLoadingSubmission || submissionError || history.length === 0) && (
        <div role="status" className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300">
          {isLoadingSubmission ? (
            'Loading your answer…'
          ) : submissionError ? (
            <>
              <span>Could not load your answer: {submissionError}</span>
              <button type="button" onClick={retryOwnSubmission} className="text-green-400 hover:underline">
                Retry
              </button>
            </>
          ) : (
            'You did not answer this question before the contest ended.'
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 h-full overflow-hidden">
        {problem.type === 'code' ? (
          showOwnSubmission ? (
            /* Post-contest registered view: 50/50 split */
            <div className="flex-1 flex min-h-0 h-full overflow-hidden">
              <div className="w-1/2 min-h-0 h-full border-r border-gray-700 overflow-hidden flex flex-col">
                <CodeProblemView
                  key={problem.id}
                  problem={problem}
                  hideIDE={true}
                />
              </div>
              <div className="w-1/2 min-h-0 h-full overflow-hidden flex flex-col">
                <SubmittedSolutionViewer
                  submission={shownSubmission?.data ?? null}
                  isLoading={isLoadingSubmission}
                  error={submissionError}
                  onRetry={retryOwnSubmission}
                  hasHistory={history.length > 0}
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
              hideIDE={hideIDE}
            />
          )
        ) : (
          <MCQProblemView
            key={problem.id}
            problem={problem}
            onSubmit={isAuthenticated && !isContestEnded ? submitMCQ : undefined}
            isContestEnded={isContestEnded}
            submittedOption={showOwnSubmission ? submittedOptionIndex : null}
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
