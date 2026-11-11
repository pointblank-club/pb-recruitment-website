import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = (source, filename) => ts.transpileModule(
  source.replaceAll('import.meta.env', '({ VITE_API_BASE_URL: "" })'),
  {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }
).outputText;

const createStorageStub = () => {
  const store = new Map();
  let throwOnSet = false;
  return {
    get length() {
      return store.size;
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => {
      if (throwOnSet) throw new Error('Storage disabled');
      store.set(key, String(val));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    _setThrowOnWrite: (flag) => {
      throwOnSet = flag;
    },
    _dump: () => new Map(store),
  };
};

const createBrowserEnv = () => {
  const windowTarget = new EventTarget();
  windowTarget.location = { href: 'http://localhost:5173/contests/c1' };
  const docTarget = new EventTarget();
  let visibilityState = 'visible';
  let onLine = true;
  let hasFocus = true;

  Object.defineProperty(docTarget, 'visibilityState', {
    get: () => visibilityState,
    configurable: true,
  });
  docTarget.fullscreenElement = null;
  docTarget.exitFullscreen = async () => {};
  docTarget.hasFocus = () => hasFocus;

  Object.defineProperty(windowTarget, 'navigator', {
    get: () => ({ onLine }),
    configurable: true,
  });

  const storage = createStorageStub();
  return {
    window: windowTarget,
    document: docTarget,
    localStorage: storage,
    setVisibility(next) {
      visibilityState = next;
      docTarget.dispatchEvent(new Event('visibilitychange'));
    },
    setOnline(next) {
      onLine = next;
      windowTarget.dispatchEvent(new Event(next ? 'online' : 'offline'));
    },
    setFocus(next) {
      hasFocus = next;
      windowTarget.dispatchEvent(new Event(next ? 'focus' : 'blur'));
    },
    dispatchStorage(key) {
      const ev = new Event('storage');
      ev.key = key;
      windowTarget.dispatchEvent(ev);
    },
  };
};

const loadModules = ({ authState, axiosAdapter, toasts }) => {
  const storageModule = { exports: {} };
  const apiModule = { exports: {} };
  const syncModule = { exports: {} };

  const baseCtx = {
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Error,
    Promise,
    Uint8Array,
    RegExp,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    localStorage: globalThis.localStorage,
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    AbortController,
    Event,
  };

  const runCjs = (relPath, customRequire, targetModule) => {
    const code = compile(read(relPath), relPath);
    const fn = vm.runInNewContext(`(function(exports, require, module){${code}\n})`, { ...baseCtx });
    fn(targetModule.exports, customRequire, targetModule);
    return targetModule.exports;
  };

  runCjs('src/lib/contestStorage.ts', () => ({}), storageModule);

  const axios = require('axios');
  const contestApiRequire = (id) => {
    if (id === 'axios') return axios;
    if (id === '@/lib/firebase') return { auth: authState };
    if (id === '@/features/contests/problemAdapter') {
      return { toProblemDetails: (x) => x, toProblemOverview: (x) => x };
    }
    if (id === '@/models/contest') return { Contest: class {} };
    if (id === '@/lib/base64') return { encodeBase64: (s) => Buffer.from(s).toString('base64') };
    return {};
  };

  runCjs('src/services/api/contestApi.ts', contestApiRequire, apiModule);
  apiModule.exports.contestApi.axiosInstance.defaults.adapter = axiosAdapter;

  const syncRequire = (id) => {
    if (id === '@/lib/contestStorage') return storageModule.exports;
    if (id === '@/services/api/contestApi') return apiModule.exports;
    throw new Error(`Unexpected import in tabSwitchSync: ${id}`);
  };
  runCjs('src/features/contests/tabSwitchSync.ts', syncRequire, syncModule);

  const createHookModule = (reactImpl) => {
    const hookModule = { exports: {} };
    const hookRequire = (id) => {
      if (id === 'react') return reactImpl;
      if (id === 'react-toastify') return { toast: toasts };
      if (id === '@/lib/contestStorage') return storageModule.exports;
      if (id === '@/services/api/contestApi') return apiModule.exports;
      if (id === '../tabSwitchSync') return syncModule.exports;
      throw new Error(`Unexpected import in useTabSwitchTracker: ${id}`);
    };
    runCjs('src/features/contests/hooks/useTabSwitchTracker.ts', hookRequire, hookModule);
    return hookModule.exports;
  };

  return {
    storage: storageModule.exports,
    api: apiModule.exports,
    sync: syncModule.exports,
    createHookModule,
  };
};

// Lightweight React Hook runner for isolated lifecycle testing in Node.
const mountHook = (hookFactory, initialProps) => {
  const states = [];
  const refs = [];
  const callbacks = [];
  const effects = [];
  let stateIdx = 0;
  let refIdx = 0;
  let callbackIdx = 0;
  let effectIdx = 0;
  let scheduled = false;
  let mounted = true;
  let currentProps = initialProps;
  let latestResult;

  const depsChanged = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

  const reactImpl = {
    useState: (init) => {
      const idx = stateIdx++;
      if (!(idx in states)) {
        states[idx] = typeof init === 'function' ? init() : init;
      }
      const setState = (updater) => {
        if (!mounted) return;
        const next = typeof updater === 'function' ? updater(states[idx]) : updater;
        if (!Object.is(next, states[idx])) {
          states[idx] = next;
          if (!scheduled) {
            scheduled = true;
            queueMicrotask(() => {
              scheduled = false;
              if (mounted) render();
            });
          }
        }
      };
      return [states[idx], setState];
    },
    useRef: (init) => {
      const idx = refIdx++;
      if (!(idx in refs)) refs[idx] = { current: init };
      return refs[idx];
    },
    useCallback: (fn, deps) => {
      const idx = callbackIdx++;
      const prev = callbacks[idx];
      if (!prev || depsChanged(prev.deps, deps)) {
        callbacks[idx] = { fn, deps };
      }
      return callbacks[idx].fn;
    },
    useEffect: (fn, deps) => {
      const idx = effectIdx++;
      const prev = effects[idx];
      if (!prev || depsChanged(prev.deps, deps)) {
        effects[idx] = { fn, deps, cleanup: prev?.cleanup, dirty: true };
      }
    },
  };

  const hookModule = hookFactory(reactImpl);

  const render = () => {
    if (!mounted) return;
    stateIdx = 0;
    refIdx = 0;
    callbackIdx = 0;
    effectIdx = 0;
    latestResult = hookModule.useTabSwitchTracker(currentProps);
    for (const eff of effects) {
      if (eff?.dirty) {
        eff.dirty = false;
        if (typeof eff.cleanup === 'function') eff.cleanup();
        eff.cleanup = eff.fn() ?? undefined;
      }
    }
  };

  render();

  return {
    get current() {
      return latestResult;
    },
    rerender(nextProps) {
      currentProps = nextProps;
      render();
    },
    unmount() {
      mounted = false;
      for (const eff of effects) {
        if (typeof eff?.cleanup === 'function') eff.cleanup();
      }
    },
  };
};

const flushMicrotasks = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Install browser globals cleanly
const env = createBrowserEnv();
globalThis.window = env.window;
globalThis.document = env.document;
globalThis.localStorage = env.localStorage;
Object.defineProperty(globalThis, 'navigator', {
  get: () => env.window.navigator,
  configurable: true,
});

const makeAxiosError = (config, status, data) => {
  const err = new Error(typeof data?.error === 'string' ? data.error : `Request failed with status ${status}`);
  err.isAxiosError = true;
  err.config = config;
  err.response = { status, data, headers: {}, config };
  return err;
};

// Shared simulated backend store for tests
let simBackend;
const resetSimBackend = () => {
  simBackend = {
    mode: 'ok', // 'ok' | 'unsupported' | 'offline' | 'dropFirstNReports'
    failReportsRemaining: 0,
    dropCommittedPostResponsesRemaining: 0,
    holdNextTabSwitchResponse: false,
    releaseHeldPost: null,
    holdNextSessionStatusResponse: false,
    releaseHeldSessionStatus: null,
    sessions: new Map(), // key `${contestId}:${userId}` -> { count, terminated, gen, events: Set }
    requests: [],
  };
};
resetSimBackend();

const authState = {
  currentUser: {
    uid: 'u1',
    getIdToken: async () => `token-for-${authState.currentUser.uid}`,
  },
};

const axiosAdapter = async (config) => {
  if (config.signal?.aborted) {
    throw new (require('axios').CanceledError)('aborted');
  }
  const url = config.url || '';
  const method = (config.method || 'get').toUpperCase();
  const match = url.match(/^\/contests\/([^/]+)\/(session-status|tab-switch)$/);
  assert(match, `Unexpected API url: ${url}`);
  const [, contestId, endpoint] = match;
  const uid = String(config.headers?.Authorization || '').replace('Bearer token-for-', '') || authState.currentUser?.uid;
  simBackend.requests.push({ method, contestId, endpoint, uid, body: config.data ? JSON.parse(config.data) : null });

  if (simBackend.mode === 'unsupported') {
    throw makeAxiosError(config, 404, '404 page not found');
  }
  if (simBackend.mode === 'offline') {
    throw makeAxiosError(config, 503, { error: 'service unavailable' });
  }

  const key = `${contestId}:${uid}`;
  if (!simBackend.sessions.has(key)) {
    simBackend.sessions.set(key, { count: 0, terminated: false, gen: 0, events: new Set() });
  }
  const s = simBackend.sessions.get(key);

  if (endpoint === 'session-status') {
    if (simBackend.holdNextSessionStatusResponse) {
      simBackend.holdNextSessionStatusResponse = false;
      await new Promise((resolve) => {
        simBackend.releaseHeldSessionStatus = () => {
          simBackend.releaseHeldSessionStatus = null;
          resolve();
        };
      });
      if (config.signal?.aborted) {
        throw new (require('axios').CanceledError)('aborted');
      }
    }
    return {
      status: 200,
      data: {
        tab_switch_count: s.count,
        is_tab_switch_terminated: s.terminated,
        generation: s.gen,
      },
      headers: {},
      config,
    };
  }

  // POST /tab-switch
  if (simBackend.failReportsRemaining > 0) {
    simBackend.failReportsRemaining--;
    throw makeAxiosError(config, 500, { error: 'transient failure' });
  }
  const body = JSON.parse(config.data);
  if (
    typeof body?.observation_id !== 'string' ||
    body.observation_id.length === 0 ||
    typeof body?.generation !== 'number' ||
    !Number.isInteger(body.generation) ||
    body.generation < 0 ||
    typeof body?.count !== 'number' ||
    !Number.isInteger(body.count) ||
    body.count < 1 ||
    body.count > 5
  ) {
    throw makeAxiosError(config, 400, { error: 'invalid tab switch payload' });
  }
  if (body.generation !== s.gen) {
    throw makeAxiosError(config, 409, {
      error: 'stale tab switch generation',
      tab_switch_count: s.count,
      is_terminated: s.terminated,
      generation: s.gen,
    });
  }
  const dedupKey = `${s.gen}:${body.observation_id}`;
  if (!s.terminated && !s.events.has(dedupKey)) {
    s.events.add(dedupKey);
    s.count = Math.min(5, s.count + body.count);
    if (s.count >= 5) s.terminated = true;
  }
  if (simBackend.dropCommittedPostResponsesRemaining > 0) {
    simBackend.dropCommittedPostResponsesRemaining--;
    throw makeAxiosError(config, 503, { error: 'gateway response lost after commit' });
  }
  if (simBackend.holdNextTabSwitchResponse) {
    simBackend.holdNextTabSwitchResponse = false;
    await new Promise((resolve) => {
      simBackend.releaseHeldPost = () => {
        simBackend.releaseHeldPost = null;
        resolve();
      };
    });
    if (config.signal?.aborted) {
      throw new (require('axios').CanceledError)('aborted');
    }
  }
  return {
    status: 200,
    data: {
      tab_switch_count: s.count,
      is_terminated: s.terminated,
      generation: s.gen,
    },
    headers: {},
    config,
  };
};

const toastCalls = [];
const toasts = {
  warn: (m) => toastCalls.push({ kind: 'warn', m }),
  error: (m) => toastCalls.push({ kind: 'error', m }),
  info: (m) => toastCalls.push({ kind: 'info', m }),
};

const { storage, sync, api, createHookModule } = loadModules({ authState, axiosAdapter, toasts });

// ─── Test 1: Pure State, Retries, Reset Generation, Manual Submission Separation ───
{
  env.localStorage.clear();
  storage.setContestSubmitted('c1', 'u1');

  let state = storage.createEmptyTabSwitchState();
  state = sync.enqueueLocalTabSwitch(state, 5, 100, 'obs-1');
  state = sync.enqueueLocalTabSwitch(state, 5, 101, 'obs-2');
  assert.equal(sync.getDisplayedTabSwitchCount(state, 5), 0);
  assert.equal(sync.getPendingTabSwitchCount(state), 2);

  // Ack obs-1 even if serverCount reached 3 (from another device)
  state = sync.reconcileServerSnapshot(state, {
    tab_switch_count: 3,
    is_tab_switch_terminated: false,
    generation: 0,
  }, 5, 'obs-1', 102);
  assert.equal(state.serverCount, 3);
  assert.deepEqual(Array.from(state.pendingEvents, (e) => e.observation_id), ['obs-2']);
  assert.deepEqual(state.ackedIds, ['obs-1']);
  assert.equal(sync.getDisplayedTabSwitchCount(state, 5), 3);
  assert.equal(sync.getPendingTabSwitchCount(state), 1);
  assert.equal(sync.isEffectivelyTerminated(state, 'supported', 5), false);

  // Already-acked obs-1 must not re-enqueue in the same generation
  const afterDupEnqueue = sync.enqueueLocalTabSwitch(state, 5, 102, 'obs-1');
  assert.deepEqual(Array.from(afterDupEnqueue.pendingEvents, (e) => e.observation_id), ['obs-2']);

  // Server reaching 4 while obs-2 ACK is still pending must stay below lockout (no 4+1=5 lock!)
  const inFlightFourthState = sync.reconcileServerSnapshot(state, {
    tab_switch_count: 4,
    is_tab_switch_terminated: false,
    generation: 0,
  }, 5, undefined, 102);
  assert.equal(sync.getDisplayedTabSwitchCount(inFlightFourthState, 5), 4);
  assert.equal(sync.getPendingTabSwitchCount(inFlightFourthState), 1);
  assert.equal(sync.isEffectivelyTerminated(inFlightFourthState, 'supported', 5), false);

  // Delayed zero response at gen=0 cannot wipe serverCount=3
  state = sync.reconcileServerSnapshot(state, {
    tab_switch_count: 0,
    is_tab_switch_terminated: false,
    generation: 0,
  }, 5, undefined, 103);
  assert.equal(state.serverCount, 3);

  // Admin reset bumps generation 0 -> 1: wipes old count & pending obs-2!
  state = sync.reconcileServerSnapshot(state, {
    tab_switch_count: 0,
    is_tab_switch_terminated: false,
    generation: 1,
  }, 5, undefined, 104);
  assert.equal(state.serverCount, 0);
  assert.equal(state.resetGeneration, 1);
  assert.equal(state.isTerminated, false);
  assert.equal(state.pendingEvents.length, 0);

  // Delayed pre-reset gen=0 response arriving after reset is ignored
  state = sync.reconcileServerSnapshot(state, {
    tab_switch_count: 5,
    is_tab_switch_terminated: true,
    generation: 0,
  }, 5, undefined, 105);
  assert.equal(state.resetGeneration, 1);
  assert.equal(state.isTerminated, false);

  // Manual completion flag was never cleared!
  assert.equal(storage.getContestSubmitted('c1', 'u1'), true);
}

// ─── Test 2: Account Switch Request Interceptor Guard ───────────────────────────────
{
  const ac = new AbortController();
  authState.currentUser.uid = 'u2';
  const res = await api.contestApi.recordTabSwitch(
    'c1',
    { observation_id: '11111111-1111-4111-8111-111111111111', generation: 0, count: 1 },
    { signal: ac.signal, expectedUserId: 'u1' }
  );
  assert.equal(res.kind, 'error');
  assert.equal(res.aborted, true);
  assert.equal(simBackend.requests.length, 0, 'Must never dispatch u1 request when auth.currentUser is u2');
  authState.currentUser.uid = 'u1';
}

// ─── Test 3: Mounted Hook: Retries, Deduplication, Admin Reset Before Replay ───────
{
  resetSimBackend();
  env.localStorage.clear();
  authState.currentUser.uid = 'u1';
  storage.setContestSubmitted('c1', 'u1'); // Manual completion must survive everything!

  // Simulate pre-existing offline termination state from gen=0, BUT server already reset to gen=1!
  storage.writeLocalTabSwitchState('c1', 'u1', {
    serverCount: 5,
    isTerminated: true,
    resetGeneration: 0,
    pendingEvents: [
      { observation_id: 'old-obs-4', generation: 0, created_at: 10 },
      { observation_id: 'old-obs-5', generation: 0, created_at: 11 },
    ],
    hasServerSnapshot: true,
    updatedAt: 12,
  });
  simBackend.sessions.set('c1:u1', { count: 0, terminated: false, gen: 1, events: new Set() });

  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });

  await delay(30);
  await flushMicrotasks();

  // Mount reconciled generation=1 BEFORE replaying old-obs-4/5!
  const posts = simBackend.requests.filter((r) => r.endpoint === 'tab-switch');
  assert.equal(posts.length, 0, 'Pre-reset gen-0 pending events must NOT replay after admin reset');
  assert.equal(mounted.current.tabSwitchCount, 0);
  assert.equal(mounted.current.isTerminated, false);
  assert.equal(storage.getContestSubmitted('c1', 'u1'), true, 'Reset must NOT erase contest_submitted');

  // Now fail 1st POST attempt once; verify retry reuses same observation_id and server stays at count 1
  simBackend.failReportsRemaining = 1;
  env.setVisibility('hidden');
  env.setVisibility('visible');
  await delay(1200);
  await flushMicrotasks();

  const retryPosts = simBackend.requests.filter((r) => r.endpoint === 'tab-switch');
  assert.equal(retryPosts.length, 2, 'Should fail once and succeed on first retry');
  assert.equal(retryPosts[0].body.observation_id, retryPosts[1].body.observation_id, 'Retries must send same observation_id');
  assert.equal(retryPosts[0].body.generation, 1);
  assert.equal(retryPosts[0].body.count, 1);
  assert.equal(simBackend.sessions.get('c1:u1').count, 1);
  assert.equal(mounted.current.tabSwitchCount, 1);

  mounted.unmount();
}

