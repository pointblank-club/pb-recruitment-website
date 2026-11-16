import { useEffect, useState } from 'react';
import { getServerTime, subscribeServerClock } from '@/lib/serverClock';

export const useServerTime = (): number => {
  const [now, setNow] = useState(getServerTime);
  useEffect(() => {
    const update = () => setNow(getServerTime());
    const unsubscribe = subscribeServerClock(update);
    update();
    const interval = setInterval(update, 1000);
    return () => { clearInterval(interval); unsubscribe(); };
  }, []);
  return now;
};
