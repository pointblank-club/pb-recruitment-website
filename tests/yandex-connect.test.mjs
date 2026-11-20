import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import axios from 'axios';

const compile = file => ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const storage = new Map();
const sessionStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
const lib = { exports: {}, sessionStorage, URL };
vm.runInNewContext(compile('src/lib/yandexConnect.ts'), lib);
const {
  parseYandexConnection, parseCompletedYandexConnection, parseAuthorizeUrl, yandexAccountLabel, needsYandexReconnect,
  isSafeContestId, rememberYandexReturn, readYandexReturn, forgetYandexReturn,
} = lib.exports;

// Connection responses are validated, never defaulted into "off" or "active".
const connected = { enabled: true, required: true, connected: true, token_state: 'needs_reauth', yandex_email: 'asha@gmail.com', connected_at: 5 };
assert.deepEqual({ ...parseYandexConnection({ enabled: true, required: false, connected: false }) }, { enabled: true, required: false, connected: false });
assert.equal(parseYandexConnection(connected).token_state, 'needs_reauth');
assert.equal(needsYandexReconnect(parseYandexConnection(connected)), true);
assert.equal(needsYandexReconnect(parseYandexConnection({ ...connected, token_state: 'active' })), false);
assert.equal(yandexAccountLabel(parseYandexConnection({ ...connected, yandex_login: '' })), 'asha@gmail.com', 'an account without a login shows its email');
assert.equal(yandexAccountLabel(parseYandexConnection({ ...connected, yandex_login: 'asha' })), 'asha');
for (const bad of [
  {}, null, [], 'ok', '<!doctype html>',
  { enabled: true, required: true },
  { enabled: 'true', required: true, connected: false },
  { enabled: true, required: true, connected: true },
  { ...connected, token_state: 'unknown' },
  { ...connected, yandex_login: 7 },
  { ...connected, connected_at: 'yesterday' },
]) {
  assert.throws(() => parseYandexConnection(bad), /unexpected answer/, JSON.stringify(bad));
}

// A completion only counts when the server confirms an enabled, connected, active account.
const completed = { enabled: true, required: true, connected: true, token_state: 'active', yandex_login: 'asha', contest_id: 'contest-1' };
assert.equal(parseCompletedYandexConnection(completed).contestId, 'contest-1');
assert.equal(parseCompletedYandexConnection({ ...completed, contest_id: '../admin' }).contestId, undefined, 'unsafe contest ids are dropped');
for (const bad of [{}, { ...completed, token_state: 'needs_reauth' }, { ...completed, enabled: false }, { ...completed, connected: false }]) {
  assert.throws(() => parseCompletedYandexConnection(bad), /unexpected answer/, JSON.stringify(bad));
}

assert.equal(parseAuthorizeUrl({ authorize_url: 'https://oauth.yandex.com/authorize?state=s' }), 'https://oauth.yandex.com/authorize?state=s');
for (const target of ['javascript:alert(1)', 'data:text/html,hi', 'not a url', 42, undefined]) {
  assert.throws(() => parseAuthorizeUrl({ authorize_url: target }), /unexpected answer/, String(target));
}

assert.equal(isSafeContestId('contest_1-a'), true);
for (const bad of ['', '../x', 'a/b', 'x'.repeat(65), 7, null]) assert.equal(isSafeContestId(bad), false, String(bad));
rememberYandexReturn('contest-1');
assert.equal(readYandexReturn(), 'contest-1');
assert.equal(readYandexReturn(), 'contest-1', 'reading is idempotent (StrictMode runs initializers twice)');
forgetYandexReturn();
assert.equal(readYandexReturn(), undefined);
sessionStorage.setItem('pb_yandex_connect_return', 'javascript:alert(1)');
assert.equal(readYandexReturn(), undefined, 'a tampered return path is ignored');

// Sentry never keeps the callback's one-time code or signed state.
const sentry = { exports: {} };
vm.runInNewContext(compile('src/lib/sentryRedaction.ts'), sentry);
const { redactOAuthCallbackUrl, redactSentryBreadcrumb, redactSentryEvent } = sentry.exports;
assert.equal(redactOAuthCallbackUrl('/yandex/callback?code=private-code&state=signed.state'), '/yandex/callback?code=[Filtered]&state=[Filtered]');
assert.equal(redactOAuthCallbackUrl('https://recruitment.pointblank.club/yandex/callback?state=s&code=c#x'),
  'https://recruitment.pointblank.club/yandex/callback?state=[Filtered]&code=[Filtered]#x');
assert.equal(redactOAuthCallbackUrl('/yandex/callback?error=access_denied'), '/yandex/callback?error=access_denied');
assert.equal(redactOAuthCallbackUrl('/contests?code=kept'), '/contests?code=kept', 'other pages are untouched');
const navigation = redactSentryBreadcrumb({ category: 'navigation', data: { from: '/yandex/callback?code=private-code&state=signed', to: '/yandex/callback' } });
assert.deepEqual({ ...navigation.data }, { from: '/yandex/callback?code=[Filtered]&state=[Filtered]', to: '/yandex/callback' });
const page = 'https://site.test/yandex/callback?code=private-code&state=signed';
const event = redactSentryEvent({
  request: { url: page, query_string: 'code=private-code&state=signed' },
  breadcrumbs: [{ category: 'navigation', data: { from: page } }],
  exception: { values: [{ value: `Failed to load ${page}`, stacktrace: { frames: [{ filename: page, abs_path: page, lineno: 3 }] } }] },
  extra: { nested: [{ href: page }] },
});
assert.doesNotMatch(JSON.stringify(event), /private-code|signed/, 'no field keeps the code or state');
assert.equal(event.exception.values[0].stacktrace.frames[0].lineno, 3, 'other values are untouched');
const cyclic = { message: page };
cyclic.self = cyclic;
assert.equal(redactSentryBreadcrumb(cyclic).message, 'https://site.test/yandex/callback?code=[Filtered]&state=[Filtered]');

