import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import axios from 'axios';

const compile = file => ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const detection = { exports: {} };
vm.runInNewContext(compile('src/lib/seb.ts'), detection);
const { isSEBUserAgent } = detection.exports;
for (const [agent, expected] of [['Mozilla/5.0 SEB/3.9.0', true], ['SEB/3.3.2', true], ['Mozilla/5.0 (SEB/3.2; iOS)', true],
  ['Mozilla/5.0 seb/3.3', true], ['Mozilla/5.0 Chrome/139.0', false], ['NotSEB/3.9', false], ['SEB/unknown', false], ['', false]]) {
  assert.equal(isSEBUserAgent(agent), expected, agent);
}
let releaseAuth, outcome, allowStorage = true;
const requests = [], values = new Map();
const auth = { currentUser: { uid: 'first-user', getIdToken: () => new Promise(resolve => { releaseAuth = resolve; }) } };
const navigator = { userAgent: 'Mozilla/5.0 SEB/3.9.0', locks: { request: (_, _options, callback) => callback() } };
const localStorage = {
  getItem(key) { assert.equal(allowStorage, true); return values.get(key); },
  setItem(key, value) { assert.equal(allowStorage, true); values.set(key, value); },
  removeItem(key) { assert.equal(allowStorage, true); values.delete(key); },
};
let timerId = 0;
const timers = new Map();
const module = { exports: {}, console, performance, AbortController,
  setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
  clearTimeout(id) { timers.delete(id); }, crypto: { randomUUID }, navigator, localStorage,
  require(name) {
    if (name === 'axios') return { default: { ...axios, create: config => axios.create({ ...config, adapter: async request => {
      requests.push({ ...request, body: request.data ? JSON.parse(request.data) : undefined });
      return { data: await outcome(requests.at(-1)), status: 200, statusText: 'OK', headers: {}, config: request };
    } }) } };
    if (name === './serverClock') return { installServerClock() {} };
    if (name.endsWith('/firebase')) return { auth };
    if (name.endsWith('/seb')) return detection.exports;
    if (name.endsWith('/problemAdapter')) return { toProblemDetails: response => response, toProblemOverview: response => response };
    return {};
  },
};
vm.runInNewContext(compile('src/services/api/contestApi.ts'), module);
const api = module.exports.contestApi;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const starting = api.startBrowserSession('exam', 'first-user');
const joining = api.startBrowserSession('exam', 'first-user');
const together = Promise.all([starting, joining]);
await flush();
auth.currentUser = { uid: 'second-user', getIdToken: async () => 'other-token' };
releaseAuth('old-token');
await assert.rejects(together, /account changed/);
assert.equal(requests.length, 0, 'account changes during authentication cannot dispatch a session');
auth.currentUser = { uid: 'first-user', getIdToken: async () => 'fixture-token' };
let cookie = false, generation = 0;
outcome = ({ body }) => {
  if (body.generation !== generation) throw new axios.AxiosError('stale', undefined, undefined, undefined,
    { status: 409, data: { code: 'BROWSER_SESSION_STALE', generation } });
  const confirmed = cookie; cookie = true;
  return { is_seb: true, session_count: 1, generation, is_terminated: false, cookie_confirmed: confirmed, seb_not_detected: false };
};
assert.equal((await api.startBrowserSession('exam', 'first-user')).cookie_confirmed, true);
assert.equal(requests.length, 2);
assert.equal(requests[0].body.attempt_id, requests[1].body.attempt_id);
assert.equal(values.size, 0, 'confirmed startup attempts cannot restore deleted cookies');
generation = 1; cookie = false;
const afterReset = await api.startBrowserSession('exam', 'first-user');
assert.equal(afterReset.generation, 1);
assert.equal(afterReset.session_count, 1);
assert.deepEqual(requests.slice(2).map(request => request.body.generation), [0, 1, 1], 'reset reconciliation rotates the attempt and confirms the new cookie');
assert.notEqual(requests[2].body.attempt_id, requests[3].body.attempt_id);
// Non-SEB participation does not depend on cookies, Web Locks, or browser storage.
navigator.userAgent = 'Mozilla/5.0 Chrome/139.0'; navigator.locks = undefined; allowStorage = false;
outcome = () => ({ is_seb: false, session_count: 0, generation, is_terminated: false, cookie_confirmed: false, seb_not_detected: true });
const ordinary = await api.startBrowserSession('exam', 'first-user');
assert.equal(ordinary.session_count, 0);
assert.equal(ordinary.seb_not_detected, true);
for (const invalid of [null, {}, { is_seb: true, session_count: 0, generation, is_terminated: false, cookie_confirmed: true, seb_not_detected: false },
  { is_seb: false, session_count: 0, generation: 0, is_terminated: false, cookie_confirmed: false, seb_not_detected: true }]) {
  outcome = () => invalid;
  await assert.rejects(api.startBrowserSession('exam', 'first-user'), /backend did not confirm/);
}
const required = request => new axios.AxiosError('Session required', undefined, request, undefined,
  { status: 428, data: { code: 'BROWSER_SESSION_REQUIRED' } });
