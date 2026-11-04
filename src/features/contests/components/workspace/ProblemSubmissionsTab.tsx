import React from 'react';
import { History, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SubmissionDetailsResponse } from '@/services/api/contestApi';
import { formatVerdict, getVerdictClasses, formatSubmittedAt } from '../../submissionUtils';

interface ProblemSubmissionsTabProps {
  history: SubmissionDetailsResponse[];
  historyError?: string | null;
  isHistoryLoading?: boolean;
  hasMoreHistory?: boolean;
  onRefreshHistory?: () => void;
  onLoadMoreHistory?: () => void;
}

export const ProblemSubmissionsTab: React.FC<ProblemSubmissionsTabProps> = ({
  history,
  historyError = null,
  isHistoryLoading = false,
  hasMoreHistory = false,
  onRefreshHistory,
  onLoadMoreHistory,
}) => {
  return (
    <div className="space-y-3 font-['DM_Sans']">
      <div className="flex items-center justify-between pb-2 border-b border-[#1e2636]">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-white">Submission History</h2>
        </div>
        {onRefreshHistory && (
          <button
            type="button"
            onClick={onRefreshHistory}
            disabled={isHistoryLoading}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#141b29] transition-colors"
            title="Refresh submission history"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isHistoryLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {historyError && (
        <div className="flex items-start gap-2 p-3 rounded bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{historyError}</span>
        </div>
      )}

      {history.length === 0 && !isHistoryLoading && (
        <div className="text-center py-12 text-slate-500 text-xs">
          No submissions for this problem yet.
        </div>
      )}

      {history.length > 0 && (
        <div className="overflow-hidden rounded border border-[#1e2636] bg-[#0b1018]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0e1422] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1e2636]">
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Score</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Memory</th>
                <th className="py-2.5 px-3">Lang</th>
                <th className="py-2.5 px-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2636]">
              {history.map((sub) => (
                <tr key={sub.id} className="hover:bg-[#141b29]/50 transition-colors">
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getVerdictClasses(sub.status)}`}>
                      {formatVerdict(sub.status)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-200 font-mono">
                    {sub.score !== undefined ? `${sub.score}` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 font-mono">
                    {sub.runtime !== undefined ? `${sub.runtime} ms` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 font-mono">
                    {sub.memory !== undefined ? `${sub.memory} KB` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                    {sub.language || 'Code'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                    {formatSubmittedAt(sub.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMoreHistory && onLoadMoreHistory && (
        <div className="text-center pt-2">
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
  );
};
