import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

class Element extends EventTarget {
  constructor({ clipboardAllowed = false, monaco = false } = {}) {
    super();
    this.clipboardAllowed = clipboardAllowed;
    this.monaco = monaco;
  }
  closest(selector) {
    return (selector.includes('data-clipboard-allowed') ? this.clipboardAllowed : this.monaco) ? this : null;
  }
}

const window = new EventTarget();
const listeners = new Map();
for (const method of ['addEventListener', 'removeEventListener']) {
  const original = window[method].bind(window);
  window[method] = (type, handler, capture) => {
    assert.equal(capture, true, `${type} must be intercepted before editor and React handlers`);
    if (!listeners.has(type)) listeners.set(type, new Set());
    if (method === 'addEventListener') listeners.get(type).add(handler);
    else listeners.get(type).delete(handler);
    // Node's EventTarget requires the options object to remove capture listeners correctly.
    original(type, handler, { capture });
  };
}
const warnings = [];
let cleanup;
const load = (path, imports = {}) => {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, window, Element, require: name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
};
const guards = load('src/features/contests/clipboardGuards.ts');
const { useContestEventBlocker } = load('src/features/contests/hooks/useContestEventBlocker.ts', {
  react: { useEffect: effect => { cleanup = effect(); } },
  'react-toastify': { toast: { warning: (...args) => warnings.push(args) } },
  '../clipboardGuards': guards,
});
const workspace = new Element({ monaco: true });
const customInput = new Element({ clipboardAllowed: true });
const header = new Element();
const dispatch = (type, properties = {}, target = header) => {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.assign(event, {
    key: '', code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    repeat: false, isComposing: false, getModifierState: () => false,
  }, properties);
  Object.defineProperty(event, 'target', { value: target });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

useContestEventBlocker({ enabled: false });
assert.equal(listeners.size, 0, 'No restrictions outside an active participant session');
assert.equal(dispatch('keydown', { key: 'F12' }), false);

for (let mount = 0; mount < 2; mount++) {
  useContestEventBlocker({ enabled: true });
  assert.equal(listeners.size, 8);
  assert.ok([...listeners.values()].every(handlers => handlers.size === 1));
  for (const target of [workspace, customInput, header]) {
    for (const type of ['contextmenu', 'dragstart', 'dragover', 'drop']) {
      assert.equal(dispatch(type, {}, target), true, `${type} blocked everywhere, including custom input`);
    }
    for (const type of ['copy', 'cut', 'paste']) {
      assert.equal(dispatch(type, {}, target), target !== customInput, `${type} preserves the existing clipboard exception`);
    }
    const blockedKeys = [
      { key: 'F12' }, { key: 'ContextMenu' }, { key: 'F10', shiftKey: true },
      ...['F4', 'F5', 'F7', 'F9'].map(key => ({ key, shiftKey: true })),
      ...['I', 'J', 'C', 'K', 'E', 'M', 'Z'].map(key => ({ key, ctrlKey: true, shiftKey: true })),
      ...['i', 'j', 'c', 'k', 'e', 'm', 'z', 'u'].map(key => ({ key, metaKey: true, altKey: true })),
      { key: 'C', metaKey: true, shiftKey: true },
      { key: 'Dead', code: 'KeyI', metaKey: true, altKey: true },
      { key: 'u', ctrlKey: true },
      ...['p', 's'].flatMap(key => [
        { key, ctrlKey: true }, { key, metaKey: true }, { key, ctrlKey: true, shiftKey: true },
      ]),
    ];
    for (const shortcut of blockedKeys) {
      assert.equal(dispatch('keydown', shortcut, target), true, `Blocked: ${JSON.stringify(shortcut)}`);
    }
    for (const shortcut of [
      ...['c', 'x', 'v', 'Insert'].flatMap(key => [{ key, ctrlKey: true }, { key, metaKey: true }]),
      { key: 'Insert', shiftKey: true }, { key: 'Delete', shiftKey: true },
    ]) {
      assert.equal(dispatch('keydown', shortcut, target), target !== customInput, 'Clipboard keyboard alternatives follow the same exception');
    }
    for (const shortcut of [
      { key: 'a' }, { key: 'Tab' }, { key: 'Tab', shiftKey: true }, { key: 'Escape' },
      { key: 'Enter' }, { key: 'ArrowDown' }, { key: 'F5' },
      ...['a', 'z', 'y', 'm', '+', '-', '0', 'f'].map(key => ({ key, ctrlKey: true })),
      { key: 'z', metaKey: true, shiftKey: true },
      { key: 'c', ctrlKey: true, altKey: true },
      { key: 'u', ctrlKey: true, shiftKey: true },
      { key: 'c', ctrlKey: true, getModifierState: modifier => modifier === 'AltGraph' },
      { key: 'Process', isComposing: true },
    ]) {
      assert.equal(dispatch('keydown', shortcut, target), false, `Available: ${JSON.stringify(shortcut)}`);
    }
  }
  const warningCount = warnings.length;
  assert.equal(dispatch('keydown', { key: 'F12', repeat: true }), true);
  assert.equal(warnings.length, warningCount, 'Key repeats cannot flood warnings');
  let reachedEditor = false;
  const editorHandler = () => { reachedEditor = true; };
  window.addEventListener('keydown', editorHandler, true);
  dispatch('keydown', { key: 'F12' }, workspace);
  assert.equal(reachedEditor, false, 'Restricted events cannot reach later library handlers');
  for (const key of ['z', 'm']) {
    reachedEditor = false;
    assert.equal(dispatch('keydown', { key, ctrlKey: true, shiftKey: true }, workspace), true,
      'Cancel conflicting browser defaults even inside Monaco');
    assert.equal(reachedEditor, true, 'Monaco redo and accessible Tab-focus handlers still receive the event');
  }
  window.removeEventListener('keydown', editorHandler, true);
  cleanup();
  assert.ok([...listeners.values()].every(handlers => handlers.size === 0), 'Unmount/StrictMode cleanup removes all listeners');
  assert.equal(dispatch('keydown', { key: 'F12' }), false);
  assert.equal(dispatch('contextmenu'), false);
  assert.equal(dispatch('paste', {}, workspace), false);
}
console.log('Contest event guards passed: browser shortcuts, context menus, drag/drop, clipboard exceptions, editing/accessibility, and cleanup.');
