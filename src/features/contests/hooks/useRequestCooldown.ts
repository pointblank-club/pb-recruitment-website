import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { requestTimeout, retryAfterDelay } from '@/lib/requestPolicy';

const deadlines = new Map<string, { until: number; cancel: () => void }>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useRequestCooldown = () => {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isCoolingDown = useSyncExternalStore(subscribe,
    () => (deadlines.get(uid)?.until ?? 0) > performance.now());
  const coolDown = useCallback((error: unknown) => {
    if (!mounted.current || !uid) return;
    const delay = retryAfterDelay(error);
    if (!delay) return;
    const until = performance.now() + delay;
    const previous = deadlines.get(uid);
    if (previous && previous.until >= until) return;
    previous?.cancel();
    deadlines.set(uid, { until, cancel: requestTimeout(() => {
      deadlines.delete(uid);
      emit();
    }, delay) });
    emit();
  }, [uid]);
  return { isCoolingDown, coolDown };
};
