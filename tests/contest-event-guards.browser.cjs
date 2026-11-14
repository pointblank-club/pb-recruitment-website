const assert = require('node:assert/strict');
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Run with Vite on localhost:5173. Authentication and contest state are isolated from real services.
const origin = 'http://localhost:5173';

(async () => {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.terminated = false;
        window.fixtureContest = {
          name: 'Guard regression', is_registered: true,
          start_time: Date.now() - 60000, end_time: Date.now() + 3600000,
        };
        window.refetchContest = async () => window.fixtureContest;
      });
      const mocks = {
        '/src/lib/AuthContext.tsx': 'const user = { uid: "participant" }; export const useAuth = () => ({ user });',
        '/src/features/contests/hooks/useContest.ts': 'export const useContest = () => ({ contest: window.fixtureContest, isLoading: false, refetch: window.refetchContest });',
        '/src/features/contests/components/ContestParticipationGate.tsx': 'export const ContestParticipationGate = () => null;',
        '/src/features/contests/hooks/useTabSwitchTracker.ts': `
          export const useTabSwitchTracker = options => {
            window.trackerOptions = options;
            return {
              tabSwitchCount: window.terminated ? 5 : 0, pendingSyncCount: 0, maxSwitches: 5,
              isWarningModalOpen: false, isTerminated: window.terminated, isServerConfirmedTermination: true,
              apiStatus: 'supported', closeWarningModal() {}, openWarningModal() {}, notifyServerTermination() {},
            };
          };
        `,
      };
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (mocks[url.pathname]) return route.fulfill({ contentType: 'text/javascript', body: mocks[url.pathname] });
        return route.continue();
      });
      await page.goto(`${origin}/tests/contest-event-guards.html`);
      await page.waitForFunction(() => window.contestGuardFixture);
      await page.evaluate(() => {
        const { React, createRoot, MemoryRouter, Routes, Route, ContestLayout } = window.contestGuardFixture;
        const h = React.createElement;
        const types = ['keydown', 'contextmenu', 'copy', 'cut', 'paste', 'dragstart', 'dragover', 'drop'];
        window.guardListeners = new Map(types.map(type => [type, new Set()]));
        const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
        add('keydown', event => { window.lastKeyDown = event; }, true);
        window.addEventListener = (type, handler, options) => { window.guardListeners.get(type)?.add(handler); add(type, handler, options); };
        window.removeEventListener = (type, handler, options) => { window.guardListeners.get(type)?.delete(handler); remove(type, handler, options); };
        window.root = createRoot(document.getElementById('root'));
        window.controlVersion = 0;
        const controls = () => h('div', { key: window.controlVersion, 'data-control-version': window.controlVersion },
          h('textarea', { id: 'custom-input', 'data-clipboard-allowed': 'true' }),
          h('input', { id: 'native-input' }),
          h('textarea', { id: 'read-only', readOnly: true }),
          h('input', { id: 'checkbox', type: 'checkbox' }),
          h('div', { className: 'monaco-editor' }, h('textarea', { id: 'monaco-input' })),
        );
        window.renderLayout = () => window.root.render(h(React.StrictMode, null,
          h(MemoryRouter, { initialEntries: ['/contests/test/leaderboard'] },
            h(Routes, null, h(Route, { path: '/contests/:contestId', element: h(ContestLayout) },
              h(Route, { path: 'leaderboard', element: controls() }))))));
        window.renderLayout();
      });
      const listeners = count => page.waitForFunction(count => [...window.guardListeners.values()].every(set => set.size === count), count, { timeout: 5000 });
      const headerBlocked = () => page.evaluate(() => {
        const target = document.querySelector('h1');
        return ['copy', 'contextmenu', 'drop'].map(type => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          target.dispatchEvent(event);
          return event.defaultPrevented;
        });
      });
      const terminate = async value => {
        await page.evaluate(value => { window.terminated = value; window.renderLayout(); }, value);
        await listeners(value ? 0 : 1);
        assert.equal(await page.evaluate(() => window.trackerOptions.isSessionActive), true, `${name}: resets must remain observable`);
      };
      await listeners(1);
      assert.deepEqual(await headerBlocked(), [true, true, true]);
      assert.equal(await page.locator('.contest-screen').getAttribute('data-proctored'), null);
      await terminate(true);
      assert.deepEqual(await headerBlocked(), [false, false, false], `${name}: termination removes page guards`);

      const redo = async selector => {
        await page.evaluate(() => { window.controlVersion++; window.renderLayout(); });
        await page.waitForFunction(() => document.querySelector('[data-control-version]')?.getAttribute('data-control-version') === String(window.controlVersion));
        const field = page.locator(selector);
        await field.fill('');
        await field.pressSequentially('answer');
        await page.keyboard.press('Control+z');
        assert.notEqual(await field.inputValue(), 'answer', `${name}: native undo`);
        await page.keyboard.press('Control+Shift+z');
        assert.equal(await page.evaluate(() => window.lastKeyDown.defaultPrevented), false, `${name}: native redo default`);
        return field.inputValue();
      };
      const baseline = [await redo('#custom-input'), await redo('#native-input')];
      if (name === 'chromium') assert.deepEqual(baseline, ['answer', 'answer']);
      await terminate(false);
      assert.deepEqual(await headerBlocked(), [true, true, true], `${name}: reset restores guards`);
      assert.deepEqual([await redo('#custom-input'), await redo('#native-input')], baseline, `${name}: guards preserve native redo`);
      assert.deepEqual(await page.evaluate(() => {
        const key = id => {
          const event = new KeyboardEvent('keydown', { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
          document.getElementById(id).dispatchEvent(event);
          return event.defaultPrevented;
        };
        return ['read-only', 'checkbox', 'monaco-input'].map(key);
      }), [true, true, true], `${name}: noneditable controls stay guarded and Monaco keeps its special handling`);
      for (const terminated of [false, true]) {
        await terminate(terminated);
        await page.emulateMedia({ media: 'print' });
        assert.equal(await page.locator('.contest-screen').evaluate(node => getComputedStyle(node).display), 'none');
        await page.emulateMedia({ media: 'screen' });
      }
      await page.evaluate(() => window.root.unmount());
      await listeners(0);
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}: mounted layout termination/reset, tracker lifetime, StrictMode/cleanup, native redo, and existing print policy`);
    } finally {
      await browser.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
