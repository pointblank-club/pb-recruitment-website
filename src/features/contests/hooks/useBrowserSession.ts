import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { contestApi, type BrowserSession } from '@/services/api/contestApi';

export const useBrowserSession = (contestId: string | undefined, userId: string | undefined, enabled: boolean) => {
  const scope = enabled && contestId && userId ? `${contestId}:${userId}` : '';
  const activation = useMemo(() => ({ scope }), [scope]);
  const [state, setState] = useState<{ activation?: typeof activation; session?: BrowserSession; error?: string }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!activation.scope || !contestId || !userId) return;
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const session = await contestApi.startBrowserSession(contestId, userId);
        if (!cancelled) setState({ activation, session });
      } catch (error) {
        if (!cancelled) {
          const message = axios.isAxiosError(error) ? error.response?.data?.error || error.message : error instanceof Error ? error.message : 'Unable to verify the exam session. Please retry.';
          setState(previous => ({ ...(previous.activation === activation ? previous : {}), activation, error: message }));
        }
      } finally { pending = false; }
    };
    void refresh();
    const interval = setInterval(refresh, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activation, contestId, userId, retry]);
  const current = state.activation === activation ? state : undefined;
  return {
    ready: !scope || Boolean(current?.session && !current.error),
    locked: Boolean(scope && current?.session?.is_terminated),
    error: scope ? current?.error : undefined,
    retry: () => { setState({ activation }); setRetry(value => value + 1); },
  };
};
