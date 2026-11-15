import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export const loadServerClock = (axios, globals = {}) => {
  const load = (path, imports = {}) => {
    const context = { exports: {}, performance, AbortController, console, setInterval, clearInterval, setTimeout, clearTimeout,
      ...globals, require: name => {
        if (name in imports) return imports[name];
        throw new Error(`Unexpected clock import: ${name}`);
      } };
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})');
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, context);
    return context.exports;
  };
  const clock = load('src/lib/serverClock.ts');
  const policy = load('src/lib/requestPolicy.ts', { axios: { default: axios }, './serverClock': clock });
  const apiClock = load('src/services/api/serverClock.ts', { axios: { default: axios }, '@/lib/serverClock': clock, '@/lib/requestPolicy': policy });
  return { clock, policy, ...apiClock };
};
