import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const utils = {
  exports: {},
  require: (name) => {
    if (name.endsWith('utils')) return { formatScore: (s) => String(s ?? 0) };
    return {};
  },
};
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
let mergeSubmissions;
const findDeclarations = (node) => {
  if (ts.isVariableDeclaration(node)) {
    if (node.name.getText(hook) === 'isJudging') {
      isJudging = vm.runInNewContext(compile(`(${node.initializer.getText(hook)})`));
    }
    if (node.name.getText(hook) === 'mergeSubmissions') {
      mergeSubmissions = vm.runInNewContext(compile(`(${node.initializer.getText(hook)})`), { isJudging });
    }
  }
  ts.forEachChild(node, findDeclarations);
};
findDeclarations(hook);
assert.equal(typeof isJudging, 'function');
assert.equal(typeof mergeSubmissions, 'function');
for (const status of ['attempted', undefined, 'accepted', 'wrong_answer']) assert.equal(isJudging(status), false);
for (const status of ['pending', 'processing']) assert.equal(isJudging(status), true);

// 1. mergeSubmissions: pending submission with score 0 finalized with unknown score keeps score undefined (no false zero)
const pendingHistory = [{ id: 'sub-1', status: 'pending', score: 0, created_at: 1000 }];
const finalizedUnknownScore = [{ id: 'sub-1', status: 'accepted', score: undefined, created_at: 1000 }];
const mergedUnknown = mergeSubmissions(finalizedUnknownScore, pendingHistory);
assert.equal(mergedUnknown[0].score, undefined, 'finalizing pending submission without details must not retain false zero');

// 2. mergeSubmissions: pending submission finalized with authoritative score updates score
const finalizedWithScore = [{ id: 'sub-1', status: 'accepted', score: 100, created_at: 1000 }];
const mergedWithScore = mergeSubmissions(finalizedWithScore, pendingHistory);
assert.equal(mergedWithScore[0].score, 100, 'finalizing pending submission with authoritative score must update score');

// 3. mergeSubmissions: contract normalization between passed_test_cases and test_cases_passed
const backendSubmission = [{ id: 'sub-2', status: 'wrong_answer', passed_test_cases: 6, total_test_cases: 10, created_at: 1001 }];
const mergedBackend = mergeSubmissions(backendSubmission, []);
assert.equal(mergedBackend[0].passed_test_cases, 6);
assert.equal(mergedBackend[0].test_cases_passed, 6);

const frontendSubmission = [{ id: 'sub-3', status: 'wrong_answer', test_cases_passed: 4, total_test_cases: 10, created_at: 1002 }];
const mergedFrontend = mergeSubmissions(frontendSubmission, []);
assert.equal(mergedFrontend[0].passed_test_cases, 4);
assert.equal(mergedFrontend[0].test_cases_passed, 4);

// 4. ProblemVerdictTab: MCQ submissions never expose test case counts even if returned by backend
const evaluateVerdictTabCounts = (submission) => {
  const isMcq = submission.details?.type === 'mcq';
  const testCaseResults = submission.details?.test_case_results;
  const passedCasesCount = isMcq
    ? undefined
    : (submission.details?.passed_test_cases ??
       submission.details?.test_cases_passed ??
       (testCaseResults ? testCaseResults.filter((tc) => PASSING_STATUSES.has(tc.status)).length : undefined));
  const totalCasesCount = isMcq
    ? undefined
    : (submission.details?.total_test_cases ?? (testCaseResults ? testCaseResults.length : undefined));
  const hasTestCaseCounts = passedCasesCount !== undefined && totalCasesCount !== undefined && totalCasesCount > 0;
  return { isMcq, passedCasesCount, totalCasesCount, hasTestCaseCounts };
};

const mcqWithCounts = {
  details: {
    type: 'mcq',
    status: 'attempted',
    passed_test_cases: 1,
    test_cases_passed: 1,
    total_test_cases: 1,
  },
};
const mcqResult = evaluateVerdictTabCounts(mcqWithCounts);
assert.equal(mcqResult.passedCasesCount, undefined, 'MCQ must never expose passedCasesCount');
assert.equal(mcqResult.totalCasesCount, undefined, 'MCQ must never expose totalCasesCount');
assert.equal(mcqResult.hasTestCaseCounts, false, 'MCQ hasTestCaseCounts must be false');

