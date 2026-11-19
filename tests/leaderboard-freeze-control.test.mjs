import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = (path) => ts.transpileModule(read(path), {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const createHookHarness = () => {
  const hooks = [];
  let cursor = 0;
  const depsEqual = (a, b) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  const harness = {
    ...React,
    useState(initialValue) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [hooks[index].value, (nextValue) => {
        hooks[index].value = typeof nextValue === 'function' ? nextValue(hooks[index].value) : nextValue;
      }];
    },
    useRef(initialValue) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: { current: initialValue } };
      return hooks[index].value;
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!(index in hooks) || !depsEqual(hooks[index].deps, deps)) hooks[index] = { callback, deps };
      return hooks[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!(index in hooks) || !depsEqual(hooks[index].deps, deps)) {
        hooks[index]?.cleanup?.();
        const cleanup = effect();
        hooks[index] = { cleanup: typeof cleanup === 'function' ? cleanup : undefined, deps };
      }
    },
  };
  return {
    react: harness,
    beginRender() { cursor = 0; },
    strictCleanup() {
      for (const hook of hooks) {
        hook?.cleanup?.();
        if (hook?.cleanup) hook.deps = undefined;
        hook.cleanup = undefined;
      }
    },
  };
};

const loadModule = (source, dependencies, globals = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return module.exports;
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const flushPromises = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

const makeEvents = () => {
  const listeners = new Map();
  return {
    visibilityState: 'visible',
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    dispatch(type) { for (const handler of listeners.get(type) || []) handler(); },
  };
};

const textOf = (node) => {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return textOf(node.props.children);
};

const allElements = (node) => {
  if (Array.isArray(node)) return node.flatMap(allElements);
  if (!React.isValidElement(node)) return [];
  return [node, ...allElements(node.props.children)];
};

const makeControl = ({ adminApi, toast, harness, window, document, auth }) => {
  const fakeAxios = { isAxiosError: (error) => Boolean(error?.isAxiosError) };
  const icons = { Loader2: 'Loader2', Pause: 'Pause', Play: 'Play' };
  const component = loadModule(compile('src/pages/components/LeaderboardFreezeControl.tsx'), {
    react: { ...harness.react, default: harness.react },
    axios: { default: fakeAxios },
    'lucide-react': icons,
    'react-toastify': { toast },
    '@/services/api/adminApi': { adminApi },
    '@/lib/AuthContext': { useAuth: () => ({ user: auth.user }) },
  }, { window, document, React: harness.react, console }).default;
  let props = { contestId: 'contest-a' };
  const render = () => {
    harness.beginRender();
    return component(props);
  };
  return { render, setProps: (next) => { props = next; }, window, document };
};

const toastCalls = () => {
  const calls = { success: [], error: [] };
  return {
    calls,
    success: (message) => calls.success.push(message),
    error: (message) => calls.error.push(message),
  };
};

// Duplicate StrictMode reads cannot let the older response restore stale status.
{
  const reads = [];
  const adminApi = { getLeaderboardFreezeStatus: () => {
    const request = deferred();
    reads.push(request);
    return request.promise;
  } };
  const events = makeEvents();
  const harness = createHookHarness();
  const control = makeControl({ adminApi, toast: toastCalls(), harness, window: makeEvents(), document: events, auth: { user: { uid: 'admin-a' } } });
  control.render();
  assert.equal(reads.length, 1);
  harness.strictCleanup();
  control.render();
  assert.equal(reads.length, 2);
  reads[1].resolve({ frozen: true });
  await flushPromises();
  let tree = control.render();
  assert.match(textOf(tree), /FROZEN/);
  reads[0].resolve({ frozen: false });
  await flushPromises();
  tree = control.render();
  assert.match(textOf(tree), /FROZEN/);
}

// A quiet focus refresh settles the initial loading state when it supersedes the first GET.
{
  const reads = [];
  const adminApi = { getLeaderboardFreezeStatus: () => {
    const request = deferred();
    reads.push(request);
    return request.promise;
  } };
  const window = makeEvents();
  const harness = createHookHarness();
  const control = makeControl({ adminApi, toast: toastCalls(), harness, window, document: makeEvents(), auth: { user: { uid: 'admin-a' } } });
  let tree = control.render();
  assert.match(textOf(tree), /Loading/);

  window.dispatch('focus');
  assert.equal(reads.length, 2);
  reads[1].resolve({ frozen: true });
  await flushPromises();
  tree = control.render();
  assert.match(textOf(tree), /Unfreeze rankings/);
  assert.doesNotMatch(textOf(tree), /Loading/);

  reads[0].resolve({ frozen: false });
  await flushPromises();
  assert.match(textOf(control.render()), /FROZEN/);
}

// A failed quiet refresh also clears loading and leaves Retry available while the initial GET is stale.
{
  const reads = [];
  const adminApi = { getLeaderboardFreezeStatus: () => {
    const request = deferred();
    reads.push(request);
    return request.promise;
  } };
  const window = makeEvents();
  const harness = createHookHarness();
  const control = makeControl({ adminApi, toast: toastCalls(), harness, window, document: makeEvents(), auth: { user: { uid: 'admin-a' } } });
  control.render();
  window.dispatch('focus');
  assert.equal(reads.length, 2);
  reads[1].reject(Object.assign(new Error('Status refresh failed'), { isAxiosError: true }));
  await flushPromises();
  let tree = control.render();
  assert.match(textOf(tree), /Retry/);
  assert.doesNotMatch(textOf(tree), /Loading/);

  reads[0].resolve({ frozen: true });
  await flushPromises();
  tree = control.render();
  assert.match(textOf(tree), /Retry/);
  assert.doesNotMatch(textOf(tree), /Loading/);
}

// Focus (which also fires on tab return) revalidates even after a successful read.
{
  const reads = [];
  const adminApi = { getLeaderboardFreezeStatus: () => {
    const request = deferred();
    reads.push(request);
    return request.promise;
  } };
  const window = makeEvents();
  const document = makeEvents();
  const harness = createHookHarness();
  const control = makeControl({ adminApi, toast: toastCalls(), harness, window, document, auth: { user: { uid: 'admin-a' } } });
  control.render();
  reads[0].resolve({ frozen: false });
  await flushPromises();
  control.render();

  window.dispatch('focus');
  assert.equal(reads.length, 2);
  reads[1].resolve({ frozen: true });
  await flushPromises();
  assert.match(textOf(control.render()), /FROZEN/);
}

// Reads already in flight are invalidated when a mutation starts.
{
  const reads = [];
  const mutation = deferred();
  const adminApi = {
    getLeaderboardFreezeStatus: () => {
      const request = deferred();
      reads.push(request);
      return request.promise;
    },
    setLeaderboardFrozen: () => mutation.promise,
  };
  const notices = toastCalls();
  const window = makeEvents();
  const harness = createHookHarness();
  const control = makeControl({ adminApi, toast: notices, harness, window, document: makeEvents(), auth: { user: { uid: 'admin-a' } } });
  control.render();
  reads[0].resolve({ frozen: false });
  await flushPromises();
  let tree = control.render();

  window.dispatch('focus');
  assert.equal(reads.length, 2);
  tree = control.render();
  const freezeButton = allElements(tree).find((element) => element.type === 'button' && /Freeze rankings/.test(textOf(element)));
  const mutationPromise = freezeButton.props.onClick();
  mutation.resolve({ frozen: true });
  await mutationPromise;
  reads[1].resolve({ frozen: false });
  await flushPromises();
  assert.match(textOf(control.render()), /FROZEN/);
  assert.equal(notices.calls.success.length, 1);
}

// A failed PUT is reconciled because the server may have committed before its response was lost.
{
  const reads = [];
  const mutation = deferred();
  let writes = 0;
  const adminApi = {
    getLeaderboardFreezeStatus: () => {
      const request = deferred();
      reads.push(request);
      return request.promise;
    },
    setLeaderboardFrozen: (_contestId, frozen) => {
      writes++;
      assert.equal(frozen, true);
      return mutation.promise;
    },
  };
  const notices = toastCalls();
  const harness = createHookHarness();
  const control = makeControl({ adminApi, toast: notices, harness, window: makeEvents(), document: makeEvents(), auth: { user: { uid: 'admin-a' } } });
  let tree = control.render();
  reads[0].resolve({ frozen: false });
  await flushPromises();
  tree = control.render();
  const freezeButton = allElements(tree).find((element) => element.type === 'button' && /Freeze rankings/.test(textOf(element)));
  assert.equal(freezeButton.props.disabled, false);
  const mutationPromise = freezeButton.props.onClick();
  assert.equal(writes, 1);
  assert.equal(reads.length, 1);
  mutation.reject(Object.assign(new Error('Response lost'), { isAxiosError: true }));
  await flushPromises();
  assert.equal(reads.length, 2, `reconciliation GET started after PUT error (toast: ${notices.calls.error.join('; ')})`);
  reads[1].resolve({ frozen: true });
  await mutationPromise;
  await flushPromises();
  assert.match(textOf(control.render()), /FROZEN/);
  assert.equal(notices.calls.error.length, 1);
}

// Mutation results and notifications are ignored after moving to a different contest/account.
{
  const reads = [];
  const mutation = deferred();
  const notices = toastCalls();
  const auth = { user: { uid: 'admin-a' } };
  const adminApi = {
    getLeaderboardFreezeStatus: (contestId) => {
      const request = deferred();
      reads.push({ contestId, request });
      return request.promise;
    },
    setLeaderboardFrozen: () => mutation.promise,
  };
  const harness = createHookHarness();
  const control = makeControl({ adminApi, toast: notices, harness, window: makeEvents(), document: makeEvents(), auth });
  let tree = control.render();
  reads[0].request.resolve({ frozen: false });
  await flushPromises();
  tree = control.render();
  const freezeButton = allElements(tree).find((element) => element.type === 'button' && /Freeze rankings/.test(textOf(element)));
  const mutationPromise = freezeButton.props.onClick();

  auth.user = { uid: 'admin-b' };
  control.setProps({ contestId: 'contest-b' });
  control.render();
  mutation.resolve({ frozen: true });
  await mutationPromise;
  await flushPromises();
  assert.equal(notices.calls.success.length, 0);
  assert.equal(reads[1].contestId, 'contest-b');
  reads[1].request.resolve({ frozen: false });
  await flushPromises();
  assert.match(textOf(control.render()), /LIVE/);
}

// Actionable auth and missing-contest errors remain visible; unexpected failures keep generic retry guidance.
{
  const harness = createHookHarness();
  const renderPage = (error, overrides = {}) => {
    const state = {
      leaderboard: [], contest: null, currentUserRank: null, page: 0, setPage() {}, hasNextPage: false,
      isFrozen: false, isLoading: false, error, hasStarted: true, refresh() {},
      ...overrides,
    };
    const component = loadModule(compile('src/features/contests/pages/ContestLeaderboardPage.tsx'), {
      react: { ...harness.react, default: harness.react },
      'react-router-dom': { useParams: () => ({ contestId: 'contest-a' }), useNavigate: () => () => {}, Link: 'a' },
      'lucide-react': { Code2: 'Code2' },
      '../hooks/useLeaderboard': { useLeaderboard: () => state },
      '../components/LeaderboardTable': { LeaderboardTable: 'LeaderboardTable' },
      '@/services/api/adminApi': { adminApi: { checkAdminAccess: async () => {} } },
      '@/lib/AuthContext': { useAuth: () => ({ user: null, loading: false }) },
    }, { React: harness.react }).ContestLeaderboardPage;
    harness.beginRender();
    return component();
  };
  assert.match(textOf(renderPage('invalid ID token')), /invalid ID token/);
  assert.match(textOf(renderPage('Contest not found')), /Contest not found/);
  assert.match(textOf(renderPage('Network Error')), /Please try again/);
  assert.match(textOf(renderPage(null, {
    error: null,
    contest: { name: 'Spring Contest' },
    hasStarted: false,
  })), /Contest Not Started/);
}

console.log('Leaderboard freeze control checks passed: stale reads, focus refresh, uncertain PUT reconciliation, scoped notifications, and actionable page errors.');
