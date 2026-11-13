import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import axios from 'axios';
import { renderToStaticMarkup } from 'react-dom/server';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source.replaceAll('import.meta.env', '({})'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const error = (status, retryAfter) => new axios.AxiosError('Synthetic request failure', undefined, undefined, undefined, {
  status, headers: { 'retry-after': retryAfter }, data: {},
});
const policyModule = { exports: {}, require: () => ({ default: axios }) };
policyModule.Math = Object.create(Math);
policyModule.Math.random = () => 0.5;
vm.runInNewContext(compile(read('src/lib/requestPolicy.ts')), policyModule);
const { retryAfterDelay, isPermanentRequestError, jitterDelay } = policyModule.exports;
assert.equal(retryAfterDelay(error(429, '17')), 17000);
assert.equal(retryAfterDelay(error(503, 'not-a-date')), 1000);
assert.equal(retryAfterDelay(error(429, undefined)), 1000);
assert.equal(retryAfterDelay(error(400, '17')), 0);
assert.equal(retryAfterDelay(error(503, undefined)), 0);
for (const malformed of ['', '-1', '1.5', '9'.repeat(400)]) {
  assert.equal(retryAfterDelay(error(429, malformed)), 1000);
}
assert.equal(retryAfterDelay(error(503, '3000000')), 3_000_000_000);
assert.equal(retryAfterDelay(error(429, '0')), 0);
assert.equal(policyModule.exports.parseRetryAfterMs({ 'Retry-After': 12 }), 12000);
assert.equal(retryAfterDelay(new Error('offline')), 0);
const future = new Date(Date.now() + 20000).toUTCString();
assert.ok(retryAfterDelay(error(503, future)) >= 18000);
assert.ok(retryAfterDelay(error(503, future)) <= 20000);
for (const status of [400, 401, 403, 404, 409]) assert.ok(isPermanentRequestError(error(status)));
for (const status of [408, 429, 500, 503]) assert.equal(isPermanentRequestError(error(status)), false);
for (let n = 0; n < 50; n++) assert.ok(jitterDelay(1000) >= 1000 && jitterDelay(1000) <= 1200);

// Keep real Axios interceptors, headers, cancellation, and async request dispatch.
let outcome;
let requestClock = 0;
let duringRetryWait;
const retryWaits = [];
const requestDeadlines = new Map();
let deadlineId = 0;
const requests = [];
const response = config => ({ data: { submission_id: 'synthetic-submission' }, status: 201, statusText: 'Created', headers: {}, config });
const axiosWithAdapter = {
  ...axios,
  create(config) {
    return axios.create({ ...config, adapter: async config => {
      requests.push({ path: config.url, timeout: config.timeout, payload: JSON.parse(config.data), key: config.headers.get('Idempotency-Key'), authorization: config.headers.get('Authorization') });
      if (typeof outcome === 'function') return outcome(config);
      if (outcome) throw outcome;
      return response(config);
    } });
  },
};
const user = uid => ({ uid, getIdToken: async () => `token-${uid}` });
const auth = { currentUser: user('synthetic-user') };
const apiModule = {
  exports: {}, crypto: { randomUUID }, console, AbortController, performance: { now: () => requestClock },
  require(name) {
    if (name === 'axios') return { default: axiosWithAdapter };
    if (name.endsWith('/firebase')) return { auth };
    if (name.endsWith('/requestPolicy')) return { ...policyModule.exports, requestTimeout(callback, delay) { if (delay === 30000) { const id = ++deadlineId; requestDeadlines.set(id, callback); return () => requestDeadlines.delete(id); } retryWaits.push(delay); requestClock += delay; duringRetryWait?.(); queueMicrotask(callback); return () => {}; } };
    if (name.endsWith('/base64')) return { encodeBase64: value => Buffer.from(value).toString('base64') };
    return {};
  },
};
vm.runInNewContext(compile(read('src/services/api/contestApi.ts')), apiModule);
const api = apiModule.exports.contestApi;
const submit = (code = 'int main(){}', language = 'cpp') => api.submitCodeSolution('contest', 'problem', code, language);
for (const [value, expected] of [['17', 17000], ['3000000', 30000], ['not-a-date', undefined]]) {
  outcome = error(429, value);
  const result = await api.recordTabSwitch('contest', { observation_id: randomUUID(), generation: 0, count: 1 });
  assert.equal(result.retryAfterMs, expected, 'tab-switch waits keep their existing 30-second bound');
}

outcome = new Error('response lost');
await assert.rejects(submit());
const first = requests.at(-1).key;
assert.match(first, /^[0-9a-f-]{36}$/);
assert.equal(requests.at(-1).authorization, 'Bearer token-synthetic-user');
for (const failure of [error(503), error(429, '30'), error(401), error(400), new axios.CanceledError('cancelled')]) {
  outcome = failure;
  await assert.rejects(submit());
  assert.equal(requests.at(-1).key, first, 'a later failure cannot prove the original request was not accepted');
}
outcome = new Error('offline');
await assert.rejects(submit('edited'));
assert.notEqual(requests.at(-1).key, first, 'different source gets a separate binding');
await assert.rejects(submit('int main(){}', 'python'));
assert.notEqual(requests.at(-1).key, first, 'different language gets a separate binding');
await assert.rejects(submit());
assert.equal(requests.at(-1).key, first, 'edit-submit-revert retains the original uncertain request');
auth.currentUser = user('another-user');
await assert.rejects(submit());
assert.notEqual(requests.at(-1).key, first, 'keys are scoped to the authenticated account');
auth.currentUser = user('synthetic-user');
outcome = undefined;
await submit();
assert.equal(requests.at(-1).key, first, 'retry success reuses original key');
await submit();
assert.notEqual(requests.at(-1).key, first, 'only success releases the payload binding');

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
let beforeDispatch = requests.length;
const switchedBeforeDispatch = submit('identity-before-dispatch');
auth.currentUser = user('another-user');
await assert.rejects(switchedBeforeDispatch, axios.isCancel);
assert.equal(requests.length, beforeDispatch, 'account change before dispatch must not send any POST');
const token = deferred();
auth.currentUser = { uid: 'synthetic-user', getIdToken: () => token.promise };
const switchedDuringToken = submit('identity-during-token');
await flush();
auth.currentUser = user('another-user');
token.resolve('token-synthetic-user');
await assert.rejects(switchedDuringToken, axios.isCancel);
assert.equal(requests.length, beforeDispatch, 'account change during token fetch must not send any POST');
auth.currentUser = null;
await assert.rejects(submit('signed-out'));
assert.equal(requests.length, beforeDispatch, 'signed-out calls never create an anonymous submission');
auth.currentUser = user('synthetic-user');

// A late response for an old UUID must not erase a newer binding for the same payload.
const pending = [];
outcome = config => {
  const request = deferred();
  pending.push({ ...request, config });
  return request.promise;
};
const concurrentFirst = submit('concurrent');
const concurrentSecond = submit('concurrent');
await flush();
assert.equal(pending.length, 2);
assert.equal(requests.at(-1).key, requests.at(-2).key, 'concurrent identical calls share a UUID');
const oldKey = requests.at(-1).key;
pending[0].resolve(response(pending[0].config));
await concurrentFirst;
const newer = submit('concurrent');
await flush();
const newerKey = requests.at(-1).key;
assert.notEqual(newerKey, oldKey);
pending[1].resolve(response(pending[1].config));
await concurrentSecond;
pending[2].reject(new Error('new response lost'));
await assert.rejects(newer);
outcome = new Error('still offline');
await assert.rejects(submit('concurrent'));
assert.equal(requests.at(-1).key, newerKey, 'old success cannot clear the newer uncertain binding');
console.log('Real Axios request IDs survive lost responses, edits, language/account changes, cancellation, concurrent calls, and stale success.');

// Automatic retries are deliberately limited to idempotent code submissions.
auth.currentUser = user('synthetic-user');
let attempt = 0;
let requestStart = requests.length;
let waitStart = retryWaits.length;
outcome = config => {
  attempt += 1;
  if (attempt === 1) throw error(503, '1');
  if (attempt === 2) throw error(429, '2');
  return response(config);
};
await submit('automatic-recovery');
const recovered = requests.slice(requestStart);
assert.equal(recovered.length, 3);
assert.equal(new Set(recovered.map(request => request.key)).size, 1);
assert.equal(new Set(recovered.map(request => JSON.stringify(request.payload))).size, 1);
assert.ok(recovered.every(request => request.authorization === 'Bearer token-synthetic-user'));
assert.equal(recovered[0].timeout, 30000);
assert.equal(recovered[1].timeout, 28900);
assert.equal(recovered[2].timeout, 26700);
assert.deepEqual(retryWaits.slice(waitStart), [1100, 2200], 'server-dominated waits retain positive jitter and are never shortened');
for (const failure of [error(429), error(500), error(502), error(503), error(504), new axios.AxiosError('offline', 'ERR_NETWORK')]) {
  outcome = failure;
  requestStart = requests.length;
  await assert.rejects(submit(`bounded-${requestStart}`));
  assert.equal(requests.length - requestStart, 3, 'transient failures stop after three attempts');
  assert.equal(new Set(requests.slice(requestStart).map(request => request.key)).size, 1);
}
for (const failure of [error(400), error(401), error(403), error(408), error(409), error(422), new axios.CanceledError('cancelled')]) {
  outcome = failure;
  requestStart = requests.length;
  await assert.rejects(submit(`permanent-${requestStart}`));
  assert.equal(requests.length - requestStart, 1, 'permanent errors and cancellations are never retried');
}
for (const hint of ['29', '31']) {
  outcome = error(429, hint);
  requestStart = requests.length;
  waitStart = retryWaits.length;
  await assert.rejects(submit(`retry-after-beyond-budget-${hint}`));
  assert.equal(requests.length - requestStart, 1);
  assert.equal(retryWaits.length, waitStart, 'entire jittered Retry-After must fit into total request budget');
}
outcome = error(503, '1');
requestStart = requests.length;
duringRetryWait = () => { requestClock += 30000; };
await assert.rejects(submit('suspended-during-retry'));
assert.equal(requests.length - requestStart, 1, 'late timer cannot dispatch outside the total budget');
for (const nextAccount of [null, user('another-user')]) {
  auth.currentUser = user('synthetic-user');
  duringRetryWait = () => { auth.currentUser = nextAccount; };
  requestStart = requests.length;
  await assert.rejects(submit(`identity-during-retry-${requestStart}`), axios.isCancel);
  assert.equal(requests.length - requestStart, 1, 'signout/account switch suppresses the next attempt');
}
duringRetryWait = undefined;
auth.currentUser = user('synthetic-user');
for (const action of [() => api.runCodeSolution('code', 'cpp', ''), () => api.submitMCQAnswer('contest', 'problem', 0), () => api.registerForContest('contest')]) {
  requestStart = requests.length;
  await assert.rejects(action());
  assert.equal(requests.length - requestStart, 1, 'other POST classes never gain automatic retries');
}
const signupModule = { exports: {}, require(name) {
  if (name === 'axios') return { default: axiosWithAdapter };
  return { getDepartmentFromBranch: value => value };
} };
vm.runInNewContext(compile(read('src/services/api/authApi.ts')), signupModule);
requestStart = requests.length;
await assert.rejects(signupModule.exports.authApi.signup({ name: 'Synthetic', id: 'synthetic', email: 'synthetic@example.invalid', mobile: '1234567890', joiningYear: 1, branch: 'CS', password: 'synthetic-password' }));
assert.equal(requests.length - requestStart, 1, 'signup is not idempotent and must never retry automatically');

// A hung token lookup is part of the same deadline, and cannot send a late POST.
assert.equal(requestDeadlines.size, 0, 'completed calls remove their deadline timers');
const lateToken = deferred();
auth.currentUser = { uid: 'synthetic-user', getIdToken: () => lateToken.promise };
requestStart = requests.length;
const tokenDeadline = submit('token-beyond-deadline');
await flush();
assert.equal(requestDeadlines.size, 1);
requestClock += 30000;
[...requestDeadlines.values()][0]();
await assert.rejects(tokenDeadline);
lateToken.resolve('token-synthetic-user');
await flush();
assert.equal(requests.length, requestStart, 'expired token lookup must never reach the HTTP adapter');
assert.equal(requestDeadlines.size, 0);
auth.currentUser = user('synthetic-user');
// Token continuations can run before an overdue browser timer callback.
for (const tokenResult of ['resolve', 'reject']) {
  const delayed = deferred();
  auth.currentUser = { uid: 'synthetic-user', getIdToken: () => delayed.promise };
  requestStart = requests.length;
  const expired = submit(`expired-before-timer-${tokenResult}`);
  await flush();
  requestClock += 30001;
  if (tokenResult === 'resolve') delayed.resolve('token-synthetic-user');
  else delayed.reject(new Error('synthetic token lookup failure'));
  await assert.rejects(expired, failure => failure.code === 'ECONNABORTED');
  assert.equal(requests.length, requestStart, 'overdue token lookup must not dispatch before its timeout callback');
}
auth.currentUser = { uid: 'synthetic-user', async getIdToken() { requestClock += 12000; return 'token-synthetic-user'; } };
outcome = undefined;
await submit('token-budget');
assert.equal(requests.at(-1).timeout, 18000, 'HTTP timeout excludes time already spent fetching a token');
auth.currentUser = user('synthetic-user');
outcome = config => { requestClock += 30001; return response(config); };
await assert.rejects(submit('late-success'), failure => failure.code === 'ECONNABORTED');
const lateSuccessKey = requests.at(-1).key;
outcome = undefined;
await submit('late-success');
assert.equal(requests.at(-1).key, lateSuccessKey, 'late success must retain the uncertain binding');

const cancelSubmit = (code, controller) => api.submitCodeSolution('contest', 'problem', code, 'cpp', controller.signal);
const alreadyCancelled = new AbortController();
alreadyCancelled.abort();
requestStart = requests.length;
await assert.rejects(cancelSubmit('already-cancelled', alreadyCancelled), axios.isCancel);
assert.equal(requests.length, requestStart);
const cancelledToken = deferred();
auth.currentUser = { uid: 'synthetic-user', getIdToken: () => cancelledToken.promise };
const duringToken = new AbortController();
const cancelledAuth = cancelSubmit('cancel-auth', duringToken);
await flush();
duringToken.abort();
await assert.rejects(cancelledAuth, axios.isCancel);
cancelledToken.resolve('token-synthetic-user');
await flush();
assert.equal(requests.length, requestStart, 'caller cancellation settles hung auth without a late POST');
auth.currentUser = user('synthetic-user');
const duringHttp = new AbortController();
const hungHttp = deferred();
let httpSignal;
outcome = config => { httpSignal = config.signal; return hungHttp.promise; };
const cancelledHttp = cancelSubmit('cancel-http', duringHttp);
await flush();
const cancelledKey = requests.at(-1).key;
duringHttp.abort();
await assert.rejects(cancelledHttp, axios.isCancel);
assert.equal(httpSignal.aborted, true, 'caller cancellation reaches the HTTP adapter');
hungHttp.resolve(response({}));
await flush();
outcome = undefined;
await submit('cancel-http');
assert.equal(requests.at(-1).key, cancelledKey, 'cancelled or late HTTP success cannot release the retry key');
const duringWait = new AbortController();
outcome = error(503, '1');
duringRetryWait = () => duringWait.abort();
requestStart = requests.length;
await assert.rejects(cancelSubmit('cancel-wait', duringWait), axios.isCancel);
assert.equal(requests.length - requestStart, 1, 'caller cancellation during backoff prevents another attempt');
duringRetryWait = undefined;
assert.equal(requestDeadlines.size, 0, 'expired and cancelled calls remove their deadline timers');
console.log('Deadline checks survive overdue timers; caller cancellation covers auth, HTTP, backoff, and late success.');

console.log('Code retries preserve UUID/payload/identity, respect Retry-After and total deadline, stop at three, and leave other POSTs unchanged.');

// Exercise the actual preview element with React's renderer, using hostile saved text.
const previewSource = ts.createSourceFile('AddContest.tsx', read('src/pages/AddContest.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let preview;
const visit = node => {
  if (ts.isJsxElement(node) && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(previewSource) === 'formData.description')) preview = node;
  ts.forEachChild(node, visit);
};
visit(previewSource);
assert.ok(preview);
const previewContext = {
  exports: {}, require: () => ({ jsx: React.createElement, jsxs: React.createElement }),
  formData: { description: '<img src=x onerror=alert(1)>[x](javascript:alert(1))' },
};
// JSX runtime takes props.children; provide the real runtime, rather than a DOM mock.
const jsxRuntime = await import('react/jsx-runtime');
previewContext.require = () => jsxRuntime;
const element = vm.runInNewContext(compile(`(${preview.getText(previewSource)})`), previewContext);
const html = renderToStaticMarkup(element);
assert.ok(html.includes('&lt;img'));
assert.ok(!html.includes('<img') && !html.includes('<a '));
console.log('Retry parsing, permanent errors, jitter, and escaped React preview checks passed.');

// Run the real problem-list hook with a tiny scheduler and mocked HTTP service.
const checkProblemPolling = async (failures, expectedCalls, minimumRetry = 0, initialFailure = false) => {
  const states = [];
  const timers = [];
  const delays = [];
  let calls = 0;
  let cleanup;
  const hookModule = {
    exports: {}, AbortController,
    setTimeout(callback, delay) { timers.push(callback); delays.push(delay); return timers.length; },
    clearTimeout() {},
    require(name) {
      if (name === 'react') return {
        useState(value) {
          const index = states.push(value) - 1;
          return [value, update => { states[index] = typeof update === 'function' ? update(states[index]) : update; }];
        },
        useCallback: callback => callback,
        useEffect: effect => { cleanup = effect(); },
      };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: { uid: 'synthetic-user' } }) };
      if (name.endsWith('/requestPolicy')) return { ...policyModule.exports, requestTimeout(callback, delay) { timers.push(callback); delays.push(delay); return () => {}; } };
      return { contestApi: { async getContestProblems() {
        calls += 1;
        if (initialFailure || calls > 1) throw failures;
        return [{ progress: 'judging' }];
      } } };
    },
  };
  vm.runInNewContext(compile(read('src/features/contests/hooks/useContestProblems.ts')), hookModule);
  hookModule.exports.useContestProblems('contest');
  for (let step = 0; step < 10; step++) {
    await new Promise(resolve => setImmediate(resolve));
    if (!timers.length) break;
    timers.shift()();
  }
  assert.equal(calls, expectedCalls);
  if (minimumRetry) assert.ok(delays[1] >= minimumRetry);
  assert.equal(states[1].problems.length, initialFailure ? 0 : 1, 'failed polling retains any loaded navigation list');
  assert.ok(states[1].error, 'stopped polling exposes an error for manual recovery');
  cleanup();
};
await checkProblemPolling(error(403), 2);
await checkProblemPolling(error(503), 4);
await checkProblemPolling(error(429, '30'), 4, 30000);
await checkProblemPolling(new Error('backend unavailable'), 1, 0, true);
await checkProblemPolling(error(429, '30'), 1, 0, true);
console.log('Actual problem polling stops on permanent errors, bounds transient failures, and honors Retry-After.');
const pollSource = ts.createSourceFile('hook.ts', read('src/features/contests/hooks/useProblemSubmissions.ts'), ts.ScriptTarget.Latest, true);
let pollFunction;
const findPoll = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(pollSource) === 'pollSubmission') pollFunction = node.initializer.arguments[0].getText(pollSource);
  ts.forEachChild(node, findPoll);
};
findPoll(pollSource);
for (const [failure, expectedCalls, minimum] of [[error(403), 1, 0], [error(503), 3, 0], [error(429, '30'), 2, 30000]]) {
  let now = 0;
  let calls = 0;
  const delays = [];
  const context = {
    pollTokenRef: { current: 0 }, Date: { now: () => now },
    FIRST_POLL_DELAY_MS: 1000, MAX_POLL_DELAY_MS: 5000, POLL_TIMEOUT_MS: 60000,
    ...policyModule.exports,
    wait: async delay => { delays.push(delay); now += delay; },
    contestApi: { async getSubmissionStatus() { calls++; throw failure; } },
    setActiveSubmission() {}, getErrorMessage: () => 'synthetic error',
  };
  const poll = vm.runInNewContext(compile(`(${pollFunction})`), context);
  await poll({ id: 'synthetic-submission' });
  assert.equal(calls, expectedCalls);
  if (minimum) assert.ok(delays[1] >= minimum);
}
console.log('Actual verdict polling stops on permanent errors, bounds failures/deadline, and honors Retry-After.');

