import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source.replaceAll('import.meta.env', '({})'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const axios = { isAxiosError: error => error?.isAxiosError === true };
const error = (status, retryAfter) => ({ isAxiosError: true, response: { status, headers: { 'retry-after': retryAfter } } });
const policyModule = { exports: {}, require: () => ({ default: axios }) };
vm.runInNewContext(compile(read('src/lib/requestPolicy.ts')), policyModule);
const { retryAfterDelay, isPermanentRequestError, jitterDelay } = policyModule.exports;
assert.equal(retryAfterDelay(error(429, '17')), 17000);
assert.equal(retryAfterDelay(error(503, 'not-a-date')), 1000);
assert.equal(retryAfterDelay(error(429, undefined)), 1000);
assert.equal(retryAfterDelay(error(400, '17')), 0);
assert.equal(retryAfterDelay(new Error('offline')), 0);
const future = new Date(Date.now() + 20000).toUTCString();
assert.ok(retryAfterDelay(error(503, future)) >= 18000);
assert.ok(retryAfterDelay(error(503, future)) <= 20000);
for (const status of [400, 401, 403, 404, 409]) assert.ok(isPermanentRequestError(error(status)));
for (const status of [408, 429, 500, 503]) assert.equal(isPermanentRequestError(error(status)), false);
for (let n = 0; n < 50; n++) assert.ok(jitterDelay(1000) >= 1000 && jitterDelay(1000) <= 1200);

let outcome;
const requests = [];
const client = {
  interceptors: { request: { use() {} }, response: { use() {} } },
  async post(path, payload, config) {
    requests.push({ path, payload, key: config.headers['Idempotency-Key'] });
    if (outcome) throw outcome;
    return { data: { submission_id: 'synthetic-submission' } };
  },
};
axios.create = () => client;
const auth = { currentUser: { uid: 'synthetic-user' } };
const apiModule = {
  exports: {}, crypto: { randomUUID },
  require(name) {
    if (name === 'axios') return { default: axios };
    if (name.endsWith('/firebase')) return { auth };
    if (name.endsWith('/base64')) return { encodeBase64: value => Buffer.from(value).toString('base64') };
    return {};
  },
};
vm.runInNewContext(compile(read('src/services/api/contestApi.ts')), apiModule);
const api = apiModule.exports.contestApi;
const submit = (code = 'int main(){}') => api.submitCodeSolution('contest', 'problem', code, 'cpp');
outcome = new Error('response lost');
await assert.rejects(submit());
const first = requests.at(-1).key;
assert.match(first, /^[0-9a-f-]{36}$/);
outcome = error(503);
await assert.rejects(submit());
assert.equal(requests.at(-1).key, first, 'uncertain outcome keeps original key');
outcome = error(429, '30');
await assert.rejects(submit());
assert.equal(requests.at(-1).key, first, 'rate rejection before replay lookup preserves ambiguous request key');
outcome = undefined;
await submit();
assert.equal(requests.at(-1).key, first, 'retry success reuses original key');
await submit();
assert.notEqual(requests.at(-1).key, first, 'new successful submission gets new key');
outcome = error(400);
await assert.rejects(submit());
const rejected = requests.at(-1).key;
await assert.rejects(submit());
assert.notEqual(requests.at(-1).key, rejected, 'definite rejection clears key');
outcome = new Error('offline');
await assert.rejects(submit('changed'));
const changed = requests.at(-1).key;
auth.currentUser.uid = 'another-user';
await assert.rejects(submit('changed'));
assert.notEqual(requests.at(-1).key, changed, 'keys are scoped to user');

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
console.log('Retry delays, permanent errors, jitter, mocked Submit idempotency, and escaped preview checks passed.');

// Run the real problem-list hook with a tiny scheduler and mocked HTTP service.
const checkProblemPolling = async (failures, expectedCalls, minimumRetry = 0) => {
  const timers = [];
  const delays = [];
  let calls = 0;
  let cleanup;
  const hookModule = {
    exports: {}, AbortController,
    setTimeout(callback, delay) { timers.push(callback); delays.push(delay); return timers.length; },
    clearTimeout() {},
    require(name) {
      if (name === 'react') return { useState: value => [value, () => {}], useEffect: effect => { cleanup = effect(); } };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: { uid: 'synthetic-user' } }) };
      if (name.endsWith('/requestPolicy')) return { ...policyModule.exports, requestTimeout(callback, delay) { timers.push(callback); delays.push(delay); return () => {}; } };
      return { contestApi: { async getContestProblems() {
        calls += 1;
        if (calls > 1) throw failures;
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
  cleanup();
};
await checkProblemPolling(error(403), 2);
await checkProblemPolling(error(503), 4);
await checkProblemPolling(error(429, '30'), 4, 30000);
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

// A very long Retry-After must neither overflow a browser timer nor run early.
let timerNow = 0;
let timerId = 0;
let pendingTimer;
let cancelledTimer;
const timerModule = {
  exports: {}, require: () => ({ default: axios }), Date: { now: () => timerNow },
  setTimeout(callback, delay) { pendingTimer = { callback, delay, id: ++timerId }; return timerId; },
  clearTimeout(id) { cancelledTimer = id; },
};
vm.runInNewContext(compile(read('src/lib/requestPolicy.ts')), timerModule);
let fired = false;
const cancelLongWait = timerModule.exports.requestTimeout(() => { fired = true; }, 3_000_000_000);
assert.equal(pendingTimer.delay, 2_147_483_647);
timerNow += pendingTimer.delay;
pendingTimer.callback();
assert.equal(fired, false);
assert.equal(pendingTimer.delay, 852_516_353);
const activeTimer = pendingTimer.id;
cancelLongWait();
assert.equal(cancelledTimer, activeTimer, 'cleanup cancels the current chunk');
timerNow += pendingTimer.delay;
pendingTimer.callback();
assert.equal(fired, true);
console.log('Long Retry-After uses safe timer chunks without shortening the delay; cleanup cancels the latest chunk.');

// Main now renders opted-in Markdown/LaTeX: keep its real plugins inside the safe defaults.
const mathDependencies = {
  'react/jsx-runtime': jsxRuntime,
  'react': { default: React },
  'react-markdown': await import('react-markdown'),
  'remark-math': await import('remark-math'),
  'rehype-katex': await import('rehype-katex'),
};
const mathModule = { exports: {}, require: name => mathDependencies[name] };
vm.runInNewContext(compile(read('src/features/contests/components/workspace/MathText.tsx')
  .replace("import 'katex/dist/katex.min.css';", '')), mathModule);
for (const input of ['<img src=x onerror=alert(1)>', '[link](javascript:alert%281%29)', String.raw`$\href{javascript:alert(1)}{link}$`]) {
  const rendered = renderToStaticMarkup(React.createElement(mathModule.exports.MathText, { children: `:::markdown\n${input}` }));
  assert.ok(!rendered.includes('<img') && !rendered.includes('href="javascript:'), rendered);
}
console.log('Actual Markdown/LaTeX renderer rejects executable HTML and JavaScript links.');
