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
const navigator = { userAgent: 'Mozilla/5.0 SEB/3.9.0', locks: { request: (_, callback) => callback() } };
const localStorage = {
  getItem(key) { assert.equal(allowStorage, true); return values.get(key); },
  setItem(key, value) { assert.equal(allowStorage, true); values.set(key, value); },
  removeItem(key) { assert.equal(allowStorage, true); values.delete(key); },
};
const module = { exports: {}, console, performance, AbortController, crypto: { randomUUID }, navigator, localStorage,
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
assert.equal(api.startBrowserSession('exam', 'first-user'), starting, 'concurrent startup calls share one operation');
await flush();
auth.currentUser = { uid: 'second-user', getIdToken: async () => 'other-token' };
releaseAuth('old-token');
await assert.rejects(starting, /account changed/);
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
console.log('SEB session checks passed: detection, scoped authentication, startup deduplication, reset reconciliation, ordinary-browser allowance, malformed responses, and bounded protected-read recovery.');