// ─── Test 4: Mounted Hook: Identity Change Cancels Old Loops & Timers ──────────────
{
  resetSimBackend();
  env.localStorage.clear();
  authState.currentUser.uid = 'u1';
  simBackend.mode = 'offline';
  storage.writeLocalTabSwitchState('c1', 'u1', {
    serverCount: 0,
    isTerminated: false,
    resetGeneration: 0,
    pendingEvents: [{ observation_id: 'u1-pending', generation: 0, created_at: 1 }],
    hasServerSnapshot: true,
    updatedAt: 2,
  });

  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  const requestsBeforeSwitch = simBackend.requests.length;

  // Switch identity + contest
  simBackend.mode = 'ok';
  authState.currentUser.uid = 'u2';
  mounted.rerender({
    contestId: 'c2',
    userId: 'u2',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });

  await delay(1150);
  await flushMicrotasks();

  const u1RequestsAfterSwitch = simBackend.requests
    .slice(requestsBeforeSwitch)
    .filter((r) => r.contestId === 'c1' || r.uid === 'u1');
  assert.equal(u1RequestsAfterSwitch.length, 0, 'No old (c1, u1) requests may fire after identity/contest switch');
  assert.equal(simBackend.sessions.get('c2:u2')?.count ?? 0, 0, 'u1 pending event must never touch u2 session');

  mounted.unmount();
}

