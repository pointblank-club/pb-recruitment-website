import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProblemType } from '../problem.types';
import type { ActiveSubmission } from '../hooks/useProblemSubmissions';
import type {
  SubmissionDetailsResponse,
  SubmissionStatus,
  TestCaseResult,
} from '@/services/api/contestApi';

interface SubmissionPanelProps {
  problemType: ProblemType;
  activeSubmission: ActiveSubmission;
  history: SubmissionDetailsResponse[];
  historyError: string | null;
  isHistoryLoading: boolean;
  hasMoreHistory: boolean;
  onRetryPolling: () => void;
  onRefreshHistory: () => void;
  onLoadMoreHistory: () => void;
}

const VERDICT_LABELS: Record<SubmissionStatus, string> = {
  pending: 'Pending',
  processing: 'Judging',
  accepted: 'Accepted',
  wrong_answer: 'Wrong answer',
  tle: 'Time limit exceeded',
  mle: 'Memory limit exceeded',
  rte: 'Runtime error',
  failed_to_process: 'Compilation error',
  judge_error: 'Judge unavailable — please resubmit',
  completed: 'Completed',
  failed: 'Failed',
};

const PASSING_STATUSES = new Set(['accepted', 'completed', 'pass', 'passed']);
const JUDGING_STATUSES = new Set(['pending', 'processing']);

const formatVerdict = (status?: string) => {
  if (!status) return 'Unknown';
  return VERDICT_LABELS[status as SubmissionStatus]
    || status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
};

const getVerdictClasses = (status?: string) => {
  if (status && PASSING_STATUSES.has(status)) return 'border-green-500/40 bg-green-500/10 text-green-300';
  if (status && JUDGING_STATUSES.has(status)) return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-red-500/40 bg-red-500/10 text-red-300';
};

const formatSubmittedAt = (timestamp: number) => {
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(milliseconds));
};

const TestCaseRow = ({ result, index }: { result: TestCaseResult; index: number }) => {
  const passed = PASSING_STATUSES.has(result.status);

  return (
    <div className="grid grid-cols-[minmax(90px,1fr)_auto_auto_auto] items-center gap-3 border-t border-gray-800 px-3 py-2 text-xs">
      <span className="truncate text-gray-300" title={result.test_case_id}>
        Test case {index + 1}
      </span>
      <span className={passed ? 'text-green-300' : 'text-red-300'}>
        {passed ? 'Passed' : formatVerdict(result.status)}
      </span>
      <span className="text-gray-400">{result.runtime ?? '—'}{result.runtime !== undefined ? ' ms' : ''}</span>
      <span className="text-gray-400">{result.memory ?? '—'}{result.memory !== undefined ? ' KB' : ''}</span>
    </div>
  );
};

