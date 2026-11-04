import type { SubmissionStatus } from '@/services/api/contestApi';

export const VERDICT_LABELS: Record<SubmissionStatus, string> = {
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

export const PASSING_STATUSES = new Set(['accepted', 'completed', 'pass', 'passed']);
export const JUDGING_STATUSES = new Set(['pending', 'processing']);

export const formatVerdict = (status?: string) => {
  if (!status) return 'Unknown';
  return (
    VERDICT_LABELS[status as SubmissionStatus] ||
    status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
  );
};

export const getVerdictClasses = (status?: string) => {
  if (status && PASSING_STATUSES.has(status)) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
  if (status && JUDGING_STATUSES.has(status)) return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
  return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
};

export const formatSubmittedAt = (timestamp: number) => {
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(milliseconds));
};
