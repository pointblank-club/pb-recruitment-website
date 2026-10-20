import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

function load(path, imports, globals = {}) {
  const module = { exports: {} };
  const { code } = transformSync(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), {
    loader: path.endsWith('.tsx') ? 'tsx' : 'ts',
    format: 'cjs',
    define: { 'import.meta.env': '{}' },
  });
  runInNewContext(code, {
    module, exports: module.exports, console: { error() {} }, ...globals,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

// Run effects and their cleanup explicitly; browser checks also exercise real React.
function hookHarness() {
  const slots = [];
  let cursor, effects;
  const same = (a, b) => a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const slot = slots[cursor++] ??= { value: initial };
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) effects.push({ i, fn, deps });
    },
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
  };
  return {
    react,
    render(fn) {
      cursor = 0;
      effects = [];
      const result = fn();
      for (const { i } of effects) slots[i]?.cleanup?.();
      for (const { i, fn, deps } of effects) slots[i] = { deps, cleanup: fn() };
      return result;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

function leaderboard() {
  const harness = hookHarness();
  const calls = [];
  const intervals = new Map();
  const api = Object.fromEntries(['getContestById', 'getContestLeaderboard'].map(method => [method,
    (...args) => new Promise(resolve => calls.push({ method, args, resolve })),
  ]));
  const { useLeaderboard } = load('features/contests/hooks/useLeaderboard.ts', {
    react: harness.react,
    '@/services/api/contestApi': { contestApi: api },
    '@/lib/AuthContext': { useAuth: () => ({ user: { uid: 'me' } }) },
  }, {
    setInterval(fn) { intervals.set(fn, fn); return fn; },
    clearInterval(id) { intervals.delete(id); },
  });
  return {
    calls,
    render: (id = 'A', interval = 0) => harness.render(() => useLeaderboard(id, interval)),
    async resolve(index, value) { calls[index].resolve(value); await new Promise(setImmediate); },
    tick: () => [...intervals.values()].forEach(fn => fn()),
    unmount: harness.unmount,
    intervals,
  };
}
const rows = (totalCount = 1, totalPages = 1) => ({ entries: [], totalCount, totalPages });

test('contest changes accept the new metadata and ignore old responses with refresh disabled', async () => {
  const h = leaderboard();
  h.render('A');
  h.render('B');
  await h.resolve(2, { id: 'B' });
  await h.resolve(3, rows());
  await h.resolve(0, { id: 'A' });
  await h.resolve(1, rows(60, 3));
  const state = h.render('B');
  assert.equal(state.contest.id, 'B');
  assert.equal(state.isLoading, false);
  assert.equal(state.totalParticipants, 1);
  h.unmount();
});

test('page cleanup leaves pending metadata valid and refresh ticks do not overlap leaderboard requests', async () => {
  const h = leaderboard();
  h.render('A', 30000);
  await h.resolve(1, rows(60, 3));
  h.render('A', 30000).setPage(1);
  h.render('A', 30000);
  await h.resolve(0, { id: 'A' });
  h.render('A', 30000);
  h.tick();
  assert.equal(h.calls.filter(call => call.method === 'getContestLeaderboard').length, 2);
  await h.resolve(2, rows(60, 3));
  const state = h.render('A', 30000);
  assert.equal(state.contest.id, 'A');
  assert.equal(state.isLoading, false);
  h.unmount();
  assert.equal(h.intervals.size, 0);
});

test('a leaderboard shrinking to zero pages clamps to page zero and finishes loading', async () => {
  const h = leaderboard();
  h.render();
  await h.resolve(0, { id: 'A' });
  await h.resolve(1, rows(60, 3));
  h.render().setPage(2);
  h.render();
  await h.resolve(2, rows(0, 0));
  assert.equal(h.render().page, 0);
  assert.deepEqual(h.calls[3].args, ['A', 0]);
  await h.resolve(3, rows(0, 0));
  const state = h.render();
  assert.equal(state.totalPages, 0);
  assert.equal(state.totalParticipants, 0);
  assert.equal(state.isLoading, false);
  h.unmount();
});

test('pagination preserves zero counts and rejects missing or malformed headers', async () => {
  let headers;
  const client = {
    interceptors: { request: { use() {} }, response: { use() {} } },
    async get() { return { data: [], headers }; },
  };
  const { contestApi } = load('services/api/contestApi.ts', {
    axios: { create: () => client },
    '@/models/contest': { Contest: class {} },
    '@/lib/firebase': { auth: { currentUser: null } },
    '@/lib/base64': { encodeBase64: value => value },
  });
  for (const value of ['0', '600']) {
    headers = { 'x-total-count': value, 'x-total-pages': value === '0' ? '0' : '30' };
    const result = await contestApi.getContestLeaderboard('A');
    assert.equal(result.totalCount, Number(value));
    assert.equal(result.totalPages, value === '0' ? 0 : 30);
  }
  for (const invalid of [undefined, '', ' ', 'garbage', '2pages', '-1', '1.5', '9007199254740992']) {
    for (const name of ['x-total-count', 'x-total-pages']) {
      headers = { 'x-total-count': '60', 'x-total-pages': '3', [name]: invalid };
      await assert.rejects(contestApi.getContestLeaderboard('A'), /pagination/i);
    }
  }
});

test('a late moderation failure after unmount neither rolls back shared state nor alerts', async () => {
  const h = hookHarness();
  let reject, updates = 0, alerts = 0;
  const pending = new Promise((_, fail) => { reject = fail; });
  const { default: Manager } = load('pages/components/ContestantManager.tsx', {
    react: h.react,
    axios: { isAxiosError: () => false },
    '@/services/api/adminApi': { adminApi: { updateContestantStatus: () => pending } },
  }, { alert() { alerts++; } });
  const tree = h.render(() => Manager({
    contestId: 'A',
    contestants: [{ id: 'u', name: 'User', email: 'u@example.test', status: 'Active', score: 30 }],
    setContestants() { updates++; },
  }));
  const selects = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.type === 'select') selects.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  const request = selects[1].props.onChange({ target: { value: 'Banned' } });
  assert.equal(updates, 1);
  h.unmount();
  reject(new Error('late failure'));
  await request;
  assert.equal(updates, 1);
  assert.equal(alerts, 0);
});
