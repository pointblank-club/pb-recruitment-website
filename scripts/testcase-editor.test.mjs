import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const { code } = transformSync(
  readFileSync(new URL('../src/services/api/adminApi.ts', import.meta.url), 'utf8'),
  { loader: 'ts', format: 'cjs', define: { 'import.meta.env': '{}' } },
);

function editorApi(testcases) {
  const requests = [];
  const problem = {
    problem_id: 'p', contest_id: 'c', name: 'Problem', description: 'Description',
    type: 'code', score: 10, testcases,
  };
  const client = {
    interceptors: { request: { use() {} }, response: { use() {} } },
    async get(url) {
      requests.push({ url });
      return { data: problem };
    },
    async put(url, payload) {
      requests.push({ url, payload });
      return { data: { id: 'p', ...payload } };
    },
  };
  const imports = {
    axios: { create: () => client },
    '@/models/contest': { Contest: class {} },
    '@/lib/firebase': { auth: { currentUser: null } },
  };
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return { api: module.exports.adminApi, requests };
}

test('editing preserves sample flags, blank data and paired Unicode answers', async () => {
  const cases = [
    { input: '', expected_output: '', is_sample: true },
    { input: 'नमस्ते\n', expected_output: 'λ\n', is_sample: false },
  ];
  const { api, requests } = editorApi(cases);
  const loaded = await api.getProblemById('c', 'p');
  assert.deepEqual(requests, [{ url: '/admin/c/problem/p' }]);
  await api.updateProblem('c', 'p', {
    name: loaded.name, description: loaded.description, score: loaded.score,
    type: loaded.type, testcases: loaded.testcases,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(requests[1].payload.testcases)), cases);
});

test('missing or invalid answers stop editing without a second storage request', async () => {
  for (const expected_output of [undefined, null, 0]) {
    const { api, requests } = editorApi([{ input: 'input', expected_output }]);
    await assert.rejects(api.getProblemById('c', 'p'), /incomplete testcase answers/);
    assert.equal(requests.length, 1);
  }
});