// Exercise hook lifecycle wiring with the real API; mounted browser checks remain separate.
const hookCleanups = [];
const hookSignals = [];
const lifecycleToken = deferred();
auth.currentUser = { uid: 'synthetic-user', getIdToken: () => lifecycleToken.promise };
const lifecycleModule = { exports: {}, AbortController, require(name) {
  if (name === 'react') return {
    useRef: current => ({ current }), useState: current => [current, () => {}],
    useCallback: callback => callback, useMemo: callback => callback(),
    useEffect: effect => hookCleanups.push(effect()),
  };
  if (name === 'axios') return { default: axios };
  if (name.endsWith('/requestPolicy')) return policyModule.exports;
  if (name.endsWith('/contestApi')) return { contestApi: {
    submitCodeSolution(...args) { hookSignals.push(args[4]); return api.submitCodeSolution(...args); },
  } };
  throw new Error(`Unexpected hook module ${name}`);
} };
vm.runInNewContext(compile(read('src/features/contests/hooks/useProblemSubmissions.ts')), lifecycleModule);
const lifecycleHook = lifecycleModule.exports.useProblemSubmissions('contest', 'problem', { skip: true });
requestStart = requests.length;
const superseded = lifecycleHook.submitCode('superseded', 'cpp');
await flush();
const unmounted = lifecycleHook.submitCode('unmounted', 'cpp');
await flush();
assert.equal(hookSignals[0].aborted, true, 'new submissions cancel the previous operation');
hookCleanups.forEach(cleanup => cleanup?.());
await Promise.all([superseded, unmounted]);
assert.equal(hookSignals[1].aborted, true, 'scope cleanup cancels the active submission');
lifecycleToken.resolve('token-synthetic-user');
await flush();
assert.equal(requests.length, requestStart, 'unmounted and superseded auth lookups cannot dispatch');
assert.equal(requestDeadlines.size, 0);
auth.currentUser = user('synthetic-user');
console.log('Submission hook cleanup and supersession cancel the real API operation.');