// ─── Test 5: Lifecycle (Refresh vs Cancelled Unload Prompt vs Rapid Switches) ───────
{
  resetSimBackend();
  env.localStorage.clear();
  authState.currentUser.uid = 'u1';
  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  await flushMicrotasks();

  // 1) Genuine refresh/close: beforeunload -> hidden -> pagehide
  env.window.dispatchEvent(new Event('beforeunload'));
  env.setVisibility('hidden');
  env.window.dispatchEvent(new Event('pagehide'));
  await delay(80);
  env.window.dispatchEvent(new Event('pageshow'));
  env.setVisibility('visible');
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 0, 'Real refresh/close must stay 0');

  // 2) Dismissed beforeunload prompt -> immediate tab switch (no pagehide!)
  env.window.dispatchEvent(new Event('beforeunload'));
  env.setVisibility('hidden');
  await delay(80); // > 50ms fallback commit
  env.setVisibility('visible');
  await delay(30);
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 1, 'Dismissing reload prompt and switching tabs must count 1');

  // 3) Rapid two switches inside < 1s (previously swallowed by 1000ms debounce)
  env.setVisibility('hidden');
  env.setVisibility('visible');
  env.setVisibility('hidden');
  env.setVisibility('visible');
  await delay(50);
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 3, 'Rapid visible->hidden->visible transitions must count cleanly');

  mounted.unmount();
}

