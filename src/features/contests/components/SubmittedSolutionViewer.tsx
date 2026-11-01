import { useState, useMemo } from 'react';
import { Copy, Check, Code2, AlertCircle, RefreshCw } from 'lucide-react';
import { decodeBase64 } from '@/lib/base64';
import { formatVerdict, getVerdictClasses } from './SubmissionPanel';
import type { SubmissionDetailsResponse } from '@/services/api/contestApi';

interface SubmittedSolutionViewerProps {
  submission: SubmissionDetailsResponse | null;
  isLoading?: boolean;
  /** Error string from the list or details fetch (network/server failure) */
  error?: string;
  /** Called when the user clicks Retry after an error */
  onRetry?: () => void;
  /** True when the history list loaded successfully (even if empty) */
  hasHistory?: boolean;
}

export const SubmittedSolutionViewer = ({
  submission,
  isLoading = false,
  error,
  onRetry,
  hasHistory = false,
}: SubmittedSolutionViewerProps) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const decodedCode = useMemo(() => {
    if (!submission?.code) return '';
    return decodeBase64(submission.code);
  }, [submission?.code]);

  const handleCopy = async () => {
    if (!decodedCode) return;
    try {
      await navigator.clipboard.writeText(decodedCode);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black text-gray-400 font-['DM_Sans']">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent mb-3" />
        <span className="text-sm">Loading your submitted solution…</span>
      </div>
    );
  }

  // B3 fix: distinguish fetch error from genuine "no submission"
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black text-gray-400 font-['DM_Sans'] text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
        <h3 className="text-base font-semibold text-gray-300 mb-1">Could Not Load Submission</h3>
        <p className="text-xs text-gray-500 max-w-xs mb-4">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // B3 fix: only show "no submission" when the history list successfully returned empty
  if (!submission || !decodedCode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black text-gray-400 font-['DM_Sans'] text-center">
        <AlertCircle className="w-10 h-10 text-gray-600 mb-3" />
        <h3 className="text-base font-semibold text-gray-300 mb-1">
          {hasHistory ? 'Code Unavailable' : 'No Solution Submitted'}
        </h3>
        <p className="text-xs text-gray-500 max-w-xs">
          {hasHistory
            ? 'Your submission was found but the code could not be retrieved.'
            : 'You did not submit a solution for this problem before the contest ended.'}
        </p>
      </div>
    );
  }

  const badgeClass = getVerdictClasses(submission.status);

  return (
    <div className="flex-1 flex flex-col h-full bg-black text-white overflow-hidden font-['DM_Sans']">
      {/* Header bar matching CodeProblemView right pane */}
      <div className="h-10 border-b border-gray-700 px-4 bg-gray-900/50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Code2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
            Your Submitted Solution
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-gray-800 text-gray-300 border border-gray-700">
            {submission.language || 'Code'}
          </span>
          {submission.status && (
            <span className={'px-2 py-0.5 rounded text-[11px] font-medium border ' + badgeClass}>
              {formatVerdict(submission.status)}
            </span>
          )}
          {onRetry && (submission.status === 'pending' || submission.status === 'processing') && (
            <button
              type="button"
              onClick={onRetry}
              aria-label="Refresh verdict"
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={handleCopy}
          type="button"
          aria-label={copyStatus === 'copied' ? 'Copied to clipboard' : copyStatus === 'failed' ? 'Copy failed' : 'Copy code'}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-300 hover:text-white bg-gray-800/80 hover:bg-gray-800 rounded border border-gray-700 transition-colors"
        >
          {copyStatus === 'copied' ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : copyStatus === 'failed' ? (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-red-400">Failed</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
        <span className="sr-only" aria-live="polite">
          {copyStatus === 'copied' ? 'Code copied to clipboard' : copyStatus === 'failed' ? 'Failed to copy code' : ''}
        </span>
      </div>

      {/* Code body */}
      <div
        className="flex-1 overflow-auto p-4 bg-[#0d1117]"
        tabIndex={0}
        role="region"
        aria-label="Submitted code"
      >
        <pre className="font-mono text-xs sm:text-sm text-gray-200 leading-relaxed whitespace-pre font-normal">
          <code>{decodedCode}</code>
        </pre>
      </div>
    </div>
  );
};
