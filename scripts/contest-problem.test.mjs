import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

function load(path, imports = {}) {
  const { code } = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    loader: path.endsWith('.tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic',
    define: { 'import.meta.env': '{}' },
  });
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

test('problem descriptions preserve plain text and literal JSON text', () => {
  const { toProblemDetails } = load('../src/features/contests/problemAdapter.ts');
  for (const type of ['code', 'mcq']) {
    for (const description of [
      'Read an integer and print it.',
      '{"description":"Read the input object","required_field":"name","output":"Print name"}',
      '{"description":""}',
    ]) {
      const problem = toProblemDetails({
        problem_id: 'p', contest_id: 'c', name: 'Problem', score: 10, type, description,
      });
      assert.equal(problem.description, description);
    }
  }
});

function codeView(onRun) {
  const slots = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: (callback) => callback,
    useEffect() {},
  };
  const element = (type, props) => ({ type, props });
  const { CodeProblemView } = load('../src/features/contests/components/CodeProblemView.tsx', {
    react: hooks,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    '@monaco-editor/react': { __esModule: true, default: 'Editor' },
    axios: { __esModule: true, default: { isAxiosError: () => false } },
    '@/components/ui/button': { Button: 'Button' },
    'lucide-react': { Play: 'Play', Send: 'Send', Copy: 'Copy', Check: 'Check' },
  });
  return () => {
    cursor = 0;
    return CodeProblemView({ problem: { description: 'Problem', score: 10 }, onRun });
  };
}

function find(tree, predicate) {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const match = find(child, predicate);
      if (match) return match;
    }
  } else if (tree && typeof tree === 'object') {
    if (predicate(tree)) return tree;
    return find(tree.props?.children, predicate);
  }
}

const node = (tree, type) => {
  const match = find(tree, (element) => element.type === type);
  assert.ok(match, `Missing ${type}`);
  return match;
};

function edit(render, input, revision) {
  if (input === 'code') node(render(), 'Editor').props.onChange(`changed code ${revision}`);
  if (input === 'language') node(render(), 'select').props.onChange({
    target: { value: ['java', 'python', 'javascript'][revision - 1] },
  });
  if (input === 'stdin') {
    find(render(), (element) => element.type === 'button' && element.props.children === 'Input')
      .props.onClick();
    node(render(), 'textarea').props.onChange({ target: { value: `changed input ${revision}` } });
    find(render(), (element) => element.type === 'button' && element.props.children === 'Output')
      .props.onClick();
  }
}

const result = {
  status: 'accepted', stdout: 'OLD RESULT', stderr: '', compile_output: '', runtime: 1, memory: 1,
};

test('Run validates results without changing the raw request or retrying', async () => {
  let data = result;
  const requests = [];
  const client = {
    interceptors: { request: { use() {} }, response: { use() {} } },
    async post(...args) {
      requests.push(args);
      return { data };
    },
  };
  const { contestApi } = load('../src/services/api/contestApi.ts', {
    axios: { __esModule: true, default: { create: () => client } },
    '@/features/contests/problemAdapter': {},
    '@/models/contest': { Contest: class {} },
    '@/lib/firebase': { auth: { currentUser: null } },
    '@/lib/base64': {},
  });
  const run = () => contestApi.runCodeSolution('YWJj', 'python', 'नमस्ते\n');
  for (const status of ['accepted', 'wrong_answer', 'tle', 'failed_to_process', 'rte', 'judge_error']) {
    data = { ...result, status, stdout: ' \nनमस्ते\n', runtime: 0, memory: 0 };
    assert.equal(await run(), data);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), [
    '/submission/run', { code: 'YWJj', language: 'python', stdin: 'नमस्ते\n' }, { timeout: 20_000 },
  ]);
  const invalid = [
    null, 'invalid', [], { status: 'accepted' },
    ...Object.keys(result).map((missing) => Object.fromEntries(
      Object.entries(result).filter(([key]) => key !== missing),
    )),
    ...['finished', 'pending', '', 0].map((status) => ({ ...result, status })),
    ...['stdout', 'stderr', 'compile_output'].flatMap((field) => (
      [null, 0, {}].map((value) => ({ ...result, [field]: value }))
    )),
    ...['runtime', 'memory'].flatMap((field) => (
      [null, '0', -1, NaN, Infinity].map((value) => ({ ...result, [field]: value }))
    )),
  ];
  for (data of invalid) {
    const before = requests.length;
    await assert.rejects(run(), /invalid response/);
    assert.equal(requests.length, before + 1);
  }
});

test('Run displays zero metrics with milliseconds and KiB', async () => {
  const render = codeView(async () => ({ ...result, stdout: '', runtime: 0, memory: 0 }));
  await find(render(), (element) => element.type === 'Button' && element.props.variant === 'outline')
    .props.onClick();
  const output = node(render(), 'pre').props.children;
  assert.match(output, /Status: accepted/);
  assert.match(output, /Runtime: 0 ms/);
  assert.match(output, /Memory: 0 KiB/);
  assert.match(output, /Program finished without output/);
});

test('empty code is rejected before making a Run request', async () => {
  let requests = 0;
  const render = codeView(async () => { requests++; return result; });
  node(render(), 'Editor').props.onChange(' \n');
  await find(render(), (element) => element.type === 'Button' && element.props.variant === 'outline')
    .props.onClick();
  assert.equal(requests, 0);
  assert.match(node(render(), 'pre').props.children, /Code is empty/);
});

for (const input of ['code', 'language', 'stdin']) {
  test(`${input} edits clear completed output and discard pending output`, async () => {
    let resolveRun;
    let rejectRun;
    const render = codeView(() => new Promise((resolve, reject) => {
      resolveRun = resolve;
      rejectRun = reject;
    }));
    const runButton = () => find(render(), (element) => element.type === 'Button' && element.props.variant === 'outline');
    const output = () => find(render(), (element) => element.type === 'pre' && typeof element.props.children === 'string')?.props.children;

    const firstRun = runButton().props.onClick();
    resolveRun(result);
    await firstRun;
    assert.match(output(), /OLD RESULT/);
    edit(render, input, 1);
    assert.equal(output(), undefined);

    const pendingRun = runButton().props.onClick();
    edit(render, input, 2);
    resolveRun(result);
    await pendingRun;
    assert.equal(output(), undefined);
    assert.equal(runButton().props.disabled, false);

    const failedRun = runButton().props.onClick();
    edit(render, input, 3);
    rejectRun(new Error('OLD ERROR'));
    await failedRun;
    assert.equal(output(), undefined);
    assert.equal(runButton().props.disabled, false);

    const freshRun = runButton().props.onClick();
    resolveRun({ ...result, stdout: 'NEW RESULT' });
    await freshRun;
    assert.match(output(), /NEW RESULT/);
  });
}
