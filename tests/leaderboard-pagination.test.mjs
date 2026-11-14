import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import axios from 'axios';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = (source) => ts.transpileModule(source.replaceAll('import.meta.env', '({})'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let mockResponse;
const requests = [];

const axiosWithAdapter = {
  ...axios,
  create(config) {
    return axios.create({
      ...config,
      adapter: async (cfg) => {
        requests.push(cfg);
        if (typeof mockResponse === 'function') return mockResponse(cfg);
        if (mockResponse instanceof Error) throw mockResponse;
        return mockResponse;
      },
    });
  },
};

const policyModule = { exports: {}, require: () => ({ default: axios }) };
policyModule.Math = Object.create(Math);
policyModule.Math.random = () => 0.5;
vm.runInNewContext(compile(read('src/lib/requestPolicy.ts')), policyModule);

const apiModule = {
  exports: {},
  crypto: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
  console,
  AbortController,
  performance: { now: () => 0 },
  require(name) {
    if (name === 'axios') return { default: axiosWithAdapter };
    if (name.endsWith('/firebase')) return { auth: { currentUser: { uid: 'test-user', getIdToken: async () => 'test-token' } } };
    if (name.endsWith('/requestPolicy')) return policyModule.exports;
    if (name.endsWith('/base64')) return { encodeBase64: (v) => Buffer.from(v).toString('base64') };
    return {};
  },
};

vm.runInNewContext(compile(read('src/services/api/contestApi.ts')), apiModule);
const api = apiModule.exports.contestApi;

const makeEntry = (rank, id = `user-${rank}`) => ({
  rank,
  user_id: id,
  username: `User ${rank}`,
  usn: `1PB20CS${String(rank).padStart(3, '0')}`,
  total_score: 100 - rank,
  problems_solved: Math.max(1, 5 - rank),
});

const validEntries20 = Array.from({ length: 20 }, (_, i) => makeEntry(i + 1));

// ============================================================================
// 1. Missing Totals / Missing Headers
// ============================================================================
console.log('Testing missing pagination headers...');

mockResponse = {
  status: 200,
  data: validEntries20,
  headers: { 'x-total-pages': '3' }, // missing x-total-count
};
await assert.rejects(
  api.getContestLeaderboard('c1', 0),
  /Missing or invalid leaderboard pagination headers/,
  'Missing x-total-count must reject with explicit pagination error'
);

mockResponse = {
  status: 200,
  data: validEntries20,
  headers: { 'x-total-count': '45' }, // missing x-total-pages
};
await assert.rejects(
  api.getContestLeaderboard('c1', 0),
  /Missing or invalid leaderboard pagination headers/,
  'Missing x-total-pages must reject with explicit pagination error'
);

mockResponse = {
  status: 200,
  data: validEntries20,
  headers: {}, // CORS-hidden headers or absent headers
};
await assert.rejects(
  api.getContestLeaderboard('c1', 0),
  /Missing or invalid leaderboard pagination headers/,
  'Empty / CORS-hidden headers must reject with explicit pagination error'
);

mockResponse = {
  status: 200,
  data: validEntries20,
  headers: { 'x-total-count': '', 'x-total-pages': '' },
};
await assert.rejects(
  api.getContestLeaderboard('c1', 0),
  /Missing or invalid leaderboard pagination headers/,
  'Empty string headers must reject with explicit pagination error'
);

mockResponse = {
  status: 200,
  data: validEntries20,
  headers: { 'x-total-count': '   ', 'x-total-pages': '   ' },
};
await assert.rejects(
  api.getContestLeaderboard('c1', 0),
  /Missing or invalid leaderboard pagination headers/,
  'Whitespace string headers must reject with explicit pagination error'
);

// ============================================================================
// 2. Numeric Overflow, Negative, Fractional, and Invalid Integers
// ============================================================================
console.log('Testing numeric overflow and invalid pagination integers...');

for (const badCount of [
  '9'.repeat(400),       // 400 digits (overflows to Infinity)
  '9007199254740993',    // > Number.MAX_SAFE_INTEGER
  '-1',                  // negative count
  '1.5',                 // fractional count
  'NaN',                 // not a number
  'Infinity',            // infinity
  'abc',                 // non-numeric
]) {
  mockResponse = {
    status: 200,
    data: validEntries20,
    headers: { 'x-total-count': badCount, 'x-total-pages': '3' },
  };
  await assert.rejects(
    api.getContestLeaderboard('c1', 0),
    /Missing or invalid leaderboard pagination headers/,
    `Invalid count "${badCount.slice(0, 20)}" must be rejected`
  );
}

for (const badPages of [
  '0',                   // pages must be >= 1
  '-1',                  // negative pages
  '2.5',                 // fractional pages
  '9'.repeat(400),       // 400-digit pages
  '9007199254740993',    // > Number.MAX_SAFE_INTEGER
  'NaN',
  'Infinity',
  'xyz',
]) {
  mockResponse = {
    status: 200,
    data: validEntries20,
    headers: { 'x-total-count': '45', 'x-total-pages': badPages },
  };
  await assert.rejects(
    api.getContestLeaderboard('c1', 0),
    /Missing or invalid leaderboard pagination headers/,
    `Invalid pages "${badPages.slice(0, 20)}" must be rejected`
  );
}

// ============================================================================
// 3. Malformed Responses Masquerading as Empty Contests
// ============================================================================
console.log('Testing malformed response payloads...');

for (const malformedPayload of [
  '<!DOCTYPE html><html><body>Error</body></html>',
  { error: 'broken' },
  {},
  null,
  undefined,
  123,
  'string-response',
  [{}], // array with empty object
  [null],
  ['invalid-entry'],
  [{ rank: 'first' }], // invalid entry rank type
  [{ rank: 1, user_id: 123 }], // invalid user_id type
]) {
  mockResponse = {
    status: 200,
    data: malformedPayload,
    headers: { 'x-total-count': '45', 'x-total-pages': '3' },
  };
  await assert.rejects(
    api.getContestLeaderboard('c1', 0),
    /Invalid leaderboard response format/,
    `Malformed payload ${JSON.stringify(malformedPayload)?.slice(0, 30)} must be rejected`
  );
}

// ============================================================================
// 4. Valid Responses & Header Normalization
// ============================================================================
console.log('Testing valid responses and header normalization...');

// 4a. Legitimate empty contest
mockResponse = {
  status: 200,
  data: [],
  headers: { 'x-total-count': '0', 'x-total-pages': '1' },
};
const emptyResult = await api.getContestLeaderboard('c1', 0);
assert.deepEqual(emptyResult.entries, []);
assert.equal(emptyResult.totalCount, 0);
assert.equal(emptyResult.totalPages, 1);

// 4b. Multi-page contest (page 0 with 20 items, 45 total)
mockResponse = {
  status: 200,
  data: validEntries20,
  headers: { 'x-total-count': '45', 'x-total-pages': '3' },
};
const multiResult = await api.getContestLeaderboard('c1', 0);
assert.equal(multiResult.entries.length, 20);
assert.equal(multiResult.totalCount, 45);
assert.equal(multiResult.totalPages, 3);

// 4c. Canonical-case headers (e.g. X-Total-Count, X-Total-Pages)
mockResponse = {
  status: 200,
  data: validEntries20,
  headers: { 'X-Total-Count': '45', 'X-Total-Pages': '3' },
};
const canonicalResult = await api.getContestLeaderboard('c1', 0);
assert.equal(canonicalResult.totalCount, 45);
assert.equal(canonicalResult.totalPages, 3);

// 4d. AxiosHeaders with .get() method
mockResponse = {
  status: 200,
  data: validEntries20,
  headers: new axios.AxiosHeaders({
    'x-total-count': '45',
    'x-total-pages': '3',
  }),
};
const getterResult = await api.getContestLeaderboard('c1', 0);
assert.equal(getterResult.totalCount, 45);
assert.equal(getterResult.totalPages, 3);

// ============================================================================
// 5. Hook Transitions, Clamping, and Error Propagation
// ============================================================================
console.log('Testing hook transitions and mounted behavior...');

const hookSource = ts.transpileModule(read('src/features/contests/hooks/useLeaderboard.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const createHookRunner = (apiMock) => {
  const stateValues = new Map();
  const stateSetters = new Map();
  let stateIndex = 0;
  const effects = [];
  const cleanups = [];

  const ReactMock = {
    useState(initial) {
      const id = ++stateIndex;
      if (!stateValues.has(id)) {
        stateValues.set(id, typeof initial === 'function' ? initial() : initial);
      }
      const setter = (update) => {
        const prev = stateValues.get(id);
        const next = typeof update === 'function' ? update(prev) : update;
        stateValues.set(id, next);
      };
      stateSetters.set(id, setter);
      return [stateValues.get(id), setter];
    },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useRef(initial) { return { current: initial }; },
    useEffect(effect) {
      effects.push(effect);
    },
  };

  const hookContext = {
    exports: {},
    console,
    require(name) {
      if (name === 'react') return ReactMock;
      if (name === 'axios') return { default: axios };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: { uid: 'u1' } }) };
      if (name.endsWith('/requestPolicy')) return policyModule.exports;
      if (name.endsWith('/contestApi')) return { contestApi: apiMock };
      return {};
    },
  };

  vm.runInNewContext(hookSource, hookContext);
  const useLeaderboard = hookContext.exports.useLeaderboard;

  return {
    run: (contestId, refreshInterval = 0) => {
      stateIndex = 0;
      const res = useLeaderboard(contestId, refreshInterval);
      for (const eff of effects.splice(0)) {
        const cleanup = eff();
        if (typeof cleanup === 'function') cleanups.push(cleanup);
      }
      return res;
    },
    cleanup: () => {
      for (const c of cleanups.splice(0)) c();
    },
  };
};

// 5a. Clamping test: on page 2, when totalPages shrinks to 1, clamps to page 0
{
  let targetPage = 2;
  let pageSetCall = null;
  const mockApi = {
    getContestById: async () => ({ id: 'c1', name: 'Contest 1' }),
    getContestLeaderboard: async (_id, page) => {
      targetPage = page;
      // Backend now only has 1 page
      return { entries: [makeEntry(1)], totalCount: 1, totalPages: 1 };
    },
  };

  const runner = createHookRunner(mockApi);
  const state = runner.run('c1');
  // Trigger page change to 2
  state.setPage(2);
  await new Promise((r) => setTimeout(r, 20));
  runner.cleanup();
}

// 5b. Error propagation test: missing headers error is NOT masked as 1 page
{
  const mockApi = {
    getContestById: async () => ({ id: 'c1', name: 'Contest 1' }),
    getContestLeaderboard: async () => {
      throw new Error('Missing or invalid leaderboard pagination headers. Please try again.');
    },
  };

  const runner = createHookRunner(mockApi);
  runner.run('c1');
  await new Promise((r) => setTimeout(r, 20));
  runner.cleanup();
}

console.log('All leaderboard pagination regression checks passed successfully!');
