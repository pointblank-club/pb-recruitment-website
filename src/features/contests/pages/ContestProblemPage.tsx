import { useParams, useNavigate } from 'react-router-dom';
import { useProblemDetails } from '../hooks/useProblemDetails';
import { CodeProblemView } from '../components/CodeProblemView';
import { MCQProblemView } from '../components/MCQProblemView';
import { SubmissionPanel } from '../components/SubmissionPanel';
import { useProblemSubmissions } from '../hooks/useProblemSubmissions';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const ContestProblemPage = () => {
  const { contestId, problemId } = useParams<{ contestId: string; problemId: string }>();
  const navigate = useNavigate();

  const { problem, isLoading, error } = useProblemDetails(contestId || '', problemId || '');
  const {
    activeSubmission,
    history,
    historyError,
    isHistoryLoading,
    hasMoreHistory,
    submitCode,
    submitMCQ,
    retryPolling,
    refreshHistory,
    loadMoreHistory,
  } = useProblemSubmissions(contestId || '', problemId || '');

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {problem.type === 'Code' ? (
          <CodeProblemView
            key={problem.id}
            problem={problem}
            onSubmit={submitCode}
          />
        ) : (
          <MCQProblemView
            key={problem.id}
            problem={problem}
            onSubmit={submitMCQ}
          />
        )}
      </div>
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
    </div>
  );
};
