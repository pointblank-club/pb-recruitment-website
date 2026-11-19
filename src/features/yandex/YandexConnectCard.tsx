import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import {
  detectInAppBrowser,
  rememberYandexReturn,
  yandexAccountLabel,
  type YandexConnection,
} from '@/lib/yandexConnect';
import { yandexApi, yandexErrorMessage } from '@/services/api/yandexApi';

type Variant = 'connect' | 'reconnect' | 'change';

interface YandexConnectCardProps {
  contestId: string;
  connection: YandexConnection;
  variant: Variant;
  onCancel?: () => void;
}

const PRIVACY_POINTS = [
  'We register you for the backup contest on Yandex Contest.',
  'Every solution you submit here is also submitted there from your Yandex account.',
  'We store your Yandex login, email and access token (encrypted) only for this, and delete them after recruitment.',
  'We cannot see your Yandex password, mail or any other data.',
  'You can remove our access anytime in your Yandex ID settings, but then your solutions are no longer backed up.',
];

const AGREEMENT =
  'I agree that Point Blank may submit my solutions to the backup contest on Yandex Contest from my Yandex account';

const HEADINGS: Record<Variant, { title: string; intro: string; action: string }> = {
  connect: {
    title: 'Connect Yandex for the backup contest',
    intro:
      'We run this contest on Yandex Contest at the same time as a backup. If our platform goes down, you carry on there and your work so far is already waiting.',
    action: 'Connect Yandex',
  },
  reconnect: {
    title: 'Reconnect your Yandex account',
    intro:
      'Yandex no longer accepts our access to your account, so your solutions are not being backed up. Your submissions here are safe; they are copied once you reconnect.',
    action: 'Reconnect Yandex',
  },
  change: {
    title: 'Use a different Yandex account',
    intro: 'Connecting another account replaces the one connected now. Your backup contest registration moves to it.',
    action: 'Connect another account',
  },
};

export const YandexConnectCard = ({ contestId, connection, variant, onCancel }: YandexConnectCardProps) => {
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inAppBrowser = useMemo(() => detectInAppBrowser(navigator.userAgent), []);
  const heading = HEADINGS[variant];
  const checkboxId = `yandex-consent-${contestId}`;

  const handleConnect = async () => {
    if (!agreed || starting) return;
    setStarting(true);
    setError(null);
    try {
      const authorizeUrl = await yandexApi.startConnection(true, contestId);
      rememberYandexReturn(contestId);
      window.location.assign(authorizeUrl);
    } catch (err) {
      setError(yandexErrorMessage(err, 'Could not start Yandex sign-in. Please try again.'));
      setStarting(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      aria-labelledby={`${checkboxId}-title`}
      className={`rounded-xl border p-5 mb-6 text-left ${
        variant === 'reconnect' ? 'border-yellow-500/50 bg-yellow-950/30' : 'border-gray-700 bg-black/40'
      }`}
    >
      <div className="flex items-start gap-3">
        {variant === 'reconnect' ? (
          <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" aria-hidden />
        ) : (
          <ShieldCheck className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" aria-hidden />
        )}
        <div className="min-w-0">
          <h3 id={`${checkboxId}-title`} className="text-white font-semibold">{heading.title}</h3>
          <p className="text-gray-300 text-sm mt-1">{heading.intro}</p>
          {variant !== 'connect' && connection.connected && (
            <p className="text-gray-400 text-xs mt-2">
              Connected now: <span className="text-gray-200 break-all">{yandexAccountLabel(connection)}</span>
            </p>
          )}
        </div>
      </div>

      <ul className="mt-4 space-y-1.5 text-sm text-gray-300 list-disc pl-5 marker:text-green-500">
        {PRIVACY_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-gray-300">
        No Yandex account? You can create one on the Yandex sign-in page. If you use Google to sign in to Yandex,
        choose Google on the Yandex page.
      </p>

      {inAppBrowser && (
        <div role="alert" className="mt-4 rounded-lg border border-yellow-600/60 bg-yellow-950/40 p-3 text-sm text-yellow-100">
          <p>
            You seem to be inside {inAppBrowser === 'an app' ? 'an app' : `${inAppBrowser}'s`} browser. Google blocks sign-in here,
            so if you use Google for Yandex, open this page in Chrome or Safari first.
          </p>
          <button
            type="button"
            onClick={handleCopyLink}
            className="mt-2 inline-flex items-center gap-1.5 rounded border border-yellow-600/60 px-2.5 py-1 text-xs font-semibold hover:bg-yellow-900/40"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden />
            {copied ? 'Link copied' : 'Copy page link'}
          </button>
        </div>
      )}

      <label htmlFor={checkboxId} className="mt-4 flex items-start gap-3 cursor-pointer text-sm text-gray-200">
        <input
          id={checkboxId}
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-green-500"
        />
        <span>{AGREEMENT}</span>
      </label>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleConnect}
          disabled={!agreed || starting}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-semibold transition-colors ${
            agreed && !starting ? 'bg-white text-black hover:bg-gray-200' : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ExternalLink className="w-4 h-4" aria-hidden />}
          {starting ? 'Opening Yandex…' : heading.action}
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
    </section>
  );
};

interface YandexConnectedNoteProps {
  connection: YandexConnection;
  onChange?: () => void;
}

/** One line confirming the backup is connected, with a way to switch accounts. */
export const YandexConnectedNote = ({ connection, onChange }: YandexConnectedNoteProps) => (
  <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2.5 text-sm">
    <span className="flex items-center gap-2 text-gray-200 min-w-0">
      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" aria-hidden />
      <span className="min-w-0">
        Backup contest: connected as <span className="text-white font-medium break-all">{yandexAccountLabel(connection)}</span>
      </span>
    </span>
    {onChange && (
      <button type="button" onClick={onChange} className="text-xs text-gray-400 underline-offset-2 hover:text-white hover:underline">
        Change account
      </button>
    )}
  </div>
);