// The Yandex calls run on contestApi's client, with its account checks.
const requests = [];
let respond;
const auth = { currentUser: { uid: 'user-1', getIdToken: async () => 'id-token' } };
const api = { exports: {}, console, URL, AbortController, performance, setTimeout, clearTimeout };
api.require = name => {
  if (name === 'axios') return { default: { ...axios, create: config => axios.create({ ...config, adapter: async request => {
    requests.push({ method: request.method, url: request.url, auth: request.headers.Authorization, body: request.data ? JSON.parse(request.data) : undefined });
    const [status, data] = respond(requests.at(-1));
    const response = { data, status, statusText: String(status), headers: {}, config: request };
    if (status >= 400) throw new axios.AxiosError('failed', undefined, request, undefined, response);
    return response;
  } }) } };
  if (name === './serverClock') return { installServerClock() {} };
  if (name.endsWith('/firebase')) return { auth };
  if (name.endsWith('/yandexConnect')) return lib.exports;
  return {};
};
vm.runInNewContext(compile('src/services/api/contestApi.ts'), api);
const { contestApi, yandexErrorMessage } = api.exports;

respond = () => [404, 'Not Found'];
assert.equal((await contestApi.getYandexConnection('user-1')).enabled, false, 'a server without the endpoint reads as off');
for (const status of [405, 501, 500]) {
  respond = () => [status, { error: 'boom' }];
  await assert.rejects(contestApi.getYandexConnection('user-1'), error => error.response.status === status, `${status} is not hidden`);
}
respond = () => [200, {}];
await assert.rejects(contestApi.getYandexConnection('user-1'), /unexpected answer/, 'an empty 200 is an error, not "off"');
respond = () => [200, '<!doctype html><html></html>'];
await assert.rejects(contestApi.getYandexConnection('user-1'), /unexpected answer/, 'a misrouted HTML page is an error');
respond = () => [200, { enabled: true, required: true, connected: false }];
assert.equal((await contestApi.getYandexConnection('user-1')).required, true);
assert.equal(requests.at(-1).auth, 'Bearer id-token');
assert.equal(requests.at(-1).url, '/yandex/connection');

respond = () => [200, { authorize_url: 'https://oauth.yandex.com/authorize?client_id=x&state=s' }];
assert.equal(await contestApi.startYandexConnection('contest-1', 'user-1'), 'https://oauth.yandex.com/authorize?client_id=x&state=s');
assert.deepEqual(requests.at(-1).body, { consent: true, contest_id: 'contest-1' });
assert.equal(requests.at(-1).url, '/yandex/connection/start');
await contestApi.startYandexConnection('../../evil', 'user-1');
assert.deepEqual(requests.at(-1).body, { consent: true, contest_id: '' }, 'unsafe contest ids are not sent');

respond = () => [200, completed];
const done = await contestApi.completeYandexConnection('7654321', 'signed.state', 'user-1');
assert.deepEqual(requests.at(-1).body, { code: '7654321', state: 'signed.state' });
assert.equal(done.contestId, 'contest-1');
assert.equal(done.connection.yandex_login, 'asha');
respond = () => [200, {}];
await assert.rejects(contestApi.completeYandexConnection('1', 's', 'user-1'), /unexpected answer/, 'an empty 200 is not a connection');

// A request made for one account is never sent once another account is signed in.
const sent = requests.length;
auth.currentUser = { uid: 'user-2', getIdToken: async () => 'other-token' };
await assert.rejects(contestApi.startYandexConnection('contest-1', 'user-1'), error => axios.isCancel(error));
await assert.rejects(contestApi.completeYandexConnection('1', 's', 'user-1'), error => axios.isCancel(error));
assert.equal(requests.length, sent, 'nothing reaches the server for the old account');
auth.currentUser = { uid: 'user-1', getIdToken: async () => 'id-token' };

respond = () => [409, { error: 'this Yandex account is already connected to another Point Blank account', code: 'yandex_account_taken' }];
const conflict = await contestApi.completeYandexConnection('1', 's', 'user-1').catch(error => error);
assert.match(yandexErrorMessage(conflict, 'fallback'), /already connected/);
respond = () => [429, {}];
assert.match(yandexErrorMessage(await contestApi.completeYandexConnection('1', 's', 'user-1').catch(error => error), 'fallback'), /Too many attempts/);
assert.equal(yandexErrorMessage(new Error('x'), 'fallback'), 'fallback');

console.log('Yandex connect checks passed: strict response validation, Sentry redaction, safe return paths, and account-scoped API calls.');
