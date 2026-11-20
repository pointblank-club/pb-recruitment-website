// Mounts the Yandex callback page and connect box with a small hook harness (the same
// approach as leaderboard-freeze-control.test.mjs): StrictMode replay, unmounting,
// account switches and late or malformed responses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import axios from 'axios';

const compile = (path, jsx = false) => ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.React } : {}) },
}).outputText;

const createHarness = () => {
  const hooks = [];
  let cursor = 0;
  const depsEqual = (a, b) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  const react = {
    ...React,
    useState(initialValue) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [hooks[index].value, (next) => {
        hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next;
      }];
    },
    useRef(initialValue) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: { current: initialValue } };
      return hooks[index].value;
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
    react,
    beginRender() { cursor = 0; },
    /** Runs every effect cleanup, as on unmount or StrictMode's simulated unmount. */
    unmount() {
      for (const hook of hooks) {
        if (hook && 'deps' in hook) {
          hook.cleanup?.();
          hook.cleanup = undefined;
          hook.deps = undefined;
        }
      }
    },
  };
};

const loadModule = (source, dependencies, globals) => {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, console, JSON, URLSearchParams, AbortController, ...globals,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
};

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
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

const storage = new Map();
const sessionStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
const lib = { exports: {}, sessionStorage, URL };
vm.runInNewContext(compile('src/lib/yandexConnect.ts'), lib);
const { parseCompletedYandexConnection } = lib.exports;
const RETURN_KEY = 'pb_yandex_connect_return';

const userA = { uid: 'user-a' };
const userB = { uid: 'user-b' };
const confirmed = { enabled: true, required: true, connected: true, token_state: 'active', yandex_login: 'asha' };
const yandexErrorMessage = (error, fallback) => error?.serverMessage || fallback;

// ---------------------------------------------------------------- callback page
const mountCallback = ({ search, user }) => {
  const harness = createHarness();
  const auth = { currentUser: user };
  const session = { user };
  const calls = { complete: [], toasts: [], navigations: [], replaced: [] };
  const pending = [];
  const contestApi = {
    completeYandexConnection(code, state, userId) {
      calls.complete.push({ code, state, userId });
      const exchange = deferred();
      pending.push(exchange);
      return exchange.promise;
    },
  };
  // Values built inside the sandbox have its own prototypes; copy them out for deepEqual.
  const navigate = (to, options) => calls.navigations.push({ to, options: JSON.parse(JSON.stringify(options)) });
  const window = { history: { state: null, replaceState: (_state, _title, url) => calls.replaced.push(url) } };
  const Page = loadModule(compile('src/pages/YandexCallback.tsx', true), {
    react: { ...harness.react, default: harness.react },
    'react-router-dom': { useLocation: () => ({ pathname: '/yandex/callback', search }), useNavigate: () => navigate },
    'lucide-react': { AlertTriangle: 'AlertTriangle', Loader2: 'Loader2' },
    'react-toastify': { toast: { success: (message) => calls.toasts.push(message) } },
    './components/Navbar': { default: 'Navbar' },
    './components/footer': { default: 'Footer' },
    '@/lib/AuthContext': { useAuth: () => ({ user: session.user }) },
    '@/lib/firebase': { auth },
    '@/lib/yandexConnect': lib.exports,
    '@/services/api/contestApi': { contestApi, yandexErrorMessage },
  }, { window, React: harness.react }).default;
  const render = () => { harness.beginRender(); return Page(); };
  const switchUser = (next) => { auth.currentUser = next; session.user = next; };
  return { render, harness, calls, pending, switchUser };
};

