// Yandex sends its one-time OAuth code and our signed state to /yandex/callback in the
// query string. Sentry records that URL in many places (the request URL, navigation
// breadcrumbs, stack frames of inline scripts, error messages), so every string in an
// event or breadcrumb that mentions the callback has those two values replaced.

const CALLBACK = '/yandex/callback';
const SECRET_PARAMS = /([?&](?:code|state)=)[^&#\s"']*/gi;

export const redactOAuthCallbackUrl = (value: string): string =>
  value.includes(CALLBACK) ? value.replace(SECRET_PARAMS, '$1[Filtered]') : value;

const redactDeep = (value: unknown, seen: WeakSet<object>): unknown => {
  if (typeof value === 'string') return redactOAuthCallbackUrl(value);
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const next = redactDeep(record[key], seen);
    if (next !== record[key]) {
      try {
        record[key] = next;
      } catch {
        // Read-only values are left alone; Sentry's own objects are plain and writable.
      }
    }
  }
  return value;
};

export const redactSentryBreadcrumb = <T extends object>(breadcrumb: T): T => redactDeep(breadcrumb, new WeakSet()) as T;

export const redactSentryEvent = <T extends object>(event: T): T => {
  const request = (event as { request?: { url?: string; query_string?: unknown } }).request;
  if (request?.url?.includes(CALLBACK)) delete request.query_string;
  return redactDeep(event, new WeakSet()) as T;
};
