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
const unsubscribe = clock.subscribeClockReady(() => ready++);
assert.equal(clock.syncServerClock('1700000000000', 1000, 1080), true);
elapsed = 2080;
assert.equal(clock.getServerTime(), 1700000001040);
assert.equal(ready, 1);
const lastGood = clock.getLastClockSync();
for (const bad of [undefined, '', ' ', 'NaN', 'Infinity', '-1', '1700000000', '1700000000000junk', '1e12', '1700000000000.5', '8640000000000001']) {
  assert.equal(clock.syncServerClock(bad, 2000, 2100), false);
  assert.equal(clock.getLastClockSync(), lastGood);
}
for (const [start, end] of [[3000, 2999], [0, Infinity], [0, NaN], [0, 2001]]) {
  assert.equal(clock.syncServerClock('1700000000000', start, end), false);
}
assert.equal(clock.syncServerClock('1700000010000', 3000, 3080), true);
assert.equal(clock.syncServerClock('1700000001000', 2000, 3100), false, 'late older request cannot roll back calibration');
assert.equal(clock.syncServerClock('1700000001000', 3000, 3150), false, 'coarse browser timers cannot let a slower equal-start request replace a sample');
assert.equal(ready, 1, 'regular samples do not force React re-renders');
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
  assert.equal(apiClock.clock.getServerTime(), stamp + 40, `${name} syncs before returning data`);
  failure = true;
  stamp += 10000;
  await assert.rejects(invoke(api), error => error.response.status === 403);
  assert.equal(apiClock.clock.getServerTime(), stamp + 40, `${name} syncs error responses`);
  failure = false;
}
assert.equal(requests.length, 8, 'sync adds no requests to normal API calls');

// Clock lifecycle belongs to the app; StrictMode cleanup leaves one timer/listener set.
const document = new EventTarget();
document.visibilityState = 'visible';
const window = new EventTarget();
const timers = new Map();
let timerId = 0, refreshCalls = 0, release;
const lifecycleAxios = { ...axios, create: config => axios.create({ ...config, adapter: async request => {
  refreshCalls++;
  await new Promise(resolve => { release = resolve; });
  return { config: request, status: 200, headers: { 'x-server-time-ms': '1700000000000' }, data: {} };
} }) };
const lifecycle = loadServerClock(lifecycleAxios, { performance, document, window,
  setInterval: callback => { timers.set(++timerId, callback); return timerId; },
  clearInterval: id => timers.delete(id),
});
let stop = lifecycle.startServerClockRefresh();
stop();
stop = lifecycle.startServerClockRefresh();
assert.equal(timers.size, 1);
assert.equal(refreshCalls, 0, 'startup uses existing application API calls');
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
document.dispatchEvent(new Event('visibilitychange'));
window.dispatchEvent(new Event('online'));
await flush();
assert.equal(refreshCalls, 1, 'visibility and reconnect share one refresh');
release();
await flush();
timers.values().next().value();
await flush();
assert.equal(refreshCalls, 1, 'recent API traffic suppresses idle refresh');
elapsed += 600001;
timers.values().next().value();
await flush();
assert.equal(refreshCalls, 2);
release();
await flush();
stop();
document.dispatchEvent(new Event('visibilitychange'));
window.dispatchEvent(new Event('online'));
await flush();
assert.equal(timers.size, 0);
assert.equal(refreshCalls, 2, 'unmount removes refresh listeners');
console.log('Server clock checks passed: monotonic UTC, validation, concurrency, all API clients, auth timing, errors, and refresh lifecycle.');