// Timers use a monotonic clock, cancel real scheduled chunks, and ignore wall-clock correction.
let timerNow = 0;
let wallNow = Date.now();
let timerId = 0;
const scheduled = new Map();
const timerModule = {
  exports: {}, require: () => ({ default: axios }),
  Date: { now: () => wallNow }, performance: { now: () => timerNow },
  setTimeout(callback, delay) { scheduled.set(++timerId, { callback, delay }); return timerId; },
  clearTimeout(id) { scheduled.delete(id); },
};
vm.runInNewContext(compile(read('src/lib/requestPolicy.ts')), timerModule);
const fireNextTimer = () => {
  const [id, timer] = scheduled.entries().next().value;
  scheduled.delete(id);
  timerNow += timer.delay;
  timer.callback();
};
let fired = false;
const cancelLongWait = timerModule.exports.requestTimeout(() => { fired = true; }, 3_000_000_000);
assert.equal(scheduled.values().next().value.delay, 2_147_483_647);
fireNextTimer();
assert.equal(fired, false);
assert.equal(scheduled.values().next().value.delay, 852_516_353);
cancelLongWait();
assert.equal(scheduled.size, 0, 'cancellation removes the current scheduled chunk');
assert.equal(fired, false, 'cancelled wait never invokes the callback');
timerModule.exports.requestTimeout(() => { fired = true; }, 60_000);
wallNow -= 3_600_000;
fireNextTimer();
assert.equal(fired, true, 'wall-clock rollback does not extend the relative timer');
assert.equal(scheduled.size, 0);
console.log('Long delays use safe chunks; cancellation and wall-clock correction preserve timer behavior.');

