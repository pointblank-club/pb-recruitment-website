const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');

// Compile the real components with the installed compiler; no test runner dependency.
function loadComponent(relativePath, imports = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const component = new Module(filename);
  component.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireImport = component.require.bind(component);
  component.require = (name) => Object.hasOwn(imports, name) ? imports[name] : requireImport(name);
  component._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  return component.exports;
}

const { ProblemCard } = loadComponent('src/features/contests/components/ProblemCard.tsx');
const { ProblemList } = loadComponent('src/features/contests/components/ProblemList.tsx', {
  '@/lib/AuthContext': { useAuth: () => ({ user: { uid: 'participant' } }) },
  '@/lib/contestStorage': { getProblemAttempted: () => false },
  './ProblemAccordion': {
    ProblemAccordion: ({ problems, contestId, progress }) => React.createElement(ProblemCard, {
      problem: problems[0], contestId, progress: progress[problems[0].id],
    }),
  },
});

for (const [type, progress, expected] of [
  ['mcq', undefined, 'Status unavailable'],
  ['mcq', 'unavailable', 'Status unavailable'],
  ['mcq', 'unsolved', 'Not Attempted'],
  ['mcq', 'attempted', 'Attempted'],
  ['mcq', 'judging', 'Attempted'],
  ['mcq', 'solved', 'Attempted'],
  ['mcq', 'failed', 'Attempted'],
  ['code', 'solved', 'Solved'],
  ['code', 'failed', 'Failed'],
  ['code', 'judging', 'Judging'],
]) {
  test(`${type} ${progress ?? 'missing progress'} displays ${expected}`, () => {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement(ProblemList, {
        contestId: 'contest',
        problems: [{ id: 'question', type, progress, name: 'Question', score: 5 }],
      }),
    ));
    assert.ok(html.includes(`>${expected}</span>`), html);
  });
}
