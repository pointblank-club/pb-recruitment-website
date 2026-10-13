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
