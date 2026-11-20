// Candidates connect their own Yandex account so the backup service (recruitment-backup)
// can register them on the parallel Yandex contest and copy every submission there.

export type YandexTokenState = 'active' | 'needs_reauth';

/** GET /yandex/connection, with the server's field names. */
export interface YandexConnection {
  /** False while the server has no Yandex app configured (or predates the endpoint). */
  enabled: boolean;
  /** Registration is refused until the candidate is connected. */
  required: boolean;
  connected: boolean;
  token_state?: YandexTokenState;
  yandex_login?: string;
  yandex_email?: string;
  connected_at?: number;
}

export interface CompletedYandexConnection {
  connection: YandexConnection;
  contestId?: string;
}

export const DISABLED_YANDEX_CONNECTION: YandexConnection = Object.freeze({
  enabled: false,
  required: false,
  connected: false,
});

export const isSafeContestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);

const malformed = () => new Error('The server sent an unexpected answer about your Yandex account.');

const optional = (value: unknown, type: 'string' | 'number'): boolean =>
  value === undefined || (typeof value === type && (type === 'string' || Number.isFinite(value)));

/**
 * Validates a connection response. Anything unexpected (an HTML page from a misrouted
 * request, missing flags, an unknown token state) throws instead of reading as "off".
 */
export const parseYandexConnection = (raw: unknown): YandexConnection => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw malformed();
  const { enabled, required, connected, token_state, yandex_login, yandex_email, connected_at } = raw as Record<string, unknown>;
  if (typeof enabled !== 'boolean' || typeof required !== 'boolean' || typeof connected !== 'boolean') throw malformed();
  if (!connected) return { enabled, required, connected };
  if (token_state !== 'active' && token_state !== 'needs_reauth') throw malformed();
  if (!optional(yandex_login, 'string') || !optional(yandex_email, 'string') || !optional(connected_at, 'number')) throw malformed();
  return {
    enabled,
    required,
    connected,
    token_state,
    yandex_login: yandex_login as string | undefined,
    yandex_email: yandex_email as string | undefined,
    connected_at: connected_at as number | undefined,
  };
};

/** A completed connection must come back enabled, connected and active. */
export const parseCompletedYandexConnection = (raw: unknown): CompletedYandexConnection => {
  const connection = parseYandexConnection(raw);
  if (!connection.enabled || !connection.connected || connection.token_state !== 'active') throw malformed();
  const contestId = (raw as Record<string, unknown>).contest_id;
  return { connection, contestId: isSafeContestId(contestId) ? contestId : undefined };
};

/** The Yandex page to send the candidate to; only http(s) URLs are followed. */
export const parseAuthorizeUrl = (raw: unknown): string => {
  const target = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).authorize_url : undefined;
  let url: URL | undefined;
  try {
    url = typeof target === 'string' ? new URL(target) : undefined;
  } catch {
    url = undefined;
  }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) throw malformed();
  return url.toString();
};

/** Accounts made through Google sign-in may have no proper Yandex login; show the email instead. */
export const yandexAccountLabel = (connection: YandexConnection): string =>
  connection.yandex_login || connection.yandex_email || 'your Yandex account';

export const needsYandexReconnect = (connection: YandexConnection | null | undefined): boolean =>
  Boolean(connection?.enabled && connection.connected && connection.token_state === 'needs_reauth');

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
