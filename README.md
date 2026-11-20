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

## Server clock

Every backend API response supplies `X-Server-Time-Ms` (Unix milliseconds), including
error responses. All four API clients calibrate the same in-memory clock before
returning response data. Request timing starts after token preparation; the clock
then advances with `performance.now()` so changes to the machine clock do not
change event availability or countdowns.

Deploy the backend header and CORS exposure before this frontend. Samples use
only the backend's committed timestamp; request processing time is never added
to UTC. The estimate is conservative and can lag by response-transfer time.
Missing or invalid headers preserve an already trusted clock. While synced,
responses taking more than two seconds cannot replace that estimate.

Startup with unknown UTC triggers immediate calibration. Resume after tab/window
focus loss or back-forward cache restoration marks the old estimate untrusted,
blocks time-dependent entry/proctoring, and accepts a fresh sample even on a slow
connection. Requests dispatched before recovery cannot restore the old estimate.
An admitted workspace stays mounted behind an interaction blocker during recovery,
preserving drafts and unsaved MCQ answers while submissions remain paused. An
accessible status and retry action also appear during initial entry and stay
outside the inert workspace. Recovery restores focus to the previous control,
or the workspace if that control was removed.
Three bounded attempts use cancellable, jittered backoff; exhausted attempts log
a `[ClockSync]` summary containing only code, status, and message, and retry
automatically in the background. Accepted responses do not log success messages.
Accepted corrections notify the same subscription as readiness.
A failed background refinement retains trusted time; a failed recovery does not.

Normal API traffic refreshes the clock, with a jittered idle refresh after ten
minutes. An absolute `Retry-After` date with unknown UTC stops automatic retries
and surfaces the request error; numeric delays remain usable. No external time
service, browser storage, or new endpoint is used.

Run `npm run test:clock` for clock/API checks. With Vite on localhost:5173 and
Playwright available, run `node --test tests/server-clock.browser.cjs` for mounted
Chromium/Firefox checks. Set `PLAYWRIGHT_MODULE` to an existing installation if
Playwright is not installed locally.

## Safe Exam Browser and browser sessions

The backend detects SEB from its `SEB/<version>` user-agent marker. No Browser
Exam Keys, hash verification, or per-contest SEB configuration are used. Detection
is best effort: user-agent strings can be spoofed and do not authenticate a SEB
build or configuration.

During live exam participation, ordinary browsers are flagged **SEB not detected**
but remain allowed and consume no SEB sessions. Registration, leaderboard viewing,
and post-contest review do not create sessions or browser flags.

SEB participants get three server-issued Secure, HttpOnly cookie sessions per
contest: the initial session and two restarts. In-site navigation (including the
leaderboard), reconnections, concurrent tabs, and retried startup requests reuse
the existing session. The fourth distinct SEB session locks participation;
code/MCQ admission also enforces the lock inside its database transaction.
Existing drafts and submitted answers remain intact.

Admins can use **Reset Browser Sessions** on the contestant list to clear the current
count and session-limit lock. Browser flags and other moderation/tab-switch state
are preserved. The backend records the admin, timestamp, previous count, and new
reset generation. The next SEB session check becomes 1 of 3 without restarting
SEB. Old-generation startup retries cannot consume the new allowance.

Configure the `.seb` file to clear session cookies when starting an exam
(`examSessionClearCookiesOnStart=true`). These are application sessions, not
cryptographically distinct SEB process launches. SEB needs cookies and Web Locks
to coordinate startup across tabs; ordinary-browser access does not require them.
Cookie or connection failures offer a retry action without consuming additional
sessions for the same startup. Confirmation and protected-read recovery share a
15-second total deadline, including authentication and waiting for Web Locks.
Cancelling the last caller cancels recovery; another active caller keeps the shared
handshake alive. Ongoing browser locks and resets use the existing session-status
reconciler, including while admission is blocked. Completion and tab termination
stop startup retries and use their existing terminal flows.

