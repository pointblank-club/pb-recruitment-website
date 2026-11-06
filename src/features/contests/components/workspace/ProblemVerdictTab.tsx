import React from 'react';
import { CheckCircle2, Clock3, XCircle } from 'lucide-react';
import type { TestCaseResult } from '@/services/api/contestApi';
import type { ActiveSubmission } from '../../hooks/useProblemSubmissions';
import { formatVerdict, getVerdictClasses, PASSING_STATUSES } from '../../submissionUtils';

interface ProblemVerdictTabProps {
  activeSubmission: ActiveSubmission;
  onRetryPolling?: () => void;
  compact?: boolean;
}

export const ProblemVerdictTab: React.FC<ProblemVerdictTabProps> = ({
  activeSubmission,
  onRetryPolling,
  compact = false,
}) => {
  if (activeSubmission.phase === 'idle') {
    return (
      <div className="border border-dashed border-[#1e2636] rounded-lg p-8 text-center text-xs text-slate-500 font-['DM_Sans']">
        Submit an answer to see its verdict here.
      </div>
    );
  }

  return (
    <div className={`space-y-4 font-['DM_Sans'] ${compact ? 'text-xs' : ''}`}>
      {!compact && (
        <div className="flex items-center justify-between pb-2 border-b border-[#1e2636]">
          <h2 className="text-sm font-semibold text-white">Latest Result</h2>
          {activeSubmission.status && (
            <span className={`px-2.5 py-1 rounded text-xs font-semibold border ${getVerdictClasses(activeSubmission.status)}`}>
              {formatVerdict(activeSubmission.status)}
            </span>
          )}
        </div>
      )}

      {/* Status card */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-[#0b1018] border border-[#192233]">
        {activeSubmission.status && PASSING_STATUSES.has(activeSubmission.status) ? (
          <CheckCircle2 className="w-5 h-5 text-[#10b981] shrink-0 mt-0.5" />
        ) : activeSubmission.phase === 'polling' || activeSubmission.phase === 'submitting' || activeSubmission.phase === 'received' ? (
          <div className="w-5 h-5 rounded-full border-2 border-[#10b981] border-t-transparent animate-spin shrink-0 mt-0.5" />
        ) : activeSubmission.phase === 'timeout' ? (
          <Clock3 className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            {activeSubmission.phase === 'submitting' && 'Sending submission…'}
            {activeSubmission.phase === 'received' && 'Submission received'}
            {activeSubmission.phase === 'polling' && 'Judging in progress…'}
            {activeSubmission.phase === 'completed' && formatVerdict(activeSubmission.status)}
            {activeSubmission.phase === 'timeout' && 'Verdict delayed'}
            {activeSubmission.phase === 'error' && (activeSubmission.id ? 'Could not verify verdict' : 'Submission failed')}
          </p>
          {activeSubmission.message && (
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {activeSubmission.message}
            </p>
          )}
        </div>

        {onRetryPolling && Boolean(activeSubmission.id) && (activeSubmission.phase === 'timeout' || activeSubmission.phase === 'error') && (
          <button
            type="button"
            onClick={onRetryPolling}
            className="px-2.5 py-1 text-xs rounded bg-[#141b29] text-slate-200 border border-[#243047] hover:bg-[#1e293b] hover:text-white transition-colors"
          >
            Check again
          </button>
        )}
      </div>

      {/* Execution stats: only show once judging is completed */}
      {activeSubmission.phase === 'completed' && activeSubmission.details && (
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded bg-[#0b1018] border border-[#192233]">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Runtime</span>
            <p className="text-sm font-mono text-slate-200 mt-0.5">
              {activeSubmission.details.runtime !== undefined ? `${activeSubmission.details.runtime} ms` : '—'}
            </p>
          </div>
          <div className="p-3 rounded bg-[#0b1018] border border-[#192233]">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Memory</span>
            <p className="text-sm font-mono text-slate-200 mt-0.5">
              {activeSubmission.details.memory !== undefined ? `${activeSubmission.details.memory} KB` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Test cases list */}
      {activeSubmission.details?.test_case_results && activeSubmission.details.test_case_results.length > 0 && (
        <div className="rounded border border-[#192233] bg-[#0b1018] overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 bg-[#0e1422] text-[10px] text-slate-400 uppercase font-semibold border-b border-[#192233]">
            <span>Test Case</span>
            <span>Verdict</span>
            <span>Time</span>
            <span>Memory</span>
          </div>
          <div className="divide-y divide-[#192233]">
            {activeSubmission.details.test_case_results.map((tc: TestCaseResult, idx: number) => {
              const isPass = PASSING_STATUSES.has(tc.status);
              return (
                <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 text-xs items-center">
                  <span className="text-slate-300 font-mono">Case {idx + 1}</span>
                  <span className={isPass ? 'text-[#10b981] font-medium' : 'text-rose-400 font-medium'}>
                    {isPass ? 'Passed' : formatVerdict(tc.status)}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {tc.runtime != null ? `${tc.runtime} ms` : '—'}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {tc.memory != null ? `${tc.memory} KB` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