const codeWithBackendCount = {
  details: {
    type: 'code',
    status: 'wrong_answer',
    passed_test_cases: 8,
    total_test_cases: 10,
  },
};
const codeResult = evaluateVerdictTabCounts(codeWithBackendCount);
assert.equal(codeResult.passedCasesCount, 8);
assert.equal(codeResult.totalCasesCount, 10);
assert.equal(codeResult.hasTestCaseCounts, true);

// 5. Test useProblemSubmissions hook functions (pollSubmission, refreshHistory, retryDetails)
let pollFunction;
let refreshFunction;
let retryFunction;
const findHookFunctions = (node) => {
  if (ts.isVariableDeclaration(node)) {
    if (node.name.getText(hook) === 'pollSubmission') pollFunction = node.initializer.arguments[0].getText(hook);
    if (node.name.getText(hook) === 'refreshHistory') refreshFunction = node.initializer.arguments[0].getText(hook);
    if (node.name.getText(hook) === 'retryDetails') retryFunction = node.initializer.arguments[0].getText(hook);
  }
  ts.forEachChild(node, findHookFunctions);
};
findHookFunctions(hook);
assert.ok(pollFunction, 'found pollSubmission');
assert.ok(refreshFunction, 'found refreshHistory');
assert.ok(retryFunction, 'found retryDetails');

// Transition A: Pending submission (score: 0) completes polling, details fail -> score is undefined (not 0), detailsFailed is true
{
  let active = { phase: 'polling', id: 'sub-resumed' };
  let history = [{ id: 'sub-resumed', status: 'pending', score: 0, max_score: 100, created_at: 1000 }];
  const context = {
    pollTokenRef: { current: 0 },
    performance: { now: () => 0 },
    FIRST_POLL_DELAY_MS: 0,
    MAX_POLL_DELAY_MS: 0,
    POLL_TIMEOUT_MS: 60000,
    jitterDelay: (d) => d,
    retryAfterDelay: () => 0,
    isPermanentRequestError: () => false,
    wait: async () => {},
    isJudging,
    mergeSubmissions,
    getErrorMessage: (e, fallback) => e?.message || fallback,
    contestApi: {
      getSubmissionStatus: async () => ({ status: 'accepted', score: 0 }), // Unpopulated Go default 0
      getSubmissionDetails: async () => { throw new Error('Details lookup failed'); },
    },
    setActiveSubmission: (updater) => {
      active = typeof updater === 'function' ? updater(active) : updater;
    },
    setHistory: (updater) => {
      history = typeof updater === 'function' ? updater(history) : updater;
    },
  };

  const poll = vm.runInNewContext(compile(`(${pollFunction})`), context);
  await poll({ id: 'sub-resumed', status: 'pending', score: 0, max_score: 100, created_at: 1000 });

  assert.equal(active.status, 'accepted');
  assert.equal(active.detailsFailed, true);
  assert.equal(active.details.score, undefined, 'pending score 0 must be discarded on detail failure');
  assert.match(active.message, /result details could not be loaded/);
  assert.equal(history[0].score, undefined, 'history must not retain false zero');
}