export const SubmissionPanel = ({
  problemType,
  activeSubmission,
  history,
  historyError,
  isHistoryLoading,
  hasMoreHistory,
  onRetryPolling,
  onRefreshHistory,
  onLoadMoreHistory,
}: SubmissionPanelProps) => {
  const details = activeSubmission.details;
  const isWaiting = activeSubmission.phase === 'submitting'
    || activeSubmission.phase === 'received'
    || activeSubmission.phase === 'polling';
  const canRetry = Boolean(activeSubmission.id)
    && (activeSubmission.phase === 'timeout' || activeSubmission.phase === 'error');
  const testCaseResults = details?.test_case_results || [];

  return (
    <section className="h-[32vh] min-h-[250px] max-h-[360px] shrink-0 border-t border-gray-700 bg-gray-950 text-white">
      <div className="grid h-full grid-cols-1 grid-rows-2 divide-y divide-gray-800 overflow-hidden lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)] lg:grid-rows-1 lg:divide-x lg:divide-y-0">
        <div className="min-h-0 overflow-y-auto p-4" aria-live="polite">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-['DM_Sans'] text-sm font-semibold text-white">Latest result</h2>
            {activeSubmission.status && (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getVerdictClasses(activeSubmission.status)}`}>
                {formatVerdict(activeSubmission.status)}
              </span>
            )}
          </div>

          {activeSubmission.phase === 'idle' ? (
            <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-gray-700 text-sm text-gray-500">
              Submit an answer to see its verdict here.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                {isWaiting ? (
                  <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-300" />
                ) : activeSubmission.phase === 'completed' && activeSubmission.status && PASSING_STATUSES.has(activeSubmission.status) ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
                ) : activeSubmission.phase === 'timeout' ? (
                  <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-100">
                    {activeSubmission.phase === 'submitting' && 'Sending submission'}
                    {activeSubmission.phase === 'received' && 'Submission received'}
                    {activeSubmission.phase === 'polling' && 'Judging in progress'}
                    {activeSubmission.phase === 'completed' && formatVerdict(activeSubmission.status)}
                    {activeSubmission.phase === 'timeout' && 'Verdict delayed'}
                    {activeSubmission.phase === 'error' && (activeSubmission.id ? 'Status check failed' : 'Submission failed')}
                  </p>
                  {activeSubmission.message && (
                    <p className="mt-1 text-xs leading-relaxed text-gray-400">{activeSubmission.message}</p>
                  )}
                  {activeSubmission.id && (
                    <p className="mt-1 truncate font-mono text-[11px] text-gray-600" title={activeSubmission.id}>
                      ID: {activeSubmission.id}
                    </p>
                  )}
                </div>
                {canRetry && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onRetryPolling}
                    className="shrink-0 text-xs text-black"
                  >
                    Check again
                  </Button>
                )}
              </div>

              {activeSubmission.phase === 'completed' && details && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded border border-gray-800 bg-black/40 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Runtime</p>
                      <p className="mt-1 text-sm text-gray-200">{details.runtime ?? '—'}{details.runtime !== undefined ? ' ms' : ''}</p>
                    </div>
                    <div className="rounded border border-gray-800 bg-black/40 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Memory</p>
                      <p className="mt-1 text-sm text-gray-200">{details.memory ?? '—'}{details.memory !== undefined ? ' KB' : ''}</p>
                    </div>
                    {details.score !== undefined && (
                      <div className="rounded border border-gray-800 bg-black/40 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500">Score</p>
                        <p className="mt-1 text-sm text-gray-200">
                          {details.score}{details.max_score !== undefined ? ` / ${details.max_score}` : ''}
                        </p>
                      </div>
                    )}
                  </div>

                  {problemType === 'Code' && (
                    <div className="overflow-hidden rounded-lg border border-gray-800 bg-black/30">
                      <div className="grid grid-cols-[minmax(90px,1fr)_auto_auto_auto] gap-3 bg-gray-900 px-3 py-2 text-[10px] uppercase tracking-wide text-gray-500">
                        <span>Case</span>
                        <span>Result</span>
                        <span>Runtime</span>
                        <span>Memory</span>
                      </div>
                      {testCaseResults.length > 0 ? (
                        testCaseResults.map((result, index) => (
                          <TestCaseRow key={result.id || result.test_case_id || index} result={result} index={index} />
                        ))
                      ) : (
                        <p className="border-t border-gray-800 px-3 py-3 text-xs text-gray-500">
                          The judge did not return per-test-case results for this submission.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col bg-black/30">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-gray-400" />
              <h2 className="font-['DM_Sans'] text-sm font-semibold">Submission history</h2>
            </div>
            <button
              type="button"
              onClick={onRefreshHistory}
              disabled={isHistoryLoading}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
              aria-label="Refresh submission history"
              title="Refresh submission history"
            >
              <RefreshCw className={`h-4 w-4 ${isHistoryLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {historyError && (
              <div className="m-3 flex items-start gap-2 rounded border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{historyError}</span>
              </div>
            )}

            {!historyError && history.length === 0 && !isHistoryLoading && (
              <p className="p-6 text-center text-sm text-gray-500">No submissions for this problem yet.</p>
            )}

            {history.map((submission) => (
              <div key={submission.id} className="flex items-center gap-3 border-b border-gray-800/80 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${getVerdictClasses(submission.status)}`}>
                      {formatVerdict(submission.status)}
                    </span>
                    <span className="truncate text-xs text-gray-400">
                      {submission.language || (submission.type === 'mcq' ? 'MCQ' : 'Code')}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-600">{formatSubmittedAt(submission.created_at)}</p>
                </div>
                <div className="shrink-0 text-right text-[11px] text-gray-500">
                  <p>{submission.runtime !== undefined ? `${submission.runtime} ms` : '—'}</p>
                  <p>{submission.memory !== undefined ? `${submission.memory} KB` : '—'}</p>
                </div>
              </div>
            ))}

            {isHistoryLoading && history.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading submissions…
              </div>
            )}

            {hasMoreHistory && (
              <div className="p-3 text-center">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isHistoryLoading}
                  onClick={onLoadMoreHistory}
                  className="text-xs text-black"
                >
                  {isHistoryLoading ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
