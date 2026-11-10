import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function loadConfig(env) {
  const exports = {};
  runInNewContext(source, {
    exports, process: { env }, __dirname: fileURLToPath(new URL('..', import.meta.url)),
    require: (id) => {
      if (id === 'vite') return { defineConfig: (config) => config };
      if (id === '@sentry/bundler-plugins/vite') return { sentryVitePlugin: (options) => options };
      if (id === '@vitejs/plugin-react' || id === '@tailwindcss/vite') return () => ({});
      return require(id);
    },
  });
  return exports.default;
}

for (const env of [
  {},
  { SENTRY_AUTH_TOKEN: 'synthetic-token', SENTRY_ORG: 'test' },
  { SENTRY_AUTH_TOKEN: 'synthetic-token', SENTRY_PROJECT: 'test' },
  { SENTRY_ORG: 'test', SENTRY_PROJECT: 'test' },
]) {
  const config = loadConfig(env);
  assert.equal(config.build.sourcemap, false, 'Incomplete credentials must not emit public maps');
  assert.equal(config.plugins.at(-1).disable, true);
}

const config = loadConfig({
  SENTRY_AUTH_TOKEN: 'synthetic-token', SENTRY_ORG: 'test', SENTRY_PROJECT: 'test',
  SENTRY_RELEASE: 'release-sha', VERCEL_GIT_COMMIT_SHA: 'vercel-sha',
});
const sentry = config.plugins.at(-1);
assert.equal(config.build.sourcemap, 'hidden');
assert.equal(sentry.disable, false);
assert.equal(sentry.telemetry, false);
assert.equal(sentry.release.name, 'release-sha');
assert.equal(sentry.sourcemaps.filesToDeleteAfterUpload[0], './dist/**/*.map');
const uploadError = new Error('synthetic upload failure');
assert.throws(() => sentry.errorHandler(uploadError), (error) => error === uploadError);
assert.equal(loadConfig({ SENTRY_AUTH_TOKEN: 'test', SENTRY_ORG: 'test', SENTRY_PROJECT: 'test', VERCEL_GIT_COMMIT_SHA: 'vercel-sha' }).plugins.at(-1).release.name, 'vercel-sha');
console.log('Sentry build configuration checks passed.');
