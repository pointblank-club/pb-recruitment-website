const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Run against Vite on localhost:5173; identity and HTTP responses are isolated from real services.
const origin = 'http://localhost:5173';
const entries = (offset, count) => Array.from({ length: count }, (_, index) => ({
  rank: offset + index + 1, user_id: `user-${offset + index + 1}`, username: `Participant ${offset + index + 1}`,
  usn: `USN-${offset + index + 1}`, total_score: 100, problems_solved: 1,
}));

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  let browser;
  before(async () => { browser = await engine.launch({ headless: true }); });
  after(async () => { await browser?.close(); });

  async function mount(headers, pages = [entries(0, 20), entries(20, 3)]) {
    const page = await browser.newPage();
    const errors = [], requested = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.leaderboardUser = { uid: 'user-1', getIdToken: async () => 'synthetic-token' };
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        if (url.pathname === '/src/lib/AuthContext.tsx') return route.fulfill({ contentType: 'text/javascript', body:
          'export const useAuth = () => ({ user: window.leaderboardUser, loading: false });' });
        if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'text/javascript', body:
          'export const auth = { get currentUser() { return window.leaderboardUser; } };' });
        return route.continue();
      }
      if (url.pathname === '/admin/') return route.fulfill({ status: 403, json: { error: 'Not an admin' } });
      if (url.pathname === '/contests/test') return route.fulfill({ json: {
        id: 'test', name: 'Leaderboard regression', description: '', eligible_to: [], is_registered: true,
        start_time: Date.now() - 60000, end_time: Date.now() + 3600000,
        registration_start_time: 0, registration_end_time: 0,
      } });
      if (url.pathname === '/contests/test/leaderboard') {
        const index = Number(url.searchParams.get('page'));
        requested.push(index);
        return route.fulfill({
          headers: { 'Access-Control-Expose-Headers': 'X-Total-Count, X-Total-Pages', ...headers },
          json: pages[index] ?? [],
        });
      }
      return route.abort();
    });
    await page.goto(`${origin}/tests/leaderboard-pagination.html`);
    await page.waitForFunction(() => window.leaderboardFixture);
    await page.evaluate(() => {
      const { React, createRoot, MemoryRouter, Routes, Route, ContestLeaderboardPage } = window.leaderboardFixture;
      const h = React.createElement;
      window.leaderboardRoot = createRoot(document.getElementById('root'));
      window.leaderboardRoot.render(h(React.StrictMode, null, h(MemoryRouter, { initialEntries: ['/contests/test/leaderboard'] },
        h(Routes, null, h(Route, { path: '/contests/:contestId/leaderboard', element: h(ContestLeaderboardPage) })))));
    });
    return { page, requested, async close() { await page.close(); assert.deepEqual(errors, []); } };
  }

  for (const [label, headers] of Object.entries({
    missing: {}, countOnly: { 'X-Total-Count': '23' }, pagesOnly: { 'X-Total-Pages': '2' },
    malformed: { 'X-Total-Count': 'NaN', 'X-Total-Pages': '-1' },
    stale: { 'X-Total-Count': '0', 'X-Total-Pages': '0' },
  })) {
    test(`${name}: ${label} totals cannot hide participants or break navigation`, { timeout: 15000 }, async () => {
      const fixture = await mount(headers);
      const { page } = fixture;
      try {
        await page.locator('tbody tr').first().waitFor();
        assert.equal(await page.locator('tbody tr').count(), 20);
        assert.match(await page.locator('tbody tr').first().textContent(), /Participant 1.*YOU/s);
        assert.equal(await page.getByText('YOU', { exact: true }).count(), 1);
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('tbody tr')?.textContent.includes('Participant 21'));
        assert.equal(await page.locator('tbody tr').count(), 3);
        assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
        assert.equal(await page.getByText('Page 2', { exact: true }).count(), 1);
        await page.getByRole('button', { name: 'Previous', exact: true }).click();
        await page.getByText('YOU', { exact: true }).waitFor();
        assert.equal(await page.locator('tbody tr').count(), 20);
        assert.ok(fixture.requested.includes(1));
      } finally { await fixture.close(); }
    });
  }

  test(`${name}: full final page permits an empty probe and going back`, { timeout: 15000 }, async () => {
    const fixture = await mount({}, [entries(0, 20), entries(20, 20)]);
    const { page } = fixture;
    try {
      await page.locator('tbody tr').first().waitFor();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('tbody tr')?.textContent.includes('Participant 21'));
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByText('No more participants on this page', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
      assert.equal(await page.getByText('No participants yet', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Previous', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('tbody tr')?.textContent.includes('Participant 21'));
      assert.equal(await page.locator('tbody tr').count(), 20);
    } finally { await fixture.close(); }
  });

  test(`${name}: empty and malformed payloads have distinct states`, { timeout: 15000 }, async () => {
    for (const [body, message] of [[[], 'No participants yet'], [{ error: 'wrong body' }, 'Error loading leaderboard']]) {
      const fixture = await mount({}, [body]);
      try {
        await fixture.page.getByText(message, { exact: true }).waitFor();
        assert.equal(await fixture.page.locator('tbody tr').count(), 0);
        if (!Array.isArray(body)) await fixture.page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
      } finally { await fixture.close(); }
    }
  });
}
