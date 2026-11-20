const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Run against Vite on localhost:5173; identity and HTTP responses are isolated from real services.
const origin = 'http://localhost:5173';
const entries = (offset, count) => Array.from({ length: count }, (_, index) => ({
  rank: offset + index + 1, user_id: `user-${offset + index + 1}`, username: `Participant ${offset + index + 1}`,
  usn: `USN-${offset + index + 1}`, total_score: 100, problems_solved: 1, dsa_solved: 1, mcq_solved: 0,
}));

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  let browser;
  before(async () => { browser = await engine.launch({ headless: true }); });
  after(async () => { await browser?.close(); });

  async function mount(headers, pages = [entries(0, 20), entries(20, 3)], admin = false, guest = false) {
    const page = await browser.newPage();
    const errors = [], requested = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript((guest) => {
      window.leaderboardUser = guest ? null : { uid: 'user-1', getIdToken: async () => 'synthetic-token' };
    }, guest);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        if (url.pathname === '/src/lib/AuthContext.tsx') return route.fulfill({ contentType: 'text/javascript', body:
          'export const useAuth = () => ({ user: window.leaderboardUser, loading: false });' });
        if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'text/javascript', body:
          'export const auth = { get currentUser() { return window.leaderboardUser; } };' });
        return route.continue();
      }
      if (url.pathname === '/admin/') return admin ? route.fulfill({ json: {} }) : route.fulfill({ status: 403, json: { error: 'Not an admin' } });
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

  test(`${name}: separate counts and DSA results expand and collapse for every viewer`, { timeout: 15000 }, async () => {
    const problem = { type: 'code', score: 0, max_score: 100, attempts: 1 };
    const participant = {
      ...entries(0, 1)[0], dsa_solved: 1, mcq_solved: 2, total_score: 157.5,
      last_submission_time: Date.now() - 62 * 60_000,
      problem_scores: [
        { ...problem, problem_id: 'solved', problem_name: 'Solved DSA', score: 100, solved_at: 1000 },
        { ...problem, problem_id: 'partial', problem_name: 'Partial DSA', score: 37.5, test_cases_passed: 3, total_test_cases: 8 },
        { ...problem, problem_id: 'wrong', problem_name: 'Wrong DSA' },
        { ...problem, problem_id: 'untouched', problem_name: 'Untouched DSA', attempts: 0 },
        { ...problem, problem_id: 'mcq', problem_name: 'Hidden MCQ', type: 'mcq' },
      ],
    };
    for (const admin of [false, true]) {
      const fixture = await mount({}, [[participant]], admin, !admin);
      const { page } = fixture;
      try {
        await page.setViewportSize({ width: admin ? 1280 : 390, height: 844 });
        await page.getByRole('columnheader', { name: 'DSA Solved', exact: true }).waitFor();
        await page.getByRole('columnheader', { name: 'MCQ Solved', exact: true }).waitFor();
        await page.getByRole('columnheader', { name: 'Total Score', exact: true }).waitFor();
        const cells = page.locator('tbody tr').first().locator('td');
        assert.equal((await cells.nth(3).textContent()).trim(), '1');
        assert.equal((await cells.nth(4).textContent()).trim(), '2');
        assert.equal((await cells.nth(5).textContent()).trim(), '157.50');
        assert.equal((await cells.nth(6).textContent()).trim(), '1h 2m ago');
        assert.ok(await cells.nth(6).locator('span').getAttribute('title'));
        if (!admin) assert.equal(await page.getByText('YOU', { exact: true }).count(), 0);
        await page.getByRole('button', { name: 'View DSA results for Participant 1', exact: true }).click();
        const details = page.locator('tbody tr').nth(1);
        const headers = await page.getByRole('columnheader').count();
        assert.equal(await details.locator('td').getAttribute('colspan'), String(headers));
        for (const [name, result] of [['Solved DSA', 'Solved'], ['Partial DSA', 'Partially Solved'], ['Wrong DSA', 'Wrong Answer'], ['Untouched DSA', 'Not Attempted']]) {
          assert.match(await details.getByRole('heading', { name, exact: true }).locator('..').textContent(), new RegExp(result));
        }
        assert.match(await details.textContent(), /Test cases: 3 \/ 8 passed · 5 failed/);
        assert.doesNotMatch(await details.textContent(), /Hidden MCQ|SUBMISSIONS|Time Limit|Compilation|Runtime|Memory|View Code/);
        await page.getByRole('button', { name: 'Hide DSA results for Participant 1', exact: true }).click();
        assert.equal(await page.locator('tbody tr').count(), 1);
      } finally { await fixture.close(); }
    }
  });

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

  // The header is only true when the server served the public snapshot, even if the admin probe succeeds.
  test(`${name}: frozen header shows the public notice regardless of admin probe`, { timeout: 15000 }, async () => {
    for (const admin of [false, true]) {
      const fixture = await mount({ 'Access-Control-Expose-Headers': 'X-Leaderboard-Frozen', 'X-Leaderboard-Frozen': 'true' }, undefined, admin);
      try {
        await fixture.page.getByText(/Rankings are frozen/).waitFor();
        assert.equal(await fixture.page.getByText('Rankings are paused', { exact: true }).count(), 1);
      } finally { await fixture.close(); }
    }
  });

  test(`${name}: empty and malformed payloads have distinct states`, { timeout: 15000 }, async () => {
    for (const [body, message] of [[[], 'No participants yet'], [{ error: 'wrong body' }, 'Leaderboard unavailable']]) {
      const fixture = await mount({}, [body]);
      try {
        await fixture.page.getByText(message, { exact: true }).waitFor();
        assert.equal(await fixture.page.locator('tbody tr').count(), 0);
        if (!Array.isArray(body)) await fixture.page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
      } finally { await fixture.close(); }
    }
  });
}
