import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  contestApi,
  type SubmissionDetailsResponse,
  type SubmissionResponse,
  type SubmissionStatus,
  type SubmissionType,
} from '@/services/api/contestApi';

const FIRST_POLL_DELAY_MS = 1000;
const MAX_POLL_DELAY_MS = 5000;
const POLL_TIMEOUT_MS = 60_000;
const HISTORY_PAGE_SIZE = 20;

export type SubmissionPhase =
  | 'idle'
  | 'submitting'
  | 'received'
  | 'polling'
  | 'completed'
  | 'timeout'
  | 'error';

export interface ActiveSubmission {
  id?: string;
  phase: SubmissionPhase;
  status?: SubmissionStatus;
  details?: SubmissionDetailsResponse;
  message?: string;
}

interface SubmissionMetadata {
  type: SubmissionType;
  language?: string;
}

const wait = (delay: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, delay);
});

const isJudging = (status: SubmissionStatus) => (
  status === 'pending' || status === 'processing'
);

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.error;
    if (typeof responseMessage === 'string') return responseMessage;
    if (error.message) return error.message;
  }

  return error instanceof Error ? error.message : fallback;
};

const mergeSubmissions = (
  primary: SubmissionDetailsResponse[],
  secondary: SubmissionDetailsResponse[],
) => {
  const byId = new Map(secondary.map((submission) => [submission.id, submission]));
  primary.forEach((submission) => byId.set(submission.id, submission));
  return Array.from(byId.values()).sort((left, right) => right.created_at - left.created_at);
};

