import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import axios from 'axios';
import { loadServerClock } from './helpers/serverClock.mjs';

const compile = path => ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let elapsed = 1000;
const performance = { now: () => elapsed };
const { clock } = loadServerClock(axios, { performance, Date: { now() { throw new Error('Machine time must not establish UTC'); } } });
assert.ok(Number.isNaN(clock.getServerTime()));
let ready = 0;
const unsubscribe = clock.subscribeServerClock(() => ready++);
assert.equal(clock.syncServerClock('1700000000000', 1000, 1080), true);
elapsed = 2080;
assert.equal(clock.getServerTime(), 1700000001000);
assert.equal(ready, 1);
const lastGood = clock.getLastClockSync();
for (const bad of [undefined, '', ' ', 'NaN', 'Infinity', '-1', '1700000000', '1700000000000junk', '1e12', '1700000000000.5', '8640000000000001']) {
  assert.equal(clock.syncServerClock(bad, 2000, 2100), false);
  assert.equal(clock.getLastClockSync(), lastGood);
}
for (const [start, end] of [[3000, 2999], [0, Infinity], [0, NaN]]) {
  assert.equal(clock.syncServerClock('1700000000000', start, end), false);
}
assert.equal(clock.syncServerClock('1700000010000', 3000, 3080), true);
assert.equal(clock.syncServerClock('1700000001000', 2000, 3100), false, 'late older request cannot roll back calibration');
assert.equal(clock.syncServerClock('1700000001000', 3000, 3150), false, 'coarse browser timers cannot let a slower equal-start request replace a sample');
assert.equal(ready, 2, 'accepted corrections notify the shared subscription');
elapsed = 7000;
assert.equal(clock.syncServerClock('1700000011000', 4000, elapsed), false, 'slow delivery must not replace healthy UTC');
assert.equal(clock.getServerTime(), 1700000013920, 'the existing anchor continues to advance');
assert.equal(clock.getLastClockSync(), 3080);
assert.equal(ready, 2, 'rejected slow samples do not notify or change clock readiness');
unsubscribe();
const initialSlow = loadServerClock(axios, { performance }).clock;
assert.equal(initialSlow.syncServerClock('1700000000000', 0, 10000), true);
elapsed = 10000;
assert.equal(initialSlow.getServerTime(), 1700000000000, 'a slow initial response establishes server UTC without an inflated midpoint');

const requests = [];
let failure;
let stamp = 1700000100000;
const axiosWithAdapter = { ...axios, create: config => axios.create({ ...config, adapter: async request => {
  assert.equal(request._clockStartedAt, elapsed, 'timing starts after authentication');
  requests.push(request);
  elapsed += 80;
  const response = { config: request, status: 200, statusText: 'OK', headers: { 'X-Server-Time-Ms': String(stamp) }, data: request.url.includes('/list') ? [] : {} };
  if (failure) {
    response.status = 403;
    throw new axios.AxiosError('blocked', undefined, request, undefined, response);
  }
  return response;
} }) };
const apiClock = loadServerClock(axiosWithAdapter, { performance });
const auth = { currentUser: { uid: 'user', getIdToken: async () => { elapsed += 5000; return 'token'; } } };
const loadApi = name => {
  const context = { exports: {}, performance, console, AbortController, require(imported) {
    if (imported === 'axios') return { default: axiosWithAdapter };
    if (imported === './serverClock') return apiClock;
    if (imported.endsWith('/firebase')) return { auth };
    if (imported.endsWith('/constants')) return { getDepartmentFromBranch: value => value };
    return {};
  } };
  vm.runInNewContext(compile(`src/services/api/${name}.ts`), context);
  return context.exports[name];
};
const clients = {
  contestApi: api => api.getContestsList(),
  adminApi: api => api.checkAdminAccess(),
  userApi: api => api.getUserProfile(),
  authApi: api => api.signup({ name: 'User', id: 'USN', email: 'user@example.test', mobile: '1234567890', joiningYear: 1, branch: 'CS', password: 'test' }),
};
for (const [name, invoke] of Object.entries(clients)) {
  const api = loadApi(name);
  stamp += 10000;
  await invoke(api);
  assert.equal(apiClock.clock.getServerTime(), stamp, `${name} syncs before returning data`);
  failure = true;
  stamp += 10000;
  await assert.rejects(invoke(api), error => error.response.status === 403);
  assert.equal(apiClock.clock.getServerTime(), stamp, `${name} syncs error responses`);
  failure = false;
}
assert.equal(requests.length, 8, 'sync adds no requests to normal API calls');