{
  // StrictMode replays the effect while the exchange is in flight: one request, one success.
  storage.set(RETURN_KEY, 'contest-1');
  const page = mountCallback({ search: '?code=c1&state=s1', user: userA });
  page.render();
  page.harness.unmount();
  page.render();
  assert.equal(page.calls.complete.length, 1, 'StrictMode replay reuses the in-flight exchange');
  assert.deepEqual(page.calls.complete[0], { code: 'c1', state: 's1', userId: 'user-a' });
  assert.deepEqual(page.calls.replaced.at(-1), '/yandex/callback', 'the code is removed from the address bar');
  assert.equal(storage.has(RETURN_KEY), false);
  page.pending[0].resolve({ connection: confirmed, contestId: 'contest-1' });
  await flush();
  assert.deepEqual(page.calls.toasts, ['Yandex account connected: asha']);
  assert.deepEqual(page.calls.navigations, [{ to: '/contest/contest-1', options: { replace: true } }]);
}

{
  // Switching accounts mid-exchange: A's result is ignored and B gets its own request.
  const page = mountCallback({ search: '?code=c2&state=s2', user: userA });
  page.render();
  page.switchUser(userB);
  page.render();
  assert.deepEqual(page.calls.complete.map(call => call.userId), ['user-a', 'user-b'], 'the new account does not reuse A\'s exchange');
  page.pending[0].resolve({ connection: confirmed, contestId: 'contest-1' });
  await flush();
  assert.deepEqual(page.calls.toasts, [], 'A\'s success is not shown to B');
  assert.deepEqual(page.calls.navigations, []);
  page.pending[1].reject({ serverMessage: 'this connection link is invalid or has expired; start again' });
  await flush();
  assert.match(textOf(page.render()), /invalid or has expired/, 'B sees the server\'s rejection');
}

{
  // A pending exchange whose account signs out before it settles shows nothing.
  const page = mountCallback({ search: '?code=c3&state=s3', user: userA });
  page.render();
  page.switchUser(userB); // Firebase changed before React re-rendered.
  page.pending[0].resolve({ connection: confirmed });
  await flush();
  assert.deepEqual(page.calls.toasts, []);
  assert.deepEqual(page.calls.navigations, []);
}

{
  // A failed exchange is not cached: a remount with the same code tries again.
  const first = mountCallback({ search: '?code=c4&state=s4', user: userA });
  first.render();
  first.pending[0].reject({ serverMessage: 'could not reach Yandex; try again shortly' });
  await flush();
  assert.match(textOf(first.render()), /could not reach Yandex/);
  first.harness.unmount();
  first.render();
  assert.equal(first.calls.complete.length, 2, 'a replayed effect after the failure settled sends a fresh request');
  first.harness.unmount();
  const second = mountCallback({ search: '?code=c4&state=s4', user: userA });
  second.render();
  assert.equal(second.calls.complete.length, 1, 'the remount sends its own request');
  second.pending[0].resolve({ connection: confirmed });
  await flush();
  assert.deepEqual(second.calls.navigations, [{ to: '/contests', options: { replace: true } }]);
}

{
  // A 200 that does not confirm an active connection is a failure, not a success.
  const page = mountCallback({ search: '?code=c5&state=s5', user: userA });
  page.render();
  page.pending[0].resolve(Promise.resolve().then(() => parseCompletedYandexConnection({})));
  await flush();
  assert.deepEqual(page.calls.navigations, []);
  assert.deepEqual(page.calls.toasts, []);
  assert.match(textOf(page.render()), /Could not connect your Yandex account/);
}

{
  // Yandex sends ?error when the candidate cancels: nothing is exchanged.
  const page = mountCallback({ search: '?error=access_denied&state=s6', user: userA });
  assert.match(textOf((page.render(), page.render())), /did not allow access/);
  assert.equal(page.calls.complete.length, 0);
}

