import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import Navbar from './components/Navbar';
import Footer from './components/footer';
import { useAuth } from '@/lib/AuthContext';
import { auth } from '@/lib/firebase';
import {
  forgetYandexReturn,
  readYandexReturn,
  yandexAccountLabel,
  type CompletedYandexConnection,
} from '@/lib/yandexConnect';
import { contestApi, yandexErrorMessage } from '@/services/api/contestApi';

interface Exchange {
  key: string;
  promise: Promise<CompletedYandexConnection>;
}

interface CallbackParams {
  code: string | null;
  state: string | null;
  error: string | null;
  returnContestId?: string;
}

const deniedMessage = (error: string) =>
  error === 'access_denied'
    ? 'You did not allow access on Yandex, so your Yandex account was not connected.'
    : 'Yandex sign-in did not finish, so your Yandex account was not connected.';

/** Yandex sends the candidate here (the redirect URI) with ?code&state, or ?error. */
export const YandexCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const userId = useAuth().user?.uid;
  const [params] = useState<CallbackParams>(() => {
    const query = new URLSearchParams(location.search);
    return { code: query.get('code'), state: query.get('state'), error: query.get('error'), returnContestId: readYandexReturn() };
  });
  const [failure, setFailure] = useState<string | null>(null);
  // A Yandex code works once. StrictMode replays this effect while the exchange is still in
  // flight, so the replay reuses it; it is dropped once settled so a remount can try again.
  const exchangeRef = useRef<Exchange | null>(null);
  const returnPath = params.returnContestId ? `/contest/${params.returnContestId}` : '/contests';

  useEffect(() => {
    // Keep the one-time code out of the address bar and browser history.
    window.history.replaceState(window.history.state, '', location.pathname);
    forgetYandexReturn();
    if (params.error) {
      setFailure(deniedMessage(params.error));
      return;
    }
    if (!params.code || !params.state) {
      setFailure('This page needs the sign-in details from Yandex. Start connecting again from the contest page.');
      return;
    }
    if (!userId) return;
    const key = JSON.stringify([userId, params.state, params.code]);
    let exchange = exchangeRef.current;
    if (!exchange || exchange.key !== key) {
      const started: Exchange = { key, promise: contestApi.completeYandexConnection(params.code, params.state, userId) };
      const release = () => {
        if (exchangeRef.current === started) exchangeRef.current = null;
      };
      started.promise.then(release, release);
      exchangeRef.current = exchange = started;
    }
    let active = true;
    // Results only count for the account that started the exchange.
    const current = () => active && auth.currentUser?.uid === userId;
    exchange.promise.then(
      ({ connection, contestId }) => {
        if (!current()) return;
        toast.success(`Yandex account connected: ${yandexAccountLabel(connection)}`);
        const target = contestId ?? params.returnContestId;
        navigate(target ? `/contest/${target}` : '/contests', { replace: true });
      },
      (error: unknown) => {
        if (current()) setFailure(yandexErrorMessage(error, 'Could not connect your Yandex account. Please try again.'));
      },
    );
    return () => {
      active = false;
    };
  }, [params, userId, navigate, location.pathname]);

  return (
    <div className="bg-black text-white min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow flex items-center justify-center px-4 py-16">
        {failure ? (
          <div role="alert" className="max-w-md w-full rounded-xl border border-red-800/60 bg-red-950/30 p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" aria-hidden />
            <h1 className="text-2xl font-anton text-beige mb-2">Yandex Not Connected</h1>
            <p className="text-gray-300 text-sm">{failure}</p>
            <button
              type="button"
              onClick={() => navigate(returnPath, { replace: true })}
              className="mt-6 rounded-full bg-green px-6 py-2.5 font-semibold text-black hover:bg-green-600 transition-colors"
            >
              {params.returnContestId ? 'Back to the contest' : 'Back to contests'}
            </button>
          </div>
        ) : (
          <div role="status" className="flex items-center gap-3 text-gray-300">
            <Loader2 className="h-6 w-6 animate-spin text-green-400" aria-hidden />
            Connecting your Yandex account…
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default YandexCallback;