// ─── Test 6: Legacy Unsupported Backend (404) & Storage Failure Resilience ──────────
{
  resetSimBackend();
  env.localStorage.clear();
  simBackend.mode = 'unsupported';
  authState.currentUser.uid = 'u1';

  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  await flushMicrotasks();

  assert.equal(mounted.current.apiStatus, 'unsupported');
  for (let i = 0; i < 6; i++) {
    env.setVisibility('hidden');
    env.setVisibility('visible');
  }
  await delay(20);
  assert.equal(mounted.current.isTerminated, false, 'Older 404 backend must never enforce fake local termination');
  mounted.unmount();

  // Storage throws on write: count still advances monotonically in memory
  resetSimBackend();
  simBackend.mode = 'offline';
  env.localStorage._setThrowOnWrite(true);
  const mountedNoStorage = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  env.setVisibility('hidden');
  env.setVisibility('visible');
  env.setVisibility('hidden');
  env.setVisibility('visible');
  await flushMicrotasks();
  assert.equal(mountedNoStorage.current.tabSwitchCount, 0, 'Confirmed count remains 0 offline');
  assert.equal(mountedNoStorage.current.pendingSyncCount, 2, 'In-memory pending queue continues when localStorage throws');
  assert.equal(mountedNoStorage.current.isTerminated, false);

  // Recover online after offline switches -> converges with server
  simBackend.mode = 'ok';
  env.setOnline(true);
  await delay(60);
  await flushMicrotasks();
  assert.equal(simBackend.sessions.get('c1:u1').count, 2, 'Online event resumes and flushes queued offline events');
  assert.equal(mountedNoStorage.current.tabSwitchCount, 2);
  assert.equal(mountedNoStorage.current.pendingSyncCount, 0);

  env.localStorage._setThrowOnWrite(false);
  mountedNoStorage.unmount();
}

