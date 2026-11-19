import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { DISABLED_YANDEX_CONNECTION, type YandexConnection } from '@/lib/yandexConnect';
import { yandexApi, yandexErrorMessage } from '@/services/api/yandexApi';

interface Options {
  /** Skip fetching entirely, e.g. while the workspace is not in use. */
  enabled?: boolean;
  /** Re-check periodically while the page is visible, so a token Yandex rejects shows up. */
  pollMs?: number;
}

interface State {
  connection: YandexConnection | null;
  loading: boolean;
  error: string | null;
}

const FOCUS_REFRESH_MIN_MS = 30_000;

/**
 * The signed-in candidate's backup Yandex connection. `connection` is null until known; it
 * stays null after a failed check, in which case the server still enforces the requirement.
 */
export const useYandexConnection = (userId: string | undefined, options: Options = {}) => {
  const { enabled = true, pollMs } = options;
  const active = Boolean(userId && enabled);
  const [state, setState] = useState<State>({ connection: null, loading: active, error: null });
  const sequenceRef = useRef(0);
  const lastFetchRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (!userId || !enabled) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++sequenceRef.current;
    lastFetchRef.current = Date.now();
    setState((prev) => ({ ...prev, loading: true }));
    yandexApi.getConnection(controller.signal).then(
      (connection) => {
        if (sequence !== sequenceRef.current || auth.currentUser?.uid !== userId) return;
        setState({ connection, loading: false, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted || sequence !== sequenceRef.current) return;
        setState((prev) => ({
          connection: prev.connection,
          loading: false,
          error: yandexErrorMessage(error, 'Could not check your Yandex backup connection.'),
        }));
      },
    );
  }, [userId, enabled]);

  useEffect(() => {
    if (!userId || !enabled) {
      sequenceRef.current++;
      controllerRef.current?.abort();
      setState({ connection: userId ? null : DISABLED_YANDEX_CONNECTION, loading: false, error: null });
      return;
    }
    setState({ connection: null, loading: true, error: null });
    refresh();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchRef.current >= FOCUS_REFRESH_MIN_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const poll = pollMs ? setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) refresh();
    }, pollMs) : undefined;

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (poll) clearInterval(poll);
      controllerRef.current?.abort();
    };
  }, [userId, enabled, pollMs, refresh]);

  return { ...state, refresh };
};