// Exercise the shared UID store and subscriptions; real mounted React behavior is checked in the browser.
let cooldownNow = 0;
const cooldownTimers = new Map();
let cooldownTimerId = 0;
let mount;
let cooldownUserId = 'account-A';
const cooldownModule = {
  exports: {}, performance: { now: () => cooldownNow },
  require(name) {
    if (name === 'react') return {
      useRef: current => ({ current }), useCallback: callback => callback,
      useEffect: effect => { mount.cleanups.push(effect()); },
      useSyncExternalStore(subscribe, getSnapshot) {
        mount.snapshot = getSnapshot;
        const target = mount;
        target.unsubscribe = subscribe(() => { target.notifications += 1; });
        return getSnapshot();
      },
    };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: { uid: cooldownUserId } }) };
    if (name.endsWith('/requestPolicy')) return {
      retryAfterDelay,
      requestTimeout(callback, delay) {
        const id = ++cooldownTimerId;
        cooldownTimers.set(id, { callback, until: cooldownNow + delay });
        return () => cooldownTimers.delete(id);
      },
    };
    throw new Error(`Unexpected module ${name}`);
  },
};
vm.runInNewContext(compile(read('src/features/contests/hooks/useRequestCooldown.ts')), cooldownModule);
const mountCooldown = uid => {
  cooldownUserId = uid;
  mount = { cleanups: [], notifications: 0 };
  const instance = mount;
  instance.hook = cooldownModule.exports.useRequestCooldown();
  instance.dispose = () => { instance.cleanups.forEach(cleanup => cleanup?.()); instance.unsubscribe(); };
  return instance;
};
const runCooldown = mountCooldown('account-A');
const submitCooldown = mountCooldown('account-A');
const otherAccount = mountCooldown('account-B');
runCooldown.hook.coolDown(error(429, '30'));
assert.equal(runCooldown.snapshot(), true);
assert.equal(submitCooldown.snapshot(), true, 'Run rejection also blocks Submit for the same UID');
assert.equal(otherAccount.snapshot(), false, 'a different account has no inherited cooldown');
assert.ok(submitCooldown.notifications > 0, 'other consumers are notified');
runCooldown.dispose();
const remountedProblem = mountCooldown('account-A');
assert.equal(remountedProblem.snapshot(), true, 'problem navigation preserves the account cooldown');
const timerCount = cooldownTimers.size;
runCooldown.hook.coolDown(error(429, '600'));
assert.equal(cooldownTimers.size, timerCount, 'late response after unmount cannot create a timer');
submitCooldown.hook.coolDown(error(503, '60'));
assert.equal(cooldownTimers.size, 1, 'extending a cooldown cancels its old timer');
remountedProblem.hook.coolDown(error(429, '1'));
assert.equal([...cooldownTimers.values()][0].until, 60_000, 'a shorter rejection cannot shorten an existing wait');
cooldownNow = 60_000;
const [expiredId, expired] = cooldownTimers.entries().next().value;
cooldownTimers.delete(expiredId);
expired.callback();
assert.equal(submitCooldown.snapshot(), false);
assert.equal(remountedProblem.snapshot(), false, 'expiry releases every consumer');
submitCooldown.dispose();
remountedProblem.dispose();
otherAccount.dispose();
console.log('Cooldowns share UID scope across actions/remounts, isolate accounts, and ignore unmounted callbacks.');