// ─── Test 7: Keyed Account Wrapper, Banned Preservation, No disable-devtool ─────────
{
  const problemPage = read('src/features/contests/pages/ContestProblemPage.tsx');
  assert.match(problemPage, /<ContestProblemContent\s+key=\{user\?\.uid\s*\?\?\s*'guest'\}/);
  assert.match(problemPage, /isTabSwitchTerminationSubmissionError/);

  const manager = read('src/pages/components/ContestantManager.tsx');
  assert.doesNotMatch(manager, /clearContestSubmitted|clearContestLocalState|removeLocalTabSwitchState/);
  const resetMatch = manager.match(/const handleResetTabSwitches =[\s\S]*?(?=const handleStatusChange =)/);
  assert(resetMatch, 'Could not find handleResetTabSwitches in ContestantManager.tsx');
  const resetBody = resetMatch[0];
  assert.match(resetBody, /contestIdRef\.current === targetContestId/);
  assert.doesNotMatch(resetBody, /\bstatus\s*:/, 'Tab-switch reset must preserve existing contestant status');
  assert.doesNotMatch(resetBody, /Banned/, 'Tab-switch reset must not map Banned to Active');

  const timeline = read('src/pages/components/ContestTimeline.tsx');
  assert.doesNotMatch(timeline, /clearContestSubmitted|setContestSubmitted\([^)]*false/);
  assert.doesNotMatch(timeline, /isSubmittedFromServer|is_submitted/);
  assert.match(timeline, /reconcileContestSessionStatus/);

  const mainTsx = read('src/main.tsx');
  assert.doesNotMatch(mainTsx, /disableDevtool/i);
}