export const useProblemSubmissions = (contestId: string, problemId: string) => {
  const [activeSubmission, setActiveSubmission] = useState<ActiveSubmission>({ phase: 'idle' });
  const [history, setHistory] = useState<SubmissionDetailsResponse[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const pollTokenRef = useRef(0);
  const historyRequestRef = useRef(0);
  const scopeTokenRef = useRef(0);

  const refreshHistory = useCallback(async () => {
    if (!problemId) return;

    const requestId = ++historyRequestRef.current;
    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const submissions = await contestApi.listUserSubmissions(problemId, 0);
      if (requestId !== historyRequestRef.current) return;
      setHistory(submissions);
      setHistoryPage(0);
      setHasMoreHistory(submissions.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      if (requestId !== historyRequestRef.current) return;
      setHistoryError(getErrorMessage(error, 'Could not load submission history.'));
    } finally {
      if (requestId === historyRequestRef.current) setIsHistoryLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    const scopeToken = ++scopeTokenRef.current;
    pollTokenRef.current += 1;
    setActiveSubmission({ phase: 'idle' });
    setHistory([]);
    setHistoryPage(0);
    setHasMoreHistory(false);
    setHistoryError(null);

    void refreshHistory();

    return () => {
      pollTokenRef.current += 1;
      historyRequestRef.current += 1;
      if (scopeTokenRef.current === scopeToken) scopeTokenRef.current += 1;
    };
  }, [problemId, refreshHistory]);

  const loadMoreHistory = useCallback(async () => {
    if (!problemId || isHistoryLoading || !hasMoreHistory) return;

    const nextPage = historyPage + 1;
    const requestId = ++historyRequestRef.current;
    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const submissions = await contestApi.listUserSubmissions(problemId, nextPage);
      if (requestId !== historyRequestRef.current) return;
      setHistory((current) => mergeSubmissions(current, submissions));
      setHistoryPage(nextPage);
      setHasMoreHistory(submissions.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      if (requestId !== historyRequestRef.current) return;
      setHistoryError(getErrorMessage(error, 'Could not load more submissions.'));
    } finally {
      if (requestId === historyRequestRef.current) setIsHistoryLoading(false);
    }
  }, [hasMoreHistory, historyPage, isHistoryLoading, problemId]);

  const pollSubmission = useCallback(async (summary: SubmissionDetailsResponse) => {
    const pollToken = ++pollTokenRef.current;
    const startedAt = Date.now();
    let delay = FIRST_POLL_DELAY_MS;
    let consecutiveErrors = 0;

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await wait(delay);
      if (pollToken !== pollTokenRef.current) return;

      try {
        const statusResponse = await contestApi.getSubmissionStatus(summary.id);
        if (pollToken !== pollTokenRef.current) return;

        consecutiveErrors = 0;
        const status = statusResponse.status;

        setActiveSubmission((current) => current.id === summary.id
          ? {
              ...current,
              phase: isJudging(status) ? 'polling' : 'completed',
              status,
              message: isJudging(status) ? 'Judging your submission…' : undefined,
              details: current.details ? { ...current.details, status } : summary,
            }
          : current);
        setHistory((current) => current.map((submission) => (
          submission.id === summary.id ? { ...submission, status } : submission
        )));

        if (!isJudging(status)) {
          let details: SubmissionDetailsResponse = {
            ...summary,
            status,
            score: statusResponse.score,
            max_score: statusResponse.max_score,
          };
          let detailsMessage: string | undefined;

          try {
            const response = await contestApi.getSubmissionDetails(summary.id);
            details = {
              ...response,
              id: response.id || summary.id,
              status,
              score: response.score ?? statusResponse.score,
              max_score: response.max_score ?? statusResponse.max_score,
            };
          } catch (error) {
            detailsMessage = `Verdict received, but result details could not be loaded: ${getErrorMessage(
              error,
              'unknown error',
            )}`;
          }

          if (pollToken !== pollTokenRef.current) return;
          setActiveSubmission({
            id: summary.id,
            phase: 'completed',
            status,
            details,
            message: detailsMessage || statusResponse.error_message || details.error_message,
          });
          setHistory((current) => mergeSubmissions([details], current));
          void refreshHistory();
          return;
        }
      } catch (error) {
        if (pollToken !== pollTokenRef.current) return;
        consecutiveErrors += 1;

        if (consecutiveErrors >= 3) {
          setActiveSubmission((current) => current.id === summary.id
            ? {
                ...current,
                phase: 'error',
                message: `We could not check this submission's verdict: ${getErrorMessage(
                  error,
                  'status check failed',
                )}`,
              }
            : current);
          return;
        }

        setActiveSubmission((current) => current.id === summary.id
          ? { ...current, message: 'Verdict check failed. Retrying…' }
          : current);
      }

      delay = Math.min(Math.round(delay * 1.6), MAX_POLL_DELAY_MS);
    }

    if (pollToken !== pollTokenRef.current) return;
    setActiveSubmission((current) => current.id === summary.id
      ? {
          ...current,
          phase: 'timeout',
          message: 'Judging is taking longer than expected. Your submission was saved; you can check again.',
        }
      : current);
  }, [refreshHistory]);

  const submit = useCallback(async (
    createSubmission: () => Promise<SubmissionResponse>,
    metadata: SubmissionMetadata,
  ) => {
    const scopeToken = scopeTokenRef.current;
    pollTokenRef.current += 1;
    setActiveSubmission({
      phase: 'submitting',
      status: 'pending',
      message: 'Sending your submission…',
    });

    try {
      const response = await createSubmission();
      if (scopeToken !== scopeTokenRef.current) return;

      const summary: SubmissionDetailsResponse = {
        id: response.submission_id,
        contest_id: contestId,
        problem_id: problemId,
        type: metadata.type,
        language: metadata.language,
        status: 'pending',
        created_at: Math.floor(Date.now() / 1000),
      };

      setActiveSubmission({
        id: response.submission_id,
        phase: 'received',
        status: 'pending',
        details: summary,
        message: 'Submission received. Waiting for the judge…',
      });
      setHistory((current) => mergeSubmissions([summary], current));
      void pollSubmission(summary);
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;

      setActiveSubmission({
        phase: 'error',
        message: `Submission failed: ${getErrorMessage(error, 'Please try again.')}`,
      });
      throw error;
    }
  }, [contestId, pollSubmission, problemId]);

  const submitCode = useCallback((code: string, language: string) => (
    submit(
      () => contestApi.submitCodeSolution(contestId, problemId, code, language),
      { type: 'code', language },
    )
  ), [contestId, problemId, submit]);

  const submitMCQ = useCallback((selectedOption: number) => (
    submit(
      () => contestApi.submitMCQAnswer(contestId, problemId, selectedOption),
      { type: 'mcq' },
    )
  ), [contestId, problemId, submit]);

  const retryPolling = useCallback(() => {
    if (!activeSubmission.id || !activeSubmission.details) return;
    setActiveSubmission((current) => ({
      ...current,
      phase: 'received',
      message: 'Checking the judge again…',
    }));
    void pollSubmission(activeSubmission.details);
  }, [activeSubmission.details, activeSubmission.id, pollSubmission]);

  const displayedHistory = useMemo(() => {
    if (!activeSubmission.id || !activeSubmission.details) return history;

    const activeDetails = {
      ...activeSubmission.details,
      status: activeSubmission.status || activeSubmission.details.status,
    };
    return mergeSubmissions([activeDetails], history);
  }, [activeSubmission.details, activeSubmission.id, activeSubmission.status, history]);

  return {
    activeSubmission,
    history: displayedHistory,
    historyError,
    isHistoryLoading,
    hasMoreHistory,
    submitCode,
    submitMCQ,
    retryPolling,
    refreshHistory,
    loadMoreHistory,
  };
};