// Main now renders opted-in Markdown/LaTeX: keep its real plugins inside the safe defaults.
const mathDependencies = {
  'react/jsx-runtime': jsxRuntime,
  'react': { default: React },
  'react-markdown': await import('react-markdown'),
  'remark-math': await import('remark-math'),
  'rehype-katex': await import('rehype-katex'),
};
const markdownTextDependencies = {
  unified: await import('unified'),
  'remark-parse': await import('remark-parse'),
};
const markdownTextModule = { exports: {}, require: name => markdownTextDependencies[name] };
vm.runInNewContext(compile(read('src/features/contests/markdownText.ts')), markdownTextModule);
mathDependencies['../../markdownText'] = markdownTextModule.exports;
const mathModule = { exports: {}, require: name => mathDependencies[name] };
vm.runInNewContext(compile(read('src/features/contests/components/workspace/MathText.tsx')
  .replace("import 'katex/dist/katex.min.css';", '')), mathModule);
for (const input of ['<img src=x onerror=alert(1)>', '[link](javascript:alert%281%29)', String.raw`$\href{javascript:alert(1)}{link}$`]) {
  const rendered = renderToStaticMarkup(React.createElement(mathModule.exports.MathText, { children: `:::markdown\n${input}` }));
  assert.ok(!rendered.includes('<img') && !rendered.includes('href="javascript:'), rendered);
}
const renderMathText = children => renderToStaticMarkup(React.createElement(mathModule.exports.MathText, { children }));
const nestedCodeMarkdown = [
  ':::markdown',
  '- List example:',
  '  ```text',
  String.raw`  \(literal\)`,
  '  ```',
  '> Quoted example:',
  '> ```text',
  String.raw`> \(also literal\)`,
  '> ```',
  '',
  String.raw`Inline code: ` + '`' + String.raw`\(literal\)` + '`',
  'Multiline code: `' + String.raw`\(line one` + '\n' + String.raw`line two\)` + '`',
  '',
  '```text',
  String.raw`\(fenced literal\)`,
  '```',
].join('\n');
const nestedCodeHtml = renderMathText(nestedCodeMarkdown);
assert.ok(!nestedCodeHtml.includes('class="katex"'), nestedCodeHtml);
assert.ok(nestedCodeHtml.includes('\\(literal\\)'), nestedCodeHtml);
assert.ok(nestedCodeHtml.includes('\\(also literal\\)'), nestedCodeHtml);