// ─── Test 8: Multi-Device Convergence & Cross-Tab Storage Sync ──────────────────────
{
  resetSimBackend();
  env.localStorage.clear();
  authState.currentUser.uid = 'u1';
  storage.setContestSubmitted('c1', 'u1');

  // Device A has 1 acknowledged switch locally, while Device B already pushed server to 2
  storage.writeLocalTabSwitchState('c1', 'u1', {
    serverCount: 1,
    isTerminated: false,
    resetGeneration: 0,
    pendingEvents: [],
    hasServerSnapshot: true,
    updatedAt: 100,
  });
  simBackend.sessions.set('c1:u1', { count: 2, terminated: false, gen: 0, events: new Set(['0:b1', '0:b2']) });

  const reconciled = await sync.reconcileContestSessionStatus({
    contestId: 'c1',
    userId: 'u1',
    maxSwitches: 5,
  });
  assert.equal(reconciled.state.serverCount, 2);
  assert.equal(sync.getDisplayedTabSwitchCount(reconciled.state, 5), 2);
  assert.equal(reconciled.state.isTerminated, false);
  assert.equal(storage.getContestSubmitted('c1', 'u1'), true);

  // Mount Device A, then simulate Device B reaching termination on the server
  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 2);
  assert.equal(mounted.current.isTerminated, false);

  // Device B hits limit on server; Device A focuses window -> reconciles termination
  simBackend.sessions.set('c1:u1', {
    count: 5,
    terminated: true,
    gen: 0,
    events: new Set(['0:b1', '0:b2', '0:b3', '0:b4', '0:b5']),
  });
  env.setFocus(true);
  await delay(30);
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 5);
  assert.equal(mounted.current.isTerminated, true);

  // Another tab writes an admin reset to gen=1 in localStorage -> storage event syncs open tab immediately
  storage.writeLocalTabSwitchState('c1', 'u1', {
    serverCount: 0,
    isTerminated: false,
    resetGeneration: 1,
    pendingEvents: [],
    hasServerSnapshot: true,
    updatedAt: Date.now(),
  });
  env.dispatchStorage('contest_tab_state_c1_u1');
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 0);
  assert.equal(mounted.current.isTerminated, false);

  mounted.unmount();
}

// ─── Test 9: 409 Conflict Adopts New Generation Without Retry & 403 Submit Lock ────
{
  resetSimBackend();
  env.localStorage.clear();
  authState.currentUser.uid = 'u1';
  simBackend.sessions.set('c1:u1', { count: 2, terminated: false, gen: 0, events: new Set(['0:x1', '0:x2']) });

  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 2);

  // Admin resets server to generation 1 BEFORE client learns via GET, so next POST gets 409 Conflict!
  simBackend.sessions.set('c1:u1', { count: 0, terminated: false, gen: 1, events: new Set() });
  const postsBeforeConflict = simBackend.requests.filter((r) => r.endpoint === 'tab-switch').length;

  env.setVisibility('hidden');
  env.setVisibility('visible');
  await delay(40);
  await flushMicrotasks();

  const postsAfterConflict = simBackend.requests.filter((r) => r.endpoint === 'tab-switch').slice(postsBeforeConflict);
  assert.equal(postsAfterConflict.length, 1, '409 stale observation must NOT be retried under new generation');
  assert.equal(mounted.current.tabSwitchCount, 0);
  assert.equal(mounted.current.pendingSyncCount, 0);
  assert.equal(mounted.current.isTerminated, false);
  assert.equal(simBackend.sessions.get('c1:u1').count, 0, 'Server reset state preserved cleanly');

  // Verify 403 on /submission/submit helper & notifyServerTermination immediate UI lock
  const fake403 = makeAxiosError(
    { url: '/submission/submit', method: 'post', headers: {} },
    403,
    { error: 'contest participation terminated due to tab switching' }
  );
  assert.equal(api.isTabSwitchTerminationSubmissionError(fake403), true);

  simBackend.sessions.set('c1:u1', {
    count: 5,
    terminated: true,
    gen: 1,
    events: new Set(['1:a', '1:b', '1:c', '1:d', '1:e']),
  });
  mounted.current.notifyServerTermination();
  await flushMicrotasks();
  assert.equal(mounted.current.isTerminated, true, 'Immediate provisional UI lock while confirming');
  assert.equal(mounted.current.isServerConfirmedTermination, false);
  await delay(20);
  await flushMicrotasks();
  assert.equal(mounted.current.isTerminated, true);
  assert.equal(mounted.current.isServerConfirmedTermination, true);
  assert.equal(mounted.current.isWarningModalOpen, true);

  mounted.unmount();
}