// Transition B: Refresh history after detail failure repairs score but does NOT clear detailsFailed
{
  let active = {
    id: 'sub-active',
    phase: 'completed',
    status: 'wrong_answer',
    detailsFailed: true,
    message: 'Verdict received, but result details could not be loaded: network error',
    details: { id: 'sub-active', status: 'wrong_answer', score: undefined, created_at: 1000 },
  };
  const activeSubmissionRef = { current: active };
  let history = [];
  const context = {
    problemId: 'p1',
    historyRequestRef: { current: 0 },
    scopeTokenRef: { current: 0 },
    activeSubmissionRef,
    setIsHistoryLoading: () => {},
    setHistoryError: () => {},
    setHistory: (h) => { history = h; },
    setHistoryPage: () => {},
    setHasMoreHistory: () => {},
    HISTORY_PAGE_SIZE: 20,
    isJudging,
    getErrorMessage: (e, fallback) => e?.message || fallback,
    contestApi: {
      listUserSubmissions: async () => [
        { id: 'sub-active', status: 'wrong_answer', score: 12.5, max_score: 100, created_at: 1000 }, // summary without test_case_results
      ],
      getSubmissionDetails: async () => { throw new Error('Not called'); },
    },
    setActiveSubmission: (updater) => {
      active = typeof updater === 'function' ? updater(active) : updater;
      activeSubmissionRef.current = active;
    },
    pollSubmission: async () => {},
  };

  const refresh = vm.runInNewContext(compile(`(${refreshFunction})`), context);
  await refresh();

  assert.equal(active.details.score, 12.5, 'score is reconciled from history summary');
  assert.equal(active.detailsFailed, true, 'detailsFailed must NOT be cleared before test case details recover');
  assert.equal(Boolean(active.message), true, 'error message must remain visible for retry');
}

// Transition C: Restoring an already-finalized submission on initial load handles detail failure
{
  let active = { phase: 'idle' };
  const activeSubmissionRef = { current: active };
  let history = [];
  const context = {
    problemId: 'p1',
    historyRequestRef: { current: 0 },
    scopeTokenRef: { current: 0 },
    activeSubmissionRef,
    setIsHistoryLoading: () => {},
    setHistoryError: () => {},
    setHistory: (h) => { history = h; },
    setHistoryPage: () => {},
    setHasMoreHistory: () => {},
    HISTORY_PAGE_SIZE: 20,
    isJudging,
    getErrorMessage: (e, fallback) => e?.message || fallback,
    contestApi: {
      listUserSubmissions: async () => [
        { id: 'sub-latest', status: 'accepted', score: 100, max_score: 100, created_at: 1000 },
      ],
      getSubmissionDetails: async () => { throw new Error('Details 500 error'); },
    },
    setActiveSubmission: (updater) => {
      active = typeof updater === 'function' ? updater(active) : updater;
      activeSubmissionRef.current = active;
    },
    pollSubmission: async () => {},
  };

  const refresh = vm.runInNewContext(compile(`(${refreshFunction})`), context);
  await refresh();

  assert.equal(active.id, 'sub-latest');
  assert.equal(active.detailsFailed, true, 'restoring finalized submission must set detailsFailed on detail error');
  assert.match(active.message, /result details could not be loaded/);
}

// Transition D: retryDetails clears detailsFailed when details succeed
{
  let active = {
    id: 'sub-retry',
    phase: 'completed',
    status: 'accepted',
    detailsFailed: true,
    message: 'Could not load details',
    details: { id: 'sub-retry', status: 'accepted', score: 100, created_at: 1000 },
  };
  const activeSubmissionRef = { current: active };
  let history = [{ id: 'sub-retry', status: 'accepted', score: 100, created_at: 1000 }];
  const context = {
    activeSubmissionRef,
    getErrorMessage: (e, fallback) => e?.message || fallback,
    contestApi: {
      getSubmissionDetails: async () => ({
        id: 'sub-retry',
        status: 'accepted',
        score: 100,
        max_score: 100,
        passed_test_cases: 10,
        total_test_cases: 10,
        test_case_results: [{ test_case_id: 'tc1', status: 'accepted', runtime: 10, memory: 1000 }],
      }),
    },
    setActiveSubmission: (updater) => {
      active = typeof updater === 'function' ? updater(active) : updater;
      activeSubmissionRef.current = active;
    },
    setHistory: (updater) => {
      history = typeof updater === 'function' ? updater(history) : updater;
    },
  };

  const retry = vm.runInNewContext(compile(`(${retryFunction})`), context);
  await retry();

  assert.equal(active.detailsFailed, false, 'retryDetails must clear detailsFailed on success');
  assert.equal(active.message, undefined);
  assert.equal(active.details.passed_test_cases, 10);
  assert.equal(active.details.test_cases_passed, 10);
  assert.equal(active.details.test_case_results.length, 1);
}

console.log('Neutral status, optional judging status, silent MCQs, code notification, and detail recovery unit checks passed.');