Deploy backend migration **47**, all new API instances, and this frontend together
before an exam. CloudFront must forward API cookies, and credentialed CORS
responses must allow the explicit frontend origin. The existing server-clock
header exposure and no-cache requirements remain unchanged; no custom SEB headers
are needed.

Run `npm run test:seb` for session protocol checks. With Vite and Playwright,
run `node --test tests/seb.browser.cjs` for Chromium/Firefox coverage of navigation,
reconnection, concurrency, flagging, session locks, and admin resets.

## Coding question limits

Only coding questions have editable time and memory limits, shown on their
problem statements. Time uses milliseconds (1–10000); memory uses MiB (2–500).
New questions default to 1000 ms / 256 MiB. MCQ forms and payloads omit both fields.
Deploy the backend with migration 46 and replace all old API instances before
using these controls. Coding saves require matching persisted limits in the write
response; missing, null, or mismatched limits keep the form open with an error.
Restoring configurable limits reverses the fixed-budget policy and requires a
capacity decision before rollout. Migration 42 deleted historical custom values;
migration 46 supplies defaults, so recovering those values requires a pre-42 backup.

## Leaderboard pagination

Leaderboard rows and Previous/Next navigation use the response body, independent
of `X-Total-Count` and `X-Total-Pages`. The API currently returns 20 participants
per page. Exact totals are not displayed; a full final page may allow one extra
Next request, which shows an end-of-list message with Previous still available.

Run `npm run test:leaderboard` for response validation. With Vite on
`localhost:5173` and Playwright available, run
`node --test tests/leaderboard-pagination.browser.cjs` for rendered participants,
current-user highlighting, and navigation checks. `PLAYWRIGHT_MODULE` can point
to an existing Playwright installation.

## Local code drafts

Code and custom-input drafts survive reloads while signed in. Signing out, losing
the authenticated session, or switching accounts clears all local code drafts on
that browser profile, including older guest drafts. Pending autosaves and unmount
callbacks cannot save drafts for a signed-out or different account. Submission and
proctoring records are retained. A cleanup failure displays a warning to clear the
site's browser data before leaving a shared computer.

Run `npm run test:drafts` for the logout and draft-persistence regression checks.

## Exam browser restrictions

Active, registered participants have page-level restrictions throughout the contest
layout: context menus, clipboard actions (except the custom-input field), native
drag/drop, DevTools shortcuts, view source, printing, and saving. The shortcut
guards include Chromium/Edge, Firefox tool-specific keys, and macOS variants.
Editor redo, accessible Tab navigation, zoom, and ordinary typing remain available.
Conflicting browser defaults are cancelled without suppressing Monaco's redo and
macOS Tab-focus handlers.
Contest pages are hidden by the existing print stylesheet, including after the
contest ends. The layout's event guards stop on session termination, manual
submission, contest expiry, or leaving the layout. Tab-switch synchronization
stays active for terminated sessions so server resets can still be received.

These controls deter casual misuse; they cannot secure a candidate-controlled
browser. Firefox's Shift+right-click override, browser menus, already-open or remote
DevTools, extensions, disabled or modified JavaScript, OS screenshots, and other
devices remain outside page control.
Do not use DevTools heuristics to disqualify candidates: they cannot reliably
distinguish cheating from normal browser behavior. Tamper-resistant delivery needs
a managed exam browser/device and server-enforced contest rules; user-agent checks
are not proof of a locked-down client.

Run `npm run test:proctoring` for the event-guard regression checks.
With Vite running on `localhost:5173` and Playwright available, run
`node tests/contest-event-guards.browser.cjs` for mounted Chromium/Firefox checks.
`PLAYWRIGHT_MODULE` may point to an existing Playwright package installation.

With the same Vite and Playwright setup, run `npm run test:session` for mounted
Chromium checks of completion scope and delayed End/status responses across
contest and account changes. Firebase identity and HTTP are mocked; no real
services or participant data are used.

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