// ─── Test 10: Late 403 Submission Rejection Must Not Poison Reset Generation ──────────
{
  resetSimBackend();
  env.localStorage.clear();
  authState.currentUser.uid = 'u1';
  simBackend.sessions.set('c1:u1', { count: 0, terminated: false, gen: 1, events: new Set() });

  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 0);
  assert.equal(mounted.current.isTerminated, false);

  // Stale submission 403 from before reset arrives after client already reconciled gen=1
  simBackend.holdNextSessionStatusResponse = true;
  mounted.current.notifyServerTermination();
  await delay(10);
  await flushMicrotasks();

  // Provisional UI lock is strictly in-memory & never poisons localStorage
  assert.equal(mounted.current.isTerminated, true);
  assert.equal(mounted.current.isServerConfirmedTermination, false);
  assert.equal(mounted.current.tabSwitchCount, 0);
  const storedDuringProvisional = storage.readLocalTabSwitchState('c1', 'u1');
  assert.equal(storedDuringProvisional.serverCount, 0, 'Must never fabricate count 5 into localStorage');
  assert.equal(storedDuringProvisional.isTerminated, false, 'Must never persist fake termination from submission 403');
  assert.equal(storedDuringProvisional.resetGeneration, 1);

  // Authoritative GET /session-status arrives (still gen=1, count=0, terminated=false) -> unlocks immediately
  assert.equal(typeof simBackend.releaseHeldSessionStatus, 'function');
  simBackend.releaseHeldSessionStatus();
  await delay(20);
  await flushMicrotasks();

  assert.equal(mounted.current.isTerminated, false, 'Reconciling gen=1 count=0 must clear provisional lock');
  assert.equal(mounted.current.isServerConfirmedTermination, false);
  assert.equal(mounted.current.tabSwitchCount, 0);
  assert.equal(storage.readLocalTabSwitchState('c1', 'u1').isTerminated, false);

  mounted.unmount();
}

// ─── Test 11: Delayed 4th-Event ACK Must Not Trigger False 5/5 Lock ─────────────────
{
  resetSimBackend();
  env.localStorage.clear();
  authState.currentUser.uid = 'u1';
  simBackend.sessions.set('c1:u1', {
    count: 3,
    terminated: false,
    gen: 0,
    events: new Set(['0:o1', '0:o2', '0:o3']),
  });

  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 3);
  assert.equal(mounted.current.isTerminated, false);

  // Hold the HTTP 200 ACK for the 4th tab switch after server commits count=4
  simBackend.holdNextTabSwitchResponse = true;
  env.setVisibility('hidden');
  env.setVisibility('visible');
  await delay(20);
  await flushMicrotasks();
  assert.equal(simBackend.sessions.get('c1:u1').count, 4, '4th event committed on server while ACK held');
  assert.equal(typeof simBackend.releaseHeldPost, 'function');

  // Reconcile GET /session-status while 4th POST ACK is still in flight
  env.setFocus(true);
  await delay(20);
  await flushMicrotasks();

  assert.equal(mounted.current.tabSwitchCount, 4, 'Confirmed count must be 4, never 4 + 1 = 5');
  assert.equal(mounted.current.pendingSyncCount, 1, 'Pending unacknowledged count stays separate');
  assert.equal(mounted.current.isTerminated, false, 'Must NOT lock workspace at 4/5');
  assert.equal(mounted.current.isServerConfirmedTermination, false);

  // Release 4th POST ACK -> settles to confirmed=4, pending=0, terminated=false
  simBackend.releaseHeldPost();
  await delay(20);
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 4);
  assert.equal(mounted.current.pendingSyncCount, 0);
  assert.equal(mounted.current.isTerminated, false);

  mounted.unmount();
}