const question = { id: 'question' };
const session = { is_seb: false, session_count: 0, generation, is_terminated: false, cookie_confirmed: false, seb_not_detected: true };
let reads = 0, checks = 0;
outcome = request => {
  if (request.method === 'post') { checks++; return session; }
  if (++reads === 1) throw required(request);
  return question;
};
assert.deepEqual(await api.getProblemById('exam', 'question'), question);
assert.equal(reads, 2, 'a reset retries the protected read after verifying the session');
assert.equal(checks, 1);
reads = checks = 0;
outcome = request => {
  if (request.method === 'post') { checks++; return session; }
  reads++; throw required(request);
};
await assert.rejects(api.getContestProblems('exam'), error => error.response?.status === 428);
assert.equal(reads, 2, 'session recovery retries each protected read at most once');
assert.equal(checks, 1);
const beforeAccountChange = requests.length;
outcome = request => {
  auth.currentUser = { uid: 'second-user', getIdToken: async () => 'other-token' };
  throw required(request);
};
await assert.rejects(api.getProblemById('exam', 'question'), axios.isCancel);
assert.equal(requests.length, beforeAccountChange + 1, 'a failed read cannot restart or replay as a different account');

// Cancellation stops an abandoned 428 recovery before more confirmations dispatch.
auth.currentUser = { uid: 'first-user', getIdToken: async () => 'fixture-token' };
navigator.userAgent = 'Mozilla/5.0 SEB/3.9.0';
navigator.locks = { request: (_, _options, callback) => callback() };
allowStorage = true;
let confirmations = 0, releaseConfirmation;
outcome = request => {
  if (request.method === 'get') throw required(request);
  confirmations++;
  const state = { ...session, is_seb: true, session_count: 1, generation: request.body.generation };
  if (confirmations === 1) return state;
  return new Promise(resolve => { releaseConfirmation = () => resolve(state); });
};
const readController = new AbortController();
const abandoned = api.getContestProblems('cancel-exam', readController.signal);
for (let i = 0; i < 10 && !releaseConfirmation; i++) await flush();
assert.equal(confirmations, 2);
readController.abort();
await assert.rejects(abandoned, axios.isCancel);
releaseConfirmation(); await flush();
assert.equal(confirmations, 2, 'aborted recovery cannot send remaining confirmation POSTs');

// A cancelled subscriber must not cancel another subscriber's shared handshake.
let releaseShared;
outcome = request => new Promise(resolve => { releaseShared = () => resolve({ ...session, generation: request.body.generation }); });
const firstController = new AbortController();
const sharedStart = api.startBrowserSession('shared-exam', 'first-user', firstController.signal);
const sharedSurvivor = api.startBrowserSession('shared-exam', 'first-user');
await flush();
const sharedRequestCount = requests.length;
firstController.abort();
await assert.rejects(sharedStart, axios.isCancel);
releaseShared();
await sharedSurvivor;
assert.equal(requests.length, sharedRequestCount, 'shared consumers dispatch one handshake');

// The total deadline includes authentication and waiting for another tab's Web Lock.
for (const waitAt of ['authentication', 'web-lock']) {
  auth.currentUser = { uid: 'first-user', getIdToken: () => new Promise(() => {}) };
  navigator.locks = { request: (_, _options, callback) => waitAt === 'web-lock' ? new Promise(() => {}) : callback() };
  const before = requests.length;
  const waiting = api.startBrowserSession(`deadline-${waitAt}`, 'first-user');
  await flush();
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  await assert.rejects(waiting, error => error.code === 'ECONNABORTED');
  assert.equal(requests.length, before, `${waitAt} deadline prevents dispatch`);
}

const adminModule = { ...module, exports: {} };
vm.runInNewContext(compile('src/services/api/adminApi.ts'), adminModule);
for (const reset of ['resetBrowserSessions', 'resetContestantTabSwitches']) {
  auth.currentUser = { uid: 'first-admin', getIdToken: () => new Promise(resolve => { releaseAuth = resolve; }) };
  const before = requests.length;
  const pendingReset = adminModule.exports.adminApi[reset]('exam', 'participant');
  await flush();
  auth.currentUser = { uid: 'second-admin', getIdToken: async () => 'second-admin-token' };
  releaseAuth('first-admin-token');
  await assert.rejects(pendingReset, axios.isCancel);
  assert.equal(requests.length, before, `${reset} cannot dispatch with the previous account's token`);
}
console.log('SEB checks passed: scoped/deduplicated startup, bounded cancellation/deadlines, protected-read recovery, and reset account fencing.');