// The lifecycle tests use controllable elapsed timers, including recovery after suspended performance time.
const document = new EventTarget();
document.visibilityState = 'visible';
const window = new EventTarget();
const timers = new Map();
let timerId = 0, refreshCalls = 0, release, missing = false;
const lifecycleAxios = { ...axios, create: config => axios.create({ ...config, adapter: async request => {
  refreshCalls++;
  await new Promise(resolve => { release = resolve; });
  return { config: request, status: 200, headers: missing ? {} : { 'x-server-time-ms': String(stamp) }, data: {} };
} }) };
const lifecycle = loadServerClock(lifecycleAxios, { performance, document, window,
  setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
  clearTimeout: id => timers.delete(id),
});
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
const fireTimer = async () => {
  const [id, timer] = timers.entries().next().value;
  timers.delete(id);
  elapsed += timer.delay;
  timer.callback();
  await flush();
};
const stop = lifecycle.startServerClockRefresh();
await flush();
assert.equal(refreshCalls, 1, 'unknown UTC triggers immediate calibration');
window.dispatchEvent(new Event('online'));
await flush();
assert.equal(refreshCalls, 1, 'concurrent refreshes are deduplicated');
release();
await flush();
assert.equal(lifecycle.clock.getServerClockStatus(), 'synced');
assert.equal(timers.size, 1);
for (let n = 0; n < 3; n++) {
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('online'));
  window.dispatchEvent(new Event('focus'));
  await flush();
}
assert.equal(refreshCalls, 1, 'settled visible events do not force fresh probes');
const oldGeneration = lifecycle.clock.getClockGeneration();
document.visibilityState = 'hidden';
document.dispatchEvent(new Event('visibilitychange'));
stamp += 3600000; // Real UTC advances an hour while performance.now() is suspended.
document.visibilityState = 'visible';
document.dispatchEvent(new Event('visibilitychange'));
await flush();
assert.equal(lifecycle.clock.getServerClockStatus(), 'recovering');
assert.ok(Number.isNaN(lifecycle.clock.getServerTime()));
assert.equal(lifecycle.clock.syncServerClock('1700000000000', elapsed - 1, elapsed, oldGeneration), false);
elapsed += 2500;
release();
await flush();
assert.equal(lifecycle.clock.getServerTime(), stamp, 'slow recovery repairs a suspended clock without artificial lead');
assert.equal(lifecycle.clock.getServerClockStatus(), 'synced');
missing = true;
lifecycle.retryServerClock();
await flush();
for (let attempt = 0; attempt < 3; attempt++) {
  release();
  await flush();
  if (attempt < 2) await fireTimer();
}
assert.equal(lifecycle.clock.getServerClockStatus(), 'error', 'bounded failures expose an actionable clock error');
assert.ok(Number.isNaN(lifecycle.clock.getServerTime()));
missing = false;
lifecycle.retryServerClock();
await flush();
release();
await flush();
assert.equal(lifecycle.clock.getServerClockStatus(), 'synced');
window.dispatchEvent(new Event('blur'));
window.dispatchEvent(new Event('focus'));
await flush();
assert.equal(lifecycle.clock.getServerClockStatus(), 'recovering', 'focus restoration also revalidates UTC');
release();
await flush();
assert.equal(lifecycle.clock.getServerClockStatus(), 'synced');
stop();
assert.equal(timers.size, 0);
const callsAfterStop = refreshCalls;
window.dispatchEvent(new Event('online'));
document.dispatchEvent(new Event('visibilitychange'));
await flush();
assert.equal(refreshCalls, callsAfterStop, 'unmount removes refresh listeners');

const unknown = loadServerClock(axios, { performance });
const absolute = { 'retry-after': new Date(stamp + 60000).toUTCString() };
assert.equal(unknown.policy.parseRetryAfterMs(absolute), Infinity);
const limited = new axios.AxiosError('limited', undefined, undefined, undefined, { status: 429, headers: absolute });
assert.equal(unknown.policy.retryAfterDelay(limited), Infinity);
assert.equal(unknown.policy.isPermanentRequestError(limited), true, 'unknown absolute retry dates stop automatic polling');
assert.equal(unknown.policy.parseRetryAfterMs({ 'retry-after': '30' }), 30000);
unknown.clock.syncServerClock(String(stamp), elapsed);
assert.equal(unknown.policy.parseRetryAfterMs(absolute), 60000);
assert.equal(unknown.policy.isPermanentRequestError(limited), false);
console.log('Server clock checks passed: conservative UTC, suspended-clock recovery, bounded failures/retry, all API clients, subscriptions, and absolute retry dates.');
