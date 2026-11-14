const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Uses the existing Vite fixture; only identity and HTTP are replaced.
const origin = 'http://localhost:5173';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function mount({ ended = false, holdStatus = false } = {}) {
  const page = await browser.newPage();
  const errors = [];
  const endRequested = deferred(), endReply = deferred(), endHandled = deferred();
  const statusRequested = deferred(), statusReply = deferred(), statusHandled = deferred();
  const statusScopes = [];
  let endCalls = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.sessionUser = { uid: 'user-1', getIdToken: async () => 'user-1' };
    document.hasFocus = () => true;
  });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) {
      if (url.pathname === '/src/lib/AuthContext.tsx') {
        return route.fulfill({ contentType: 'text/javascript', body: `
          import React from '/node_modules/.vite/deps/react.js';
          const subscribe = listener => {
            window.addEventListener('session-auth', listener);
            return () => window.removeEventListener('session-auth', listener);
          };
          export const useAuth = () => ({
            user: React.useSyncExternalStore(subscribe, () => window.sessionUser), loading: false,
          });
        ` });
      }
      if (url.pathname === '/src/lib/firebase.ts') {
        return route.fulfill({ contentType: 'text/javascript', body:
          'export const auth = { get currentUser() { return window.sessionUser; } };' });
      }
      return route.continue();
    }
    if (url.origin !== 'http://localhost:8080') return route.abort();

    const contestId = url.pathname.split('/')[2];
    const userId = request.headers().authorization?.replace('Bearer ', '');
    const isEnded = ended && contestId === 'contest-A' && userId === 'user-1';
    if (url.pathname.endsWith('/end')) {
      endCalls++;
      endRequested.resolve();
      const status = await endReply.promise;
      await route.fulfill({ status, json: status === 200 ? { message: 'ended' } : { error: 'Synthetic End failure' } });
      endHandled.resolve();
      return;
    }
    if (url.pathname.endsWith('/session-status')) {
      statusScopes.push(`${contestId}/${userId}`);
      if (holdStatus && endCalls && contestId === 'contest-A' && userId === 'user-1') {
        statusRequested.resolve();
        await statusReply.promise;
      }
      await route.fulfill({ json: {
        tab_switch_count: 0, is_tab_switch_terminated: false, generation: 0,
        is_session_ended: isEnded || (holdStatus && endCalls && contestId === 'contest-A' && userId === 'user-1'),
      } });
      if (holdStatus && endCalls && contestId === 'contest-A' && userId === 'user-1') statusHandled.resolve();
      return;
    }
    if (url.pathname === `/contests/${contestId}`) {
      return route.fulfill({ json: {
        id: contestId, name: contestId, description: '', eligible_to: [], is_registered: true,
        start_time: Date.now() - 60_000, end_time: Date.now() + 3_600_000,
        registration_start_time: 0, registration_end_time: 0,
      } });
    }
    throw new Error(`Unexpected fixture HTTP: ${request.method()} ${url}`);
  });
  await page.goto(`${origin}/tests/contest-event-guards.html`);
  await page.waitForFunction(() => window.contestGuardFixture);
  await page.evaluate(() => {
    const { React, createRoot, MemoryRouter, Routes, Route, useNavigate, useLocation, ContestLayout } = window.contestGuardFixture;
    const h = React.createElement;
    function Location() {
      window.navigateSession = useNavigate();
      return h('output', { id: 'session-location' }, useLocation().pathname);
    }
    const workspace = h('textarea', { 'aria-label': 'Synthetic draft', defaultValue: 'draft' });
    window.sessionRoot = createRoot(document.getElementById('root'));
    window.sessionRoot.render(h(React.StrictMode, null,
      h(MemoryRouter, { initialEntries: ['/contests/contest-A/leaderboard'] },
        h(Location), h(Routes, null,
          h(Route, { path: '/contests/:contestId', element: h(ContestLayout) },
            h(Route, { path: 'leaderboard', element: workspace }),
            h(Route, { path: 'problems', element: workspace })),
          h(Route, { path: '/contest/:contestId', element: h('p', null, 'Contest details') })))));
  });
  await page.waitForFunction(() => localStorage.getItem('contest_submitted_contest-A_user-1') === 'true' || document.querySelector('dialog[open]'));
  return {
    page, statusScopes, endRequested, endReply, endHandled, statusRequested, statusReply, statusHandled,
    async close() { await page.close(); assert.deepEqual(errors, []); },
  };
}

async function switchScope(page, change) {
  await page.evaluate(change => {
    if (change === 'account') {
      window.sessionUser = { uid: 'user-2', getIdToken: async () => 'user-2' };
      window.dispatchEvent(new Event('session-auth'));
    }
    window.navigateSession(`/contests/${change === 'contest' ? 'contest-B' : 'contest-A'}/problems`);
  }, change);
  await page.waitForFunction(path => document.getElementById('session-location')?.textContent === path,
    `/contests/${change === 'contest' ? 'contest-B' : 'contest-A'}/problems`);
}

async function assertWorkspace(page, change) {
  const path = `/contests/${change === 'contest' ? 'contest-B' : 'contest-A'}/problems`;
  await page.waitForTimeout(250); // Allow a stale HTTP response and React effects to run before asserting.
  assert.equal(await page.locator('#session-location').textContent(), path);
  assert.equal(await page.getByRole('textbox', { name: 'Synthetic draft' }).count(), 1);
}

for (const change of ['contest', 'account']) {
  test(`server completion stays scoped when changing ${change}`, { timeout: 15_000 }, async () => {
    const fixture = await mount({ ended: true });
    try {
      await fixture.page.waitForFunction(() => localStorage.getItem('contest_submitted_contest-A_user-1') === 'true');
      await switchScope(fixture.page, change);
      await assertWorkspace(fixture.page, change);
      assert.ok(fixture.statusScopes.includes(change === 'contest' ? 'contest-B/user-1' : 'contest-A/user-2'));
    } finally { await fixture.close(); }
  });

  for (const response of ['success', 'failure', 'reconciliation']) {
    test(`late End ${response} cannot affect a new ${change}`, { timeout: 15_000 }, async () => {
      const fixture = await mount({ holdStatus: response === 'reconciliation' });
      try {
        const { page } = fixture;
        await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
        await page.waitForFunction(() => !!document.fullscreenElement);
        await page.evaluate(() => window.navigateSession('/contests/contest-A/problems'));
        await page.getByRole('button', { name: 'Back to Contest', exact: true }).click();
        await page.getByRole('button', { name: 'Yes, End Contest', exact: true }).click();
        await fixture.endRequested.promise;
        if (response === 'reconciliation') {
          fixture.endReply.resolve(500);
          await fixture.statusRequested.promise;
        }
        await switchScope(page, change);
        if (response === 'reconciliation') fixture.statusReply.resolve();
        else fixture.endReply.resolve(response === 'success' ? 200 : 500);
        await fixture.endHandled.promise;
        if (response === 'reconciliation') await fixture.statusHandled.promise;
        await assertWorkspace(page, change);
        assert.equal(await page.locator('dialog[open] [role="alert"]').count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Ending Contest…' }).count(), 0);
        assert.equal(await page.evaluate(() => localStorage.getItem(
          `contest_submitted_${window.sessionUser.uid === 'user-2' ? 'contest-A_user-2' : 'contest-B_user-1'}`
        )), null);
      } finally { await fixture.close(); }
    });
  }
}
