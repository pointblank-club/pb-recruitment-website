import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/SignUp.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('SignUp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[1]?.getText(ast).includes('formData.confirmPassword')) {
    effect = node;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect, 'Confirmation validation must react to confirmation changes');
assert.ok(effect.arguments[1].elements.some(node => node.getText(ast) === 'formData.password'),
  'Confirmation validation must also react to password changes');

const callback = ts.transpileModule(`(${effect.arguments[0].getText(ast)})`, {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText;

for (const changedField of ['password', 'confirmPassword']) {
  const formData = { password: 'first-password', confirmPassword: 'second-password' };
  let errors = { email: 'Keep unrelated errors' };
  let validate;
  const runEffect = runInNewContext(callback, {
    formData,
    setErrors: update => { errors = update(errors); },
    setTimeout: fn => { validate = fn; },
    clearTimeout() {},
  });
  runEffect();
  validate();
  assert.equal(errors.confirmPassword, 'Passwords do not match');
  formData[changedField] = formData[changedField === 'password' ? 'confirmPassword' : 'password'];
  runEffect();
  validate();
  assert.equal(errors.confirmPassword, undefined, `Editing ${changedField} must clear the mismatch`);
  assert.equal(errors.email, 'Keep unrelated errors');
}
console.log('Signup password confirmation regression checks passed.');
