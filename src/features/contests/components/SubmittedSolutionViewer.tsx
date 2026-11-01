import { useState, useMemo } from 'react';
import { Copy, Check, Code2, AlertCircle } from 'lucide-react';
import { decodeBase64 } from '@/lib/base64';
import type { SubmissionDetailsResponse } from '@/services/api/contestApi';

interface SubmittedSolutionViewerProps {
  submission: SubmissionDetailsResponse | null;
  isLoading?: boolean;
}

const VERDICT_BADGE_CLASSES: Record<string, string> = {
  accepted: 'border-green-500/50 bg-green-500/10 text-green-400',
  completed: 'border-green-500/50 bg-green-500/10 text-green-400',
  wrong_answer: 'border-red-500/50 bg-red-500/10 text-red-400',
  tle: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  mle: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  rte: 'border-red-500/50 bg-red-500/10 text-red-400',
  failed_to_process: 'border-red-500/50 bg-red-500/10 text-red-400',
};

const formatVerdict = (status?: string) => {
  if (!status) return 'Submitted';
  const clean = status.replace(/_/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export const SubmittedSolutionViewer = ({
  submission,
  isLoading = false,
}: SubmittedSolutionViewerProps) => {
  const [copied, setCopied] = useState(false);

  // Decode Base64 code if encoded
  const decodedCode = useMemo(() => {
    if (!submission?.code) return '';
    return decodeBase64(submission.code);
  }, [submission?.code]);

  const handleCopy = async () => {
    if (!decodedCode) return;
    try {
      await navigator.clipboard.writeText(decodedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
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

  if (!submission || !decodedCode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black text-gray-400 font-['DM_Sans'] text-center">
        <AlertCircle className="w-10 h-10 text-gray-600 mb-3" />
        <h3 className="text-base font-semibold text-gray-300 mb-1">No Solution Submitted</h3>
        <p className="text-xs text-gray-500 max-w-xs">
          You did not submit a solution for this problem before the contest ended.
        </p>
      </div>
    );
  }

  const badgeClass =
    VERDICT_BADGE_CLASSES[submission.status] ||
    'border-gray-600 bg-gray-800 text-gray-300';

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
              {submission.score !== undefined && submission.max_score !== undefined
                ? ' (' + submission.score + '/' + submission.max_score + ' pts)'
                : ''}
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-300 hover:text-white bg-gray-800/80 hover:bg-gray-800 rounded border border-gray-700 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <div className="flex-1 overflow-auto p-4 bg-[#0d1117]">
        <pre className="font-mono text-xs sm:text-sm text-gray-200 leading-relaxed whitespace-pre font-normal">
          <code>{decodedCode}</code>
        </pre>
      </div>
    </div>
  );
};
