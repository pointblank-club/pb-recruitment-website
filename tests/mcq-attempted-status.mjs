import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const utils = { exports: {} };
vm.runInNewContext(compile(read('src/features/contests/submissionUtils.ts')), utils);
const { formatVerdict, getVerdictClasses, PASSING_STATUSES, JUDGING_STATUSES } = utils.exports;
assert.equal(formatVerdict('attempted'), 'Attempted');
assert.match(getVerdictClasses('attempted'), /slate/);
assert.doesNotMatch(getVerdictClasses('attempted'), /rose|emerald/);
assert.equal(PASSING_STATUSES.has('attempted'), false);
assert.equal(JUDGING_STATUSES.has('attempted'), false);

// Unit checks only; hook transitions and navigation need a mounted React check.
const source = ts.createSourceFile('page.tsx', read('src/features/contests/pages/ContestProblemPage.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
const visit = (node) => {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
      && node.arguments[1]?.getText(source).includes('activeSubmission')) {
    effects.push(node.arguments[0]);
  }
  ts.forEachChild(node, visit);
};
visit(source);
assert.equal(effects.length, 1, 'select exactly the submission notification effect');

for (const [type, status, kind, message] of [
  ['mcq', undefined],
  ['mcq', 'attempted'],
  ['mcq', 'accepted'],
  ['mcq', 'wrong_answer'],
  [undefined, 'attempted'],
  ['code', 'attempted'],
  ['code', 'accepted', 'success', 'Submission successful: Accepted'],
  ['code', 'completed', 'success', 'Submission successful: Completed'],
  ['code', 'wrong_answer', 'error', 'Submission result: Wrong answer'],
]) {
  const calls = [];
  const context = {
    activeSubmission: { phase: 'completed', id: 'submission', status, details: { type } },
    notifiedSubmissionRef: { current: null },
    problem: undefined,
    formatVerdict,
    toast: Object.fromEntries(['info', 'success', 'error'].map((kind) => [kind, (message) => calls.push({ kind, message })])),
  };
  const notify = vm.runInNewContext(compile(`(${effects[0].getText(source)})`), context);
  notify();
  context.problem = { type: 'mcq' }; // Late or stale problem metadata must not affect code verdicts.
  context.activeSubmission = { ...context.activeSubmission };
  notify();
  assert.deepEqual(calls, kind ? [{ kind, message }] : [], `${type}/${status}: correct notifications, once`);
}

const hook = ts.createSourceFile('hook.ts', read('src/features/contests/hooks/useProblemSubmissions.ts'), ts.ScriptTarget.Latest, true);
let isJudging;
const findJudging = (node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(hook) === 'isJudging') {
    isJudging = vm.runInNewContext(compile(`(${node.initializer.getText(hook)})`));
  }
  ts.forEachChild(node, findJudging);
};
findJudging(hook);
assert.equal(typeof isJudging, 'function');
for (const status of ['attempted', undefined, 'accepted', 'wrong_answer']) assert.equal(isJudging(status), false);
for (const status of ['pending', 'processing']) assert.equal(isJudging(status), true);
console.log('Neutral status, optional judging status, silent MCQs, and code notification unit checks passed.');
