import { useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { rememberYandexReturn, yandexAccountLabel, type YandexConnection } from '@/lib/yandexConnect';
import { yandexApi, yandexErrorMessage } from '@/services/api/yandexApi';

type Variant = 'connect' | 'reconnect' | 'change';

interface YandexConnectCardProps {
  contestId: string;
  variant: Variant;
  onCancel?: () => void;
}

const COPY: Record<Variant, { text: string; action: string }> = {
  connect: { text: 'Connect your Yandex account for this contest.', action: 'Connect Yandex' },
  reconnect: { text: 'Your Yandex account needs to be reconnected.', action: 'Reconnect Yandex' },
  change: { text: 'Connect a different Yandex account.', action: 'Connect another account' },
};

export const YandexConnectCard = ({ contestId, variant, onCancel }: YandexConnectCardProps) => {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { text, action } = COPY[variant];

  const handleConnect = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      // Clicking Connect is the candidate's go-ahead; the server records it with the connection.
      const authorizeUrl = await yandexApi.startConnection(true, contestId);
      rememberYandexReturn(contestId);
      window.location.assign(authorizeUrl);
    } catch (err) {
      setError(yandexErrorMessage(err, 'Could not start Yandex sign-in. Please try again.'));
      setStarting(false);
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 mb-6 text-left ${
        variant === 'reconnect' ? 'border-yellow-500/50 bg-yellow-950/30' : 'border-gray-700 bg-black/40'
      }`}
    >
      <p className="text-sm text-gray-200">{text}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleConnect}
          disabled={starting}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-semibold bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-wait"
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ExternalLink className="w-4 h-4" aria-hidden />}
          {starting ? 'Opening Yandex…' : action}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-5 py-2.5 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

interface YandexConnectedNoteProps {
  connection: YandexConnection;
  onChange?: () => void;
}

/** One line confirming Yandex is connected, with a way to switch accounts. */
export const YandexConnectedNote = ({ connection, onChange }: YandexConnectedNoteProps) => (
  <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2.5 text-sm">
    <span className="flex items-center gap-2 text-gray-200 min-w-0">
      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" aria-hidden />
      <span className="min-w-0">
        Yandex connected as <span className="text-white font-medium break-all">{yandexAccountLabel(connection)}</span>
      </span>
    </span>
    {onChange && (
      <button type="button" onClick={onChange} className="text-xs text-gray-400 underline-offset-2 hover:text-white hover:underline">
        Change account
      </button>
    )}
  </div>
);