// ---------------------------------------------------------------- connect box
const mountCard = ({ user, variant = 'connect', onCancel } = {}) => {
  const harness = createHarness();
  const auth = { currentUser: user };
  const calls = { start: [], assigned: [] };
  const pending = [];
  const contestApi = {
    startYandexConnection(contestId, userId, signal) {
      calls.start.push({ contestId, userId, signal });
      const start = deferred();
      pending.push(start);
      return start.promise;
    },
  };
  const window = { location: { assign: (url) => calls.assigned.push(url) } };
  const { YandexConnectCard } = loadModule(compile('src/features/yandex/YandexConnectCard.tsx', true), {
    react: { ...harness.react, default: harness.react },
    axios: { default: axios },
    'lucide-react': { CheckCircle2: 'CheckCircle2', ExternalLink: 'ExternalLink', Loader2: 'Loader2' },
    '@/lib/AuthContext': { useAuth: () => ({ user }) },
    '@/lib/firebase': { auth },
    '@/lib/yandexConnect': lib.exports,
    '@/services/api/contestApi': { contestApi, yandexErrorMessage },
  }, { window, React: harness.react });
  const render = () => { harness.beginRender(); return YandexConnectCard({ contestId: 'contest-1', variant, onCancel }); };
  const connectButton = (tree) => allElements(tree).find(el => el.type === 'button' && /Yandex|account/.test(textOf(el)) && !/Cancel/.test(textOf(el)));
  const tick = () => allElements(render()).find(el => el.type === 'input').props.onChange({ target: { checked: true } });
  const click = () => connectButton(render()).props.onClick();
  return { render, harness, calls, pending, auth, connectButton, tick, click };
};

{
  // Connect stays disabled until the agreement is ticked; StrictMode replay does not cancel later clicks.
  storage.delete(RETURN_KEY);
  const card = mountCard({ user: userA });
  card.render();
  card.harness.unmount();
  assert.equal(card.connectButton(card.render()).props.disabled, true);
  await card.click();
  assert.equal(card.calls.start.length, 0, 'nothing starts without the agreement');
  card.tick();
  assert.equal(card.connectButton(card.render()).props.disabled, false);
  card.click();
  assert.deepEqual(card.calls.start.map(({ contestId, userId }) => ({ contestId, userId })), [{ contestId: 'contest-1', userId: 'user-a' }]);
  assert.match(textOf(card.render()), /Opening Yandex/);
  card.pending[0].resolve('https://oauth.yandex.com/authorize?state=a');
  await flush();
  assert.deepEqual(card.calls.assigned, ['https://oauth.yandex.com/authorize?state=a']);
  assert.equal(storage.get(RETURN_KEY), 'contest-1');
}

{
  // A Start response that arrives after the box unmounted (account switch, or Cancel on
  // the change-account box) is cancelled and does not navigate.
  for (const variant of ['connect', 'change']) {
    storage.delete(RETURN_KEY);
    const card = mountCard({ user: userA, variant, onCancel: variant === 'change' ? () => {} : undefined });
    card.render();
    card.tick();
    card.click();
    const { signal } = card.calls.start[0];
    card.harness.unmount();
    assert.equal(signal.aborted, true, `${variant}: unmounting cancels the request`);
    card.pending[0].resolve('https://oauth.yandex.com/authorize?state=a');
    await flush();
    assert.deepEqual(card.calls.assigned, [], `${variant}: no navigation after unmount`);
    assert.equal(storage.has(RETURN_KEY), false);
  }
}

{
  // The account changes while the box stays mounted: no navigation, and the button recovers.
  const card = mountCard({ user: userA });
  card.render();
  card.tick();
  card.click();
  card.auth.currentUser = userB;
  card.pending[0].resolve('https://oauth.yandex.com/authorize?state=a');
  await flush();
  assert.deepEqual(card.calls.assigned, []);
  assert.doesNotMatch(textOf(card.render()), /Opening Yandex/);
}

{
  // An account-change cancellation from the API is silent; a real failure shows a message.
  const card = mountCard({ user: userA });
  card.render();
  card.tick();
  card.click();
  card.pending[0].reject(new axios.CanceledError('Authenticated account changed before request dispatch.'));
  await flush();
  assert.doesNotMatch(textOf(card.render()), /Could not start/);
  card.click();
  card.pending[1].reject(new Error('network'));
  await flush();
  assert.match(textOf(card.render()), /Could not start Yandex sign-in/);
}

console.log('Yandex component checks passed: StrictMode exchange, account-scoped callback results, retry after failure, malformed completion, and cancelled Start on unmount or account change.');
