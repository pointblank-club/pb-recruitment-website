# React + TypeScript + Vite

## Local development

Use Node.js 22.12 or newer and configure `.env` from `.env.example`:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_MOCK_SUBMISSION_JUDGING=false
```

Set all `VITE_FIREBASE_*` values from a registered web app in the **same Firebase
project** as the backend service account. The current local backend uses
`pb-recruitment`; tokens from a different project will be rejected.

Start the Go backend on port 8080 using the
[backend instructions](https://github.com/pointblank-club/pb-recruitment-server#how-to-run), then start the frontend:

```bash
npm install
npm run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173`. The backend permits this origin in its CORS settings.
Restart Vite after changing `.env`. Local code judging uses the backend's EC2 SSH
tunnel and recovery polling; keep the tunnel running.

For UI-only development, `VITE_MOCK_SUBMISSION_JUDGING=true` replaces verdict
polling with fabricated accepted results after the real submit call. It is ignored
in production builds; keep it false when verifying real judging.

## Crash reporting and production source maps

Set `VITE_SENTRY_DSN` to enable crash reporting and UID-only identity. Replay,
performance tracing, and handled API error reporting are disabled.

For readable production stack traces, configure these **build environment**
variables in the deployment platform:

- `SENTRY_AUTH_TOKEN`: a Sentry token with source-map upload/release permissions.
- `SENTRY_ORG`: the organization slug.
- `SENTRY_PROJECT`: the project slug matching the DSN.
- `SENTRY_RELEASE`: optional release identifier; defaults to
  `VERCEL_GIT_COMMIT_SHA`, then the current Git commit.

These settings are read from the build process, not Vite's `.env` file. Never
prefix the upload token with `VITE_`; it must not enter the browser bundle.
Run the normal `npm run build`. With all three upload settings present, the
Sentry plugin injects the release and debug IDs, uploads hidden source maps,
and removes maps from `dist` before deployment. Upload failures fail the build.
Without upload settings, builds work normally and generate no source maps;
crash reports then have minified stack locations.

Keep the DSN unset for previews, or build previews with
`npm run build -- --mode preview` to distinguish their events from production.
After deployment, verify a synthetic crash resolves to the original TypeScript
source in Sentry. No participant data is needed for this check.

Run `node tests/sentry-build.test.mjs` to check the build configuration without
credentials or network access.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
