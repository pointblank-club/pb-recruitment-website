import { useCallback, useEffect, useRef, useState } from 'react';
import { requestTimeout, retryAfterDelay } from '@/lib/requestPolicy';

export const useRequestCooldown = () => {
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const cancelTimer = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cancelTimer.current?.(), []);
  const coolDown = useCallback((error: unknown) => {
    const delay = retryAfterDelay(error);
    if (!delay) return;
    cancelTimer.current?.();
    setIsCoolingDown(true);
    cancelTimer.current = requestTimeout(() => setIsCoolingDown(false), delay);
  }, []);
  return { isCoolingDown, coolDown };
};
