import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const data = new Map();
let storageBlocked = false;
const checkStorage = () => { if (storageBlocked) throw new Error('Storage unavailable'); };
const localStorage = {
  get length() { checkStorage(); return data.size; },
  key(index) { checkStorage(); return [...data.keys()][index] ?? null; },
  getItem(key) { checkStorage(); return data.get(key) ?? null; },
  setItem(key, value) { checkStorage(); data.set(key, value); },
  removeItem(key) { checkStorage(); data.delete(key); },
};
const load = (path, imports = {}, globals = {}) => {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, localStorage, ...globals, require: name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
};
const storage = load('src/lib/contestStorage.ts');
const auth = { currentUser: { uid: 'student-A' } };
const draftKey = uid => `contest_code_draft_${uid}_contest_problem`;
const draft = JSON.stringify({
  selectedLanguage: 'cpp', codeByLanguage: { cpp: 'unsent answer', python: 'another answer' }, customInput: 'private input',
});
const seed = () => {
  data.clear();
  for (const uid of ['student-A', 'student-B', 'guest', 'anonymous']) data.set(draftKey(uid), draft);
  for (const key of ['contest_submitted_contest_student-A', 'contest_run_contest_student-A_problem',
    'contest_tab_switch_state_contest_student-A', 'firebase:authUser:example', 'theme', 'contest_code_draftish']) {
    data.set(key, 'retain');
  }
};
const assertCleared = () => {
  assert.equal([...data.keys()].some(key => key.startsWith('contest_code_draft_')), false);
  assert.equal(data.size, 6, 'Submission, proctoring, auth, and unrelated preferences must survive');
  assert.ok([...data.values()].every(value => value === 'retain'));
};
seed();
assert.equal(storage.clearCodeDrafts(), true);
assertCleared();
assert.equal(storage.clearCodeDrafts(), true, 'Cleanup is safe to repeat');

let authObserver;
let signOutFailure;
const warnings = [];
const providerCleanups = [];
const providerState = [];
const { AuthProvider } = load('src/lib/AuthContext.tsx', {
  react: {
    createContext: () => ({ Provider: 'AuthProvider' }),
    useState: initial => { const state = { value: initial }; providerState.push(state); return [initial, value => { state.value = value; }]; },
    useEffect: effect => providerCleanups.push(effect()),
  },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
  './firebase': { auth },
  'firebase/auth': {
    onAuthStateChanged: (_auth, callback) => { authObserver = callback; return () => { authObserver = undefined; }; },
    signOut: async () => { if (signOutFailure) throw signOutFailure; auth.currentUser = null; },
  },
  './profileService': { fetchUserProfile: async uid => ({ id: uid }) },
  '@sentry/react': { setUser: () => {} },
  'react-toastify': { toast: { error: message => warnings.push(message) } },
  './contestStorage': storage,
});
const { logout } = AuthProvider({ children: null }).props.value;
seed();
await authObserver(auth.currentUser);
assert.equal(data.get(draftKey('student-A')), draft, 'Restoring the same session preserves reload recovery');

signOutFailure = new Error('Synthetic sign-out failure');
await assert.rejects(logout(), error => error === signOutFailure);
assert.equal(data.get(draftKey('student-A')), draft, 'Failed sign-out must not erase an active exam draft');
signOutFailure = undefined;
await logout();
assertCleared();
assert.equal(providerState[0].value, null, 'Explicit logout clears the UI before observer notification');

seed();
await authObserver(null);
assertCleared();
assert.equal(providerState[0].value, null, 'Session expiration or another-tab logout also clears the UI');
auth.currentUser = { uid: 'student-A' };
await authObserver(auth.currentUser);
seed();
auth.currentUser = { uid: 'student-B' };
await authObserver(auth.currentUser);
assertCleared();

const window = new EventTarget();
const document = new EventTarget();
document.visibilityState = 'hidden';
let nextTimer = 0;
const timers = new Map();
let hookCleanups;
const { useCodeDraft } = load('src/features/contests/hooks/useCodeDraft.ts', {
  react: {
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: current => ({ current }), useCallback: callback => callback,
    useEffect: effect => hookCleanups.push(effect()),
  },
  '@/lib/firebase': { auth },
}, {
  window, document,
  setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
  clearTimeout: id => timers.delete(id),
});
const mountDraft = (options = {}) => {
  hookCleanups = [];
  const result = useCodeDraft({
    contestId: 'contest', problemId: 'problem', userId: 'student-A',
    defaultTemplates: { cpp: 'default', python: 'default python' }, ...options,
  });
  const cleanups = hookCleanups;
  return { result, dispose: () => cleanups.forEach(cleanup => cleanup?.()) };
};

seed();
auth.currentUser = { uid: 'student-A' };
const navigating = mountDraft();
assert.equal(navigating.result.codeByLanguage.cpp, 'unsent answer');
assert.equal(navigating.result.customInput, 'private input');
data.delete(draftKey('student-A'));
navigating.dispose();
assert.equal(data.get(draftKey('student-A')), draft, 'Normal navigation still flushes the active account draft');

for (const nextUser of [null, { uid: 'student-B' }]) {
  auth.currentUser = { uid: 'student-A' };
  await authObserver(auth.currentUser);
  seed();
  const mounted = mountDraft();
  const pendingSave = [...timers.values()][0];
  assert.equal(typeof pendingSave, 'function');
  auth.currentUser = nextUser;
  await authObserver(nextUser);
  pendingSave();
  window.dispatchEvent(new Event('beforeunload'));
  document.dispatchEvent(new Event('visibilitychange'));
  mounted.dispose();
  assertCleared();
  assert.equal(timers.size, 0, 'Cleanup cancels the debounce timer');
}

seed();
auth.currentUser = null;
for (const userId of ['student-A', 'guest', 'anonymous']) {
  const mounted = mountDraft({ userId });
  assert.equal(mounted.result.codeByLanguage.cpp, 'default', 'Signed-out hooks cannot load leftover private answers');
  assert.equal(mounted.result.customInput, '');
  mounted.dispose();
}
await authObserver(null);
assertCleared();

storageBlocked = true;
assert.equal(storage.clearCodeDrafts(), false, 'Storage cleanup failure must be reported');
auth.currentUser = { uid: 'student-A' };
await logout();
assert.equal(auth.currentUser, null, 'Cleanup failure must not prevent sign-out');
assert.match(warnings.at(-1), /could not be cleared.*browser data/);
const unavailableStorage = mountDraft();
assert.equal(unavailableStorage.result.codeByLanguage.cpp, 'default');
unavailableStorage.dispose();
storageBlocked = false;
providerCleanups.forEach(cleanup => cleanup?.());
assert.equal(authObserver, undefined);
console.log('Draft privacy checks passed: logout, expiry/account changes, legacy keys, failed sign-out/storage, late autosaves, unmount flushes, and normal recovery.');
