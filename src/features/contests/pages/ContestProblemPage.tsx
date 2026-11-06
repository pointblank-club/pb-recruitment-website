import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useOutletContext, useLocation, Link } from 'react-router-dom';
import { useProblemDetails } from '../hooks/useProblemDetails';
import { useContestProblems } from '../hooks/useContestProblems';
import { CodeProblemView } from '../components/CodeProblemView';
import { MCQProblemView } from '../components/MCQProblemView';
import { SubmittedSolutionViewer } from '../components/SubmittedSolutionViewer';
import { useProblemSubmissions } from '../hooks/useProblemSubmissions';
import type { ContestOutletContext } from '../layouts/ContestLayout';
import { contestApi, type SubmissionDetailsResponse } from '@/services/api/contestApi';
import { AlertCircle, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'react-toastify';
import { useAuth } from '@/lib/AuthContext';
import { formatVerdict } from '../submissionUtils';

export const ContestProblemPage = () => {
  const { contestId, problemId } = useParams<{ contestId: string; problemId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const {
    isContestEnded = false,
    isAuthenticated = false,
    isRegistered = false,
  } = useOutletContext<ContestOutletContext>() || {};

  // For ended contests: only registered + authenticated users see code/submissions.
  // Guests and unregistered users see ONLY the problem statement (hideIDE = true).
  const hideIDE = isContestEnded ? !(isAuthenticated && isRegistered) : !isAuthenticated;
  const isLocked = isContestEnded;

  const { problem, isLoading, error } = useProblemDetails(contestId || '', problemId || '');
  const { problems } = useContestProblems(contestId || '');

  const mcqProblems = problems.filter((p) => p.type === 'mcq');
  const currentMcqIndex = mcqProblems.findIndex((p) => p.id === problemId);
  const prevMcq = currentMcqIndex > 0 ? mcqProblems[currentMcqIndex - 1] : null;
  const nextMcq =
    currentMcqIndex >= 0 && currentMcqIndex < mcqProblems.length - 1
      ? mcqProblems[currentMcqIndex + 1]
      : null;

  // Always run for authenticated users; skip only for guests or unregistered post-contest users.
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

  const notifiedSubmissionRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeSubmission.phase === 'completed' && activeSubmission.id && activeSubmission.status) {
      if (notifiedSubmissionRef.current === activeSubmission.id) return;
      notifiedSubmissionRef.current = activeSubmission.id;
      const verdict = formatVerdict(activeSubmission.status);
      if (activeSubmission.status === 'accepted' || activeSubmission.status === 'completed') {
        toast.success(`Submission successful: ${verdict}`);
      } else {
        toast.error(`Submission result: ${verdict}`);
      }
    } else if (activeSubmission.phase === 'error') {
      toast.error(activeSubmission.message || 'Submission failed.');
    } else if (activeSubmission.phase === 'timeout') {
      toast.info(activeSubmission.message || 'Submission saved; verdict delayed.');
    }
  }, [activeSubmission]);

  // Post-contest: fetch full details (including code) for the registered user's latest submission.
  // Also fetch details for MCQ problems so the chosen option is known during active contests.
  const [attempt, setAttempt] = useState(0);

  const isMcq = problem?.type === 'mcq';
  const showOwnSubmission = isContestEnded && isAuthenticated && isRegistered;
  const candidateLatest =
    showOwnSubmission || (isMcq && isAuthenticated && history.length > 0) ? history[0] : undefined;
  const latestHasOption = isMcq && candidateLatest?.option && candidateLatest.option.length > 0;
  const shouldFetchSubmissionDetails =
    (showOwnSubmission || (isMcq && isAuthenticated && history.length > 0)) &&
    !(isMcq && latestHasOption);
  const latest = shouldFetchSubmissionDetails ? candidateLatest : undefined;
  const detailsKey = latest ? `${problemId}:${latest.id}:${latest.status}:${attempt}` : undefined;

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
      (e) =>
        live &&
        setOwnSubmission({
          key: detailsKey,
          error: e instanceof Error ? e.message : 'Could not load your submission.',
        }),
    );
    return () => {
      live = false;
    };
  }, [detailsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownSubmission = ownSubmission?.key === detailsKey ? ownSubmission : undefined;
  const isLoadingSubmission = isHistoryLoading || (!!latest && !shownSubmission);
  const submissionError = historyError || shownSubmission?.error;

  const retryOwnSubmission = () => {
    setAttempt((n) => n + 1);
    refreshHistory();
  };

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

  // Derive option index for MCQ if submitted
  const submittedOptionIndex =
    shownSubmission?.data?.option && shownSubmission.data.option.length > 0
      ? shownSubmission.data.option[0]
      : history[0]?.option && history[0].option.length > 0
      ? history[0].option[0]
      : activeSubmission.details?.option && activeSubmission.details.option.length > 0
      ? activeSubmission.details.option[0]
      : null;

  const isHistoryResolved = !isHistoryLoading && !historyError;
  const hasSavedMcqSubmission = history.length > 0 || !!activeSubmission.id;
  const hasSubmittedMCQ =
    isMcq && (submittedOptionIndex !== null || hasSavedMcqSubmission);

  const canSubmitMCQ =
    isAuthenticated && !isLocked && isHistoryResolved && !hasSubmittedMCQ;

  const mcqSubmissionError =
    activeSubmission.phase === 'error' || activeSubmission.phase === 'timeout'
      ? activeSubmission.message || 'Could not verify verdict'
      : null;

  return (
    <div className="flex h-full min-h-[480px] flex-1 flex-col overflow-hidden">
      {/* Informational banners when contest has ended */}
      {isContestEnded && !isAuthenticated && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300 flex-shrink-0">
          <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span>
            This contest has ended.{' '}
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
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300 flex-shrink-0">
          <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span>
            This contest has ended. You were not registered for this contest, so only the problem statement is visible.
          </span>
        </div>
      )}

      {/* MCQ has no side pane, so its loading/error/empty states go here */}
      {isMcq && (
        showOwnSubmission ? (
          (isLoadingSubmission || submissionError || history.length === 0) && (
            <div role="status" className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300 flex-shrink-0">
              {isLoadingSubmission ? (
                'Loading your answer…'
              ) : submissionError ? (
                <>
                  <span>Could not load your answer: {submissionError}</span>
                  <button type="button" onClick={retryOwnSubmission} className="text-green-400 hover:underline ml-2">
                    Retry
                  </button>
                </>
              ) : (
                'You did not answer this question before the contest ended.'
              )}
            </div>
          )
        ) : (
          !isContestEnded && isAuthenticated && (
            historyError ? (
              <div role="status" className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300 flex-shrink-0">
                <span>Could not load submission history: {historyError}</span>
                <button type="button" onClick={retryOwnSubmission} className="text-green-400 hover:underline ml-2">
                  Retry
                </button>
              </div>
            ) : isHistoryLoading ? (
              <div role="status" className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300 flex-shrink-0">
                <span>Loading your answer…</span>
              </div>
            ) : hasSavedMcqSubmission && shownSubmission?.error ? (
              <div role="status" className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300 flex-shrink-0">
                <span>Could not load your answer: {shownSubmission.error}</span>
                <button type="button" onClick={retryOwnSubmission} className="text-green-400 hover:underline ml-2">
                  Retry
                </button>
              </div>
            ) : hasSavedMcqSubmission && isLoadingSubmission ? (
              <div role="status" className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 border-b border-gray-700 text-sm text-gray-300 flex-shrink-0">
                <span>Loading your answer…</span>
              </div>
            ) : null
          )
        )
      )}

      <div className="flex min-h-0 flex-1 h-full overflow-hidden">
        {problem.type === 'code' ? (
          showOwnSubmission ? (
            /* Post-contest registered view: Exactly 50/50 uniform split */
            <div className="flex-1 flex min-h-0 h-full overflow-hidden">
              <div className="w-1/2 min-h-0 h-full border-r border-gray-700 overflow-hidden flex flex-col">
                <CodeProblemView
                  key={`${user?.uid || 'guest'}_${problem.id}`}
                  problem={problem}
                  contestId={contestId}
                  isContestEnded={true}
                  hideIDE={true}
                  isLocked={true}
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
            /* Active contest CodeChef-style 2-column workspace */
            <CodeProblemView
              key={`${user?.uid || 'guest'}_${problem.id}`}
              problem={problem}
              contestId={contestId}
              onSubmit={isAuthenticated && !isLocked ? submitCode : undefined}
              onRun={isAuthenticated && !isLocked ? runCode : undefined}
              isContestEnded={isContestEnded}
              hideIDE={hideIDE}
              isLocked={isLocked}
              activeSubmission={activeSubmission}
              history={history}
              historyError={historyError}
              isHistoryLoading={isHistoryLoading}
              hasMoreHistory={hasMoreHistory}
              onRetryPolling={retryPolling}
              onRefreshHistory={refreshHistory}
              onLoadMoreHistory={loadMoreHistory}
            />
          )
        ) : (
          <MCQProblemView
            key={problem.id}
            problem={problem}
            onSubmit={canSubmitMCQ ? submitMCQ : undefined}
            submissionError={mcqSubmissionError}
            onRetryPolling={retryPolling}
            isContestEnded={isContestEnded}
            submittedOption={submittedOptionIndex}
            contestId={contestId}
            prevProblemId={prevMcq?.id}
            nextProblemId={nextMcq?.id}
            mcqIndex={currentMcqIndex >= 0 ? currentMcqIndex + 1 : undefined}
            totalMcqs={mcqProblems.length > 0 ? mcqProblems.length : undefined}
            onNavigate={(targetId) => navigate(`/contests/${contestId}/problems/${targetId}`)}
          />
        )}
      </div>
    </div>
  );
};
