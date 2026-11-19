// Candidates connect their own Yandex account so the backup service (recruitment-backup)
// can register them on the parallel Yandex contest and copy every submission there.

export type YandexTokenState = 'active' | 'needs_reauth';

export interface YandexConnection {
  /** False while the server has no Yandex app configured (or predates the endpoint). */
  enabled: boolean;
  /** Registration is refused until the candidate is connected. */
  required: boolean;
  connected: boolean;
  tokenState?: YandexTokenState;
  yandexLogin?: string;
  yandexEmail?: string;
  connectedAt?: number;
}

export const DISABLED_YANDEX_CONNECTION: YandexConnection = Object.freeze({
  enabled: false,
  required: false,
  connected: false,
});

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export const toYandexConnection = (raw: unknown): YandexConnection => {
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const connected = data.connected === true;
  return {
    enabled: data.enabled === true,
    required: data.required === true,
    connected,
    tokenState: connected ? (data.token_state === 'needs_reauth' ? 'needs_reauth' : 'active') : undefined,
    yandexLogin: optionalString(data.yandex_login),
    yandexEmail: optionalString(data.yandex_email),
    connectedAt: typeof data.connected_at === 'number' && Number.isFinite(data.connected_at) ? data.connected_at : undefined,
  };
};

/** Accounts made through Google sign-in may have no proper Yandex login; show the email instead. */
export const yandexAccountLabel = (connection: YandexConnection): string =>
  connection.yandexLogin || connection.yandexEmail || 'your Yandex account';

export const needsYandexReconnect = (connection: YandexConnection | null | undefined): boolean =>
  Boolean(connection?.enabled && connection.connected && connection.tokenState === 'needs_reauth');

export const isSafeContestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);

const RETURN_KEY = 'pb_yandex_connect_return';

/** Remembers the contest to return to if Yandex sends the candidate back with an error. */
export const rememberYandexReturn = (contestId: string): void => {
  try {
    sessionStorage.setItem(RETURN_KEY, contestId);
  } catch {
    // Storage can be unavailable (private mode); the callback falls back to the contest list.
  }
};

export const readYandexReturn = (): string | undefined => {
  try {
    const value = sessionStorage.getItem(RETURN_KEY);
    return isSafeContestId(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

export const forgetYandexReturn = (): void => {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
};
