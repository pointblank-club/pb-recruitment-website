import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { contestApi, type BrowserSession, type ContestSessionStatus } from '@/services/api/contestApi';

export const useBrowserSession = (contestId: string | undefined, userId: string | undefined, enabled: boolean, status?: ContestSessionStatus) => {
  const scope = contestId && userId ? `${contestId}:${userId}` : '';
  const activation = useMemo(() => ({ scope }), [scope]);
  const [state, setState] = useState<{ activation?: typeof activation; session?: BrowserSession; error?: string }>({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const [retry, setRetry] = useState(0);
  const active = enabled && !status?.is_session_ended && !status?.is_tab_switch_terminated;
  const generation = status?.browser_session_generation;
  const serverLocked = status?.is_browser_session_terminated;
  useEffect(() => {
    if (!active || !activation.scope || !contestId || !userId || serverLocked) return;
    const previous = stateRef.current;
    if (previous.activation === activation && previous.session && !previous.error &&
      (generation === undefined || previous.session.generation >= generation)) return;
    const controller = new AbortController();
    void contestApi.startBrowserSession(contestId, userId, controller.signal).then(session => {
      if (!controller.signal.aborted) setState({ activation, session });
    }).catch(error => {
      if (controller.signal.aborted) return;
      const message = axios.isAxiosError(error) ? error.response?.data?.error || error.message : error instanceof Error ? error.message : 'Unable to verify the exam session. Please retry.';
      setState(previous => ({ ...(previous.activation === activation ? previous : {}), activation, error: message }));
    });
    return () => controller.abort();
  }, [activation, contestId, userId, active, generation, serverLocked, retry]);
  useEffect(() => {
    if (stateRef.current.activation === activation && stateRef.current.error) setRetry(value => value + 1);
  }, [activation, status]);
  const current = state.activation === activation ? state : undefined;
  const authoritative = status && (generation ?? 0) >= (current?.session?.generation ?? 0);
  const cachedLocked = current?.session?.is_terminated && (generation === undefined || generation <= current.session.generation);
  return {
    ready: !active || !scope || Boolean(current?.session && !current.error),
    locked: Boolean(active && scope && (cachedLocked || (authoritative && serverLocked))),
    error: active && scope ? current?.error : undefined,
    retry: () => { setState({ activation }); setRetry(value => value + 1); },
  };
};