// ─── Test 12: Concurrent Tabs Persist & Merge Queued Violations Without Drops ──────
{
  resetSimBackend();
  env.localStorage.clear();
  authState.currentUser.uid = 'u1';

  // 1) Pure storage + merge checks with independent per-UUID keys & ackedIds tombstones
  storage.writePendingTabSwitchObservation('c1', 'u1', {
    observation_id: 'obs-A',
    generation: 0,
    created_at: 100,
  });
  storage.writePendingTabSwitchObservation('c1', 'u1', {
    observation_id: 'obs-B',
    generation: 0,
    created_at: 99, // even an older timestamp from sibling tab must survive
  });
  const combined = storage.readLocalTabSwitchState('c1', 'u1');
  assert.deepEqual(
    Array.from(combined.pendingEvents, (e) => e.observation_id).sort(),
    ['obs-A', 'obs-B']
  );

  const tabAState = {
    serverCount: 0,
    isTerminated: false,
    resetGeneration: 0,
    pendingEvents: [{ observation_id: 'obs-A', generation: 0, created_at: 100 }],
    ackedIds: [],
    hasServerSnapshot: true,
    updatedAt: 100,
  };
  const tabBState = {
    serverCount: 0,
    isTerminated: false,
    resetGeneration: 0,
    pendingEvents: [{ observation_id: 'obs-B', generation: 0, created_at: 150 }],
    ackedIds: [],
    hasServerSnapshot: true,
    updatedAt: 150,
  };
  const mergedConcurrent = sync.mergeLocalTabSwitchStates(tabAState, tabBState);
  assert.deepEqual(
    Array.from(mergedConcurrent.pendingEvents, (e) => e.observation_id).sort(),
    ['obs-A', 'obs-B'],
    'Concurrent tab states must union distinct unacked observations regardless of updatedAt'
  );

  const tabBAckedA = {
    ...tabBState,
    serverCount: 1,
    ackedIds: ['obs-A'],
    updatedAt: 160,
  };
  const mergedWithAck = sync.mergeLocalTabSwitchStates(tabAState, tabBAckedA);
  assert.deepEqual(
    Array.from(mergedWithAck.pendingEvents, (e) => e.observation_id),
    ['obs-B'],
    'Merged state must NOT resurrect an observation already acked by sibling tab'
  );

  // 2) Live mounted hook cross-tab concurrent offline queue -> reconnect flushes both A and B
  env.localStorage.clear();
  simBackend.mode = 'offline';
  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  await flushMicrotasks();

  // Tab 1 queues observation A offline
  env.setVisibility('hidden');
  env.setVisibility('visible');
  await flushMicrotasks();
  assert.equal(mounted.current.pendingSyncCount, 1);

  // Sibling Tab 2 queues observation B concurrently into its own UUID storage key
  const obsB = { observation_id: 'tab2-obs-B', generation: 0, created_at: Date.now() };
  assert.equal(storage.writePendingTabSwitchObservation('c1', 'u1', obsB), true);
  const obsBKey = storage.getPendingObservationKey('c1', 'u1', obsB.generation, obsB.observation_id);
  env.dispatchStorage(obsBKey);
  await flushMicrotasks();

  assert.equal(mounted.current.pendingSyncCount, 2, 'Tab 1 must see both its own and Tab 2 queued observations');
  assert.equal(mounted.current.tabSwitchCount, 0);

  // Come back online -> both obs-A and tab2-obs-B flush to server!
  simBackend.mode = 'ok';
  env.setOnline(true);
  await delay(60);
  await flushMicrotasks();

  assert.equal(simBackend.sessions.get('c1:u1').count, 2, 'Both concurrent tab observations must reach the server');
  assert.equal(mounted.current.tabSwitchCount, 2);
  assert.equal(mounted.current.pendingSyncCount, 0);

  mounted.unmount();
}

// ─── Test 13: Committed-But-Response-Lost 4th Report + Status GET Stays Unlocked ────
{
  resetSimBackend();
  env.localStorage.clear();
  authState.currentUser.uid = 'u1';
  simBackend.sessions.set('c1:u1', {
    count: 3,
    terminated: false,
    gen: 0,
    events: new Set(['0:o1', '0:o2', '0:o3']),
  });

  const mounted = mountHook(createHookModule, {
    contestId: 'c1',
    userId: 'u1',
    isSessionActive: true,
    isCountingEnabled: true,
    maxSwitches: 5,
  });
  await delay(20);
  await flushMicrotasks();
  assert.equal(mounted.current.tabSwitchCount, 3);
  assert.equal(mounted.current.isTerminated, false);

  // 4th report commits on server (3 -> 4), then its HTTP response is lost (503)
  simBackend.dropCommittedPostResponsesRemaining = 1;
  env.setVisibility('hidden');
  env.setVisibility('visible');
  await delay(30);
  await flushMicrotasks();

  assert.equal(simBackend.sessions.get('c1:u1').count, 4, '4th POST must have committed on server');
  assert.equal(simBackend.sessions.get('c1:u1').terminated, false);
  assert.equal(mounted.current.pendingSyncCount, 1, '4th observation remains pending while retry backoff waits');

  // Subsequent GET /session-status returns 4/unlocked while the 4th observation is still pending
  await mounted.current.reconcileNow();
  await flushMicrotasks();

  assert.equal(mounted.current.tabSwitchCount, 4, 'Display stays at server-confirmed 4 (never 4 + 1 = 5)');
  assert.equal(mounted.current.pendingSyncCount, 1, 'Syncing indicator reflects 1 pending observation');
  assert.equal(mounted.current.isTerminated, false, 'Session must remain UNLOCKED without server-confirmed termination');
  assert.equal(mounted.current.isServerConfirmedTermination, false);

  // Backoff retry completes with same observation_id -> deduplicates cleanly to count=4, pending=0
  await delay(1150);
  await flushMicrotasks();

  const postRequests = simBackend.requests.filter((r) => r.endpoint === 'tab-switch');
  assert.equal(postRequests.length, 2, '4th report should retry once after lost response');
  assert.equal(postRequests[0].body.observation_id, postRequests[1].body.observation_id);
  assert.equal(simBackend.sessions.get('c1:u1').count, 4, 'Retry deduplication keeps server count at 4');
  assert.equal(mounted.current.tabSwitchCount, 4);
  assert.equal(mounted.current.pendingSyncCount, 0);
  assert.equal(mounted.current.isTerminated, false);

  mounted.unmount();
}

console.log('All tab-switch state, idempotency, reset-generation, identity isolation, lifecycle, convergence, and storage tests passed.');
