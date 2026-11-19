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
const lib = { exports: {}, sessionStorage };
vm.runInNewContext(compile('src/lib/yandexConnect.ts'), lib);
const {
  toYandexConnection, yandexAccountLabel, needsYandexReconnect, isSafeContestId,
  rememberYandexReturn, readYandexReturn, forgetYandexReturn,
} = lib.exports;

const full = toYandexConnection({ enabled: true, required: true, connected: true, token_state: 'needs_reauth', yandex_login: '', yandex_email: 'asha@gmail.com', connected_at: 5 });
assert.equal(full.enabled && full.required && full.connected, true);
assert.equal(full.tokenState, 'needs_reauth');
assert.equal(yandexAccountLabel(full), 'asha@gmail.com', 'an account without a login shows its email');
assert.equal(needsYandexReconnect(full), true);
assert.equal(yandexAccountLabel(toYandexConnection({ connected: true, yandex_login: 'asha', yandex_email: 'a@b.c' })), 'asha');
for (const garbage of [null, 'yes', 42, [], { enabled: 'true', connected: 1, token_state: 'needs_reauth' }]) {
  const parsed = toYandexConnection(garbage);
  assert.equal(parsed.enabled || parsed.required || parsed.connected, false, JSON.stringify(garbage));
  assert.equal(needsYandexReconnect(parsed), false);
}
assert.equal(toYandexConnection({ connected: true, token_state: 'weird' }).tokenState, 'active');
for (const [value, safe] of [['abc_DEF-123', true], ['../admin', false], ['a/b', false], ['', false], ['x'.repeat(65), false], [undefined, false]]) {
  assert.equal(isSafeContestId(value), safe, String(value));
}
rememberYandexReturn('contest-1');
assert.equal(readYandexReturn(), 'contest-1');
assert.equal(readYandexReturn(), 'contest-1', 'reading is idempotent (StrictMode runs initializers twice)');
forgetYandexReturn();
assert.equal(readYandexReturn(), undefined);
sessionStorage.setItem('pb_yandex_connect_return', 'javascript:alert(1)');
assert.equal(readYandexReturn(), undefined, 'a tampered return path is ignored');

// API client: request shapes, auth header, and defensive response handling.
const requests = [];
let respond;
const auth = { currentUser: { uid: 'user-1', getIdToken: async () => 'id-token' } };
const api = { exports: {}, console, URL };
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
  throw new Error(`unexpected import ${name}`);
};
vm.runInNewContext(compile('src/services/api/yandexApi.ts'), api);
const { yandexApi, yandexErrorCode, yandexErrorMessage } = api.exports;

respond = () => [404, 'Not Found'];
assert.equal((await yandexApi.getConnection()).enabled, false, 'a server without the endpoint reads as disabled');
respond = () => [200, { enabled: true, required: true, connected: false }];
const status = await yandexApi.getConnection();
assert.equal(status.enabled && status.required && !status.connected, true);
assert.equal(requests.at(-1).auth, 'Bearer id-token');
respond = () => [500, { error: 'boom' }];
await assert.rejects(yandexApi.getConnection(), error => error.response.status === 500, 'other failures are not hidden');

respond = () => [200, { authorize_url: 'https://oauth.yandex.com/authorize?client_id=x&state=s' }];
assert.equal(await yandexApi.startConnection(true, 'contest-1'), 'https://oauth.yandex.com/authorize?client_id=x&state=s');
assert.deepEqual(requests.at(-1).body, { consent: true, contest_id: 'contest-1' });
assert.equal(requests.at(-1).url, '/yandex/connection/start');
await yandexApi.startConnection(true, '../../evil');
assert.deepEqual(requests.at(-1).body, { consent: true, contest_id: '' }, 'unsafe contest ids are not sent');
for (const target of ['javascript:alert(1)', 'data:text/html,hi', 'not a url', 42, undefined]) {
  respond = () => [200, { authorize_url: target }];
  await assert.rejects(yandexApi.startConnection(true, 'c'), /unavailable/, String(target));
}

respond = () => [200, { enabled: true, required: true, connected: true, token_state: 'active', yandex_login: 'asha', contest_id: 'contest-1' }];
const done = await yandexApi.completeConnection('7654321', 'signed.state');
assert.deepEqual(requests.at(-1).body, { code: '7654321', state: 'signed.state' });
assert.equal(done.contestId, 'contest-1');
assert.equal(done.connection.connected && done.connection.yandexLogin === 'asha', true);
respond = () => [200, { connected: true, contest_id: '../admin' }];
assert.equal((await yandexApi.completeConnection('1', 's')).contestId, undefined, 'unsafe contest ids are dropped');

respond = () => [409, { error: 'this Yandex account is already connected to another Point Blank account', code: 'yandex_account_taken' }];
const conflict = await yandexApi.completeConnection('1', 's').catch(error => error);
assert.equal(yandexErrorCode(conflict), 'yandex_account_taken');
assert.match(yandexErrorMessage(conflict, 'fallback'), /already connected/);
respond = () => [429, {}];
assert.match(yandexErrorMessage(await yandexApi.completeConnection('1', 's').catch(error => error), 'fallback'), /Too many attempts/);
assert.equal(yandexErrorMessage(new Error('x'), 'fallback'), 'fallback');

console.log('Yandex connect checks passed: response normalization, safe return paths, and API request/response handling.');
