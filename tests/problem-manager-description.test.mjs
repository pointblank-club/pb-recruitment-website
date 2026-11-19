import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import React from "react";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/components/ProblemManager.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const hookState = [];
let hookCursor = 0;
const ReactHarness = {
  ...React,
  useState(initialValue) {
    const index = hookCursor++;
    if (!(index in hookState)) {
      hookState[index] = typeof initialValue === "function" ? initialValue() : initialValue;
    }
    return [hookState[index], (nextValue) => {
      hookState[index] = typeof nextValue === "function" ? nextValue(hookState[index]) : nextValue;
    }];
  },
};

const savedProblem = {
  id: "problem-1",
  contest_id: "contest-1",
  name: "Existing MCQ",
  description: "Original question text",
  score: 25,
  type: "mcq",
  answer: [1],
  options: ["First", "Second"],
  testcases: [],
};
const calls = [];
let failNextSave = true;
const adminApi = {
  async getProblemById() {
    return { ...savedProblem };
  },
  async updateProblem(_contestId, problemId, payload) {
    calls.push({ problemId, payload: structuredClone(payload) });
    if (failNextSave) {
      failNextSave = false;
      throw Object.assign(new Error("Temporary save failure"), { isAxiosError: true });
    }
    Object.assign(savedProblem, payload);
    return { id: problemId, name: savedProblem.name, score: savedProblem.score, type: savedProblem.type };
  },
};
const module = { exports: {} };
const dependencies = {
  react: { ...ReactHarness, default: ReactHarness },
  axios: { default: { isAxiosError: (error) => Boolean(error?.isAxiosError) } },
  "react-toastify": { toast: { error() {}, success() {} } },
  "@/features/contests/markdownText": { getQuestionTextBody: (text) => text },
  "@/services/api/adminApi": { adminApi },
};
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
    return dependencies[name];
  },
});
const ProblemManager = module.exports.default;
const savedCallbacks = [];
const props = {
  contestId: "contest-1",
  problems: [{ id: savedProblem.id, name: savedProblem.name, score: savedProblem.score, type: "mcq" }],
  onProblemSaved: (problem) => savedCallbacks.push(problem),
  onProblemDeleted() {},
};

const render = () => {
  hookCursor = 0;
  return ProblemManager(props);
};
const childrenOf = (node) => {
  if (Array.isArray(node)) return node.flatMap(childrenOf);
  if (!React.isValidElement(node)) return [];
  return [node, ...childrenOf(node.props.children)];
};
const findElement = (tree, predicate, description) => {
  const result = childrenOf(tree).find(predicate);
  assert.ok(result, `${description} is rendered`);
  return result;
};
const textOf = (node) => {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return textOf(node.props.children);
};
const editButton = (tree) => findElement(tree,
  (element) => element.type === "button" && textOf(element) === "Edit", "Edit button");
const descriptionField = (tree) => findElement(tree,
  (element) => element.type === "textarea" && element.props.id === "problem-description", "description textarea");
const descriptionCheckbox = (tree) => findElement(tree,
  (element) => element.type === "input" && element.props.type === "checkbox", "description checkbox");
const flushUpdates = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

let tree = render();
editButton(tree).props.onClick();
await flushUpdates();
tree = render();
assert.equal(descriptionField(tree).props.value, "Original question text", "editing loads the saved description");

descriptionCheckbox(tree).props.onChange({ target: { checked: false } });
tree = render();
assert.equal(childrenOf(tree).some((element) => element.type === "textarea"), false,
  "turning the checkbox off hides the description field");
descriptionCheckbox(tree).props.onChange({ target: { checked: true } });
tree = render();
assert.equal(descriptionField(tree).props.value, "Original question text",
  "turning it back on restores the draft text");

const form = findElement(tree, (element) => element.type === "form", "problem form");
await form.props.onSubmit({ preventDefault() {} });
tree = render();
assert.match(textOf(tree), /Temporary save failure/, "failed save keeps the edit dialog and shows the error");
assert.equal(calls.length, 1);
assert.deepEqual(calls[0], {
  problemId: "problem-1",
  payload: {
    name: "Existing MCQ",
    description: "Original question text",
    score: 25,
    type: "mcq",
    answer: [1],
    options: ["First", "Second"],
  },
}, "failed save receives the preserved description payload");

await findElement(tree, (element) => element.type === "form", "retry form")
  .props.onSubmit({ preventDefault() {} });
assert.equal(calls.length, 2);
assert.deepEqual(calls[1], calls[0], "retry sends the same payload");
assert.equal(savedProblem.description, "Original question text", "successful retry stores the original text");
assert.deepEqual(JSON.parse(JSON.stringify(savedCallbacks)), [
  { id: "problem-1", name: "Existing MCQ", score: 25, type: "mcq" },
]);

tree = render();
editButton(tree).props.onClick();
await flushUpdates();
tree = render();
assert.equal(descriptionField(tree).props.value, "Original question text",
  "reopening the saved problem shows the returned description text");

console.log("Problem description edit, toggle, failed-save retry, payload, and reopen regression passed.");
