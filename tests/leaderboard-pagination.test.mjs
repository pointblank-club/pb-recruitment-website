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

// Pagination headers must never prevent valid participant rows from being returned.
for (const headers of [
  undefined, {},
  { 'x-total-count': '45' }, { 'x-total-pages': '3' },
  { 'x-total-count': '45', 'x-total-pages': '3' },
  { 'X-Total-Count': '45', 'X-Total-Pages': '3' },
  { 'x-total-count': '0', 'x-total-pages': '0' },
  { 'x-total-count': '1', 'x-total-pages': '1' },
  new axios.AxiosHeaders({ 'x-total-count': '45', 'x-total-pages': '3' }),
]) {
  mockResponse = { status: 200, data: validEntries20, headers };
  const result = await api.getContestLeaderboard('c1', 0);
  assert.deepEqual(result.entries, validEntries20);
  assert.equal(result.hasNextPage, true);
}

for (const value of ['', '   ', '-1', '0', '1.5', 'NaN', 'Infinity', 'abc', '9'.repeat(400), '9007199254740993']) {
  for (const header of ['x-total-count', 'x-total-pages']) {
    mockResponse = { status: 200, data: validEntries20, headers: { [header]: value } };
    const result = await api.getContestLeaderboard('c1', 0);
    assert.deepEqual(result.entries, validEntries20, `${header}=${value.slice(0, 20)} cannot hide participants`);
    assert.equal(result.hasNextPage, true);
  }
}

// Full, partial, and empty pages work without totals; stale totals cannot clamp a valid later page.
for (const page of [0, 2]) {
  for (const length of [0, 1, 19, 20, 21]) {
    const entries = Array.from({ length }, (_, index) => makeEntry(page * 20 + index + 1));
    mockResponse = { status: 200, data: entries, headers: { 'x-total-count': '0', 'x-total-pages': '1' } };
    const result = await api.getContestLeaderboard('c1', page);
    assert.deepEqual(result.entries, entries);
    assert.equal(result.hasNextPage, length >= 20);
    assert.equal(requests.at(-1).url, `/contests/c1/leaderboard?page=${page}`);
    assert.equal(requests.at(-1).timeout, 15000);
  }
}

mockResponse = { status: 200, data: [makeEntry(41, 'test-user')], headers: {} };
const participant = await api.getContestLeaderboard('c1', 2);
assert.equal(participant.entries[0].user_id, 'test-user');
assert.equal(participant.entries[0].username, 'User 41');
assert.equal(participant.entries[0].rank, 41);
assert.equal(participant.hasNextPage, false);

// Keep response-body validation: HTML, error objects, and corrupt rows are not empty leaderboards.
for (const data of [
  '<!DOCTYPE html><html><body>Error</body></html>', { error: 'broken' }, {}, null, undefined, 123, 'string-response',
  [{}], [null], ['invalid-entry'], [{ rank: 'first' }], [{ rank: 1, user_id: 123 }],
  [{ ...makeEntry(1), rank: -1 }], [{ ...makeEntry(1), rank: 1.5 }],
  [{ ...makeEntry(1), total_score: Infinity }], [{ ...makeEntry(1), problems_solved: '1' }],
]) {
  mockResponse = { status: 200, data, headers: {} };
  await assert.rejects(api.getContestLeaderboard('c1', 0), /Invalid leaderboard response format/);
}

const unavailable = new axios.AxiosError('Synthetic unavailable response', 'ERR_BAD_RESPONSE', undefined, undefined, {
  status: 503, headers: {}, data: { error: 'Temporarily unavailable' },
});
mockResponse = unavailable;
await assert.rejects(api.getContestLeaderboard('c1', 0), error => error === unavailable);
console.log('Leaderboard checks passed: header-independent rows/pagination, participant identity, malformed body rejection, and request errors.');