const multilineInlineMath = renderMathText(`:::markdown\n${String.raw`\(x`}\n${String.raw`+1\)`}`);
assert.ok(multilineInlineMath.includes('class="katex"'), multilineInlineMath);

const multilineDisplayMath = renderMathText(`:::markdown\n${String.raw`\[` }\nx + 1\n${String.raw`\]`}`);
assert.ok(multilineDisplayMath.includes('katex-display'), multilineDisplayMath);

const quotedDisplayMath = renderMathText(`:::markdown\n> ${String.raw`\[` }\n> x+1\n> ${String.raw`\]`}`);
assert.match(quotedDisplayMath, /<blockquote>[\s\S]*katex-display[\s\S]*<\/blockquote>/, quotedDisplayMath);
assert.ok(!quotedDisplayMath.includes('&gt;'), quotedDisplayMath);

const listDisplayMath = renderMathText(`:::markdown\n- ${String.raw`\[x+1\]`}`);
assert.match(listDisplayMath, /<li>[\s\S]*katex-display[\s\S]*<\/li>/, listDisplayMath);

const linkedMathUrl = renderMathText(String.raw`:::markdown
[example](https://example.invalid/\(x\))

<https://example.invalid/\(x\)>

https://example.invalid/\(x\)`);
assert.ok(!linkedMathUrl.includes('class="katex"'), linkedMathUrl);
assert.ok(linkedMathUrl.includes('https://example.invalid/'), linkedMathUrl);

const linkedLabelMath = renderMathText(String.raw`:::markdown
[Size \(x\)](https://example.invalid/\(target\))`);
assert.ok(linkedLabelMath.includes('class="katex"'), linkedLabelMath);
assert.ok(linkedLabelMath.includes('href="https://example.invalid/(target)"'), linkedLabelMath);

const ordinaryText = renderMathText('Costs $5 and $10, with _x_ and four spaces below.\n    code sample');
assert.ok(!ordinaryText.includes('class="katex"') && !ordinaryText.includes('<em>x</em>'), ordinaryText);
console.log('Actual Markdown renderer preserves nested code, multiline math, plain text, and security defaults.');
