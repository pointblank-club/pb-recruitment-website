import { useServerClockStatus } from '@/hooks/useServerTime';
import { retryServerClock } from '@/services/api/serverClock';

export const ServerClockNotice = () => {
  const status = useServerClockStatus();
  if (status === 'synced' || status === 'unknown') return null;
  return (
    <div role={status === 'error' ? 'alert' : 'status'} className="relative z-[100] bg-gray-900 text-white px-4 py-3 text-sm">
      {status === 'error' ? <>
        Server time could not be verified. Check your connection and retry.
        <button type="button" className="ml-3 underline" onClick={retryServerClock}>Retry time sync</button>
      </> : 'Verifying server time…'}
    </div>
  );
};
