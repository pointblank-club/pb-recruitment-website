const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:5173';

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  let browser;
  before(async () => { browser = await engine.launch({ headless: true }); });
  after(async () => { await browser?.close(); });

  async function mount({ skew, phase = 'open', header = true, view = 'layout', processingDelay = 0 }) {
    const page = await browser.newPage();
    const reference = Date.now();
    const errors = [];
    let headerMode = header, healthDelay = 0, deliveryDelay = 0, leaderboardCalls = 0, submissions = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(skew => {
      const OriginalDate = Date;
      window.clockSkew = skew;
      window.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : [OriginalDate.now() + window.clockSkew])); }
        static now() { return OriginalDate.now() + window.clockSkew; }
      };
      window.clockUser = { uid: 'user', getIdToken: async () => 'synthetic-token' };
      document.hasFocus = () => true;
    }, skew);
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        if (url.pathname === '/src/lib/AuthContext.tsx') return route.fulfill({ contentType: 'text/javascript', body:
          'export const useAuth = () => ({ user: window.clockUser, loading: false });' });
        if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'text/javascript', body:
          'export const auth = { get currentUser() { return window.clockUser; } };' });
        return route.continue();
      }
      if (url.origin !== 'http://localhost:8080') return route.abort();
      if (url.pathname === '/health' && healthDelay) await new Promise(resolve => setTimeout(resolve, healthDelay));
      if (url.pathname === '/contests/test' && processingDelay) await new Promise(resolve => setTimeout(resolve, processingDelay));
      const headers = headerMode ? { 'X-Server-Time-Ms': String(Date.now()), ...(headerMode === 'hidden' ? {} : { 'Access-Control-Expose-Headers': 'X-Server-Time-Ms' }) } : {};
      if (url.pathname === '/contests/test' && deliveryDelay) await new Promise(resolve => setTimeout(resolve, deliveryDelay));
      if (url.pathname === '/health') return route.fulfill({ headers, json: { status: 'ok' } });
      if (url.pathname === '/admin/') return route.fulfill({ status: 403, headers, json: { error: 'Not an admin' } });
      if (url.pathname === '/submission/list') return route.fulfill({ headers, json: { submissions: [] } });
      if (url.pathname === '/submission/submit') {
        submissions++;
        return route.fulfill({ status: 503, headers, json: { error: 'Unexpected submission' } });
      }
      if (url.pathname.startsWith('/contests/test/problems')) {
        const problem = { name: 'Clock recovery MCQ', score: 1, type: 'mcq', options: ['First answer', 'Second answer'] };
        return route.fulfill({ headers, json: url.pathname.endsWith('/mcq')
          ? { ...problem, problem_id: 'mcq', contest_id: 'test' } : [{ ...problem, id: 'mcq' }] });
      }
      if (view === 'polling' && url.pathname.endsWith('/leaderboard')) {
        leaderboardCalls++;
        return route.fulfill({ status: 429, headers: { 'Retry-After': new Date(Date.now() + 60000).toUTCString(), 'Access-Control-Expose-Headers': 'Retry-After' }, json: { error: 'Rate limited' } });
      }
      if (view === 'polling' && url.pathname === '/contests/test') return route.fulfill({ status: 503, json: { error: 'Metadata unavailable' } });
      if (url.pathname.endsWith('/session-status')) return route.fulfill({ headers, json: {
        tab_switch_count: 0, is_tab_switch_terminated: false, generation: 0, is_session_ended: false,
      } });
      if (url.pathname === '/contests/test') return route.fulfill({ headers, json: {
        id: 'test', name: 'Server clock contest', description: '', eligible_to: [1], is_registered: true,
        registration_start_time: reference - 120000, registration_end_time: reference + 30000,
        start_time: reference + (phase === 'upcoming' ? 60000 : -120000),
        end_time: reference + (phase === 'ended' ? -60000 : 3600000),
      } });
      return route.abort();
    });
    await page.goto(`${origin}/tests/server-clock.html`);
    await page.waitForFunction(() => window.clockFixture);
    await page.evaluate(async view => {
      const f = window.clockFixture, h = f.React.createElement;
      window.clockRoot = f.createRoot(document.getElementById('root'));
      function Location() { return h('output', { id: 'clock-location' }, f.useLocation().pathname); }
      function Clock() { const now = f.useServerTime(); return h('output', { id: 'clock-now' }, String(now)); }
      const render = node => window.clockRoot.render(h(f.React.StrictMode, null, h(Lifecycle, null, node)));
      function Lifecycle({ children }) { f.React.useEffect(() => f.startServerClockRefresh(), []); return h(f.React.Fragment, null, h(f.ServerClockNotice), children); }
      if (view === 'polling') {
        function Poller() { const result = f.useLeaderboard('test', 50); return h('output', { id: 'polling-error' }, result.error); }
        render(h(f.MemoryRouter, null, h(Poller)));
      } else if (view === 'layout' || view === 'mcq') {
        render(h(f.MemoryRouter, { initialEntries: [view === 'mcq' ? '/contests/test/problems/mcq' : '/contests/test/problems'] },
          h(Location), h(Clock), h(f.Routes, null,
            h(f.Route, { path: '/contests/:contestId', element: h(f.ContestLayout) },
              h(f.Route, { path: 'problems', element: h('p', null, 'Exam workspace') }),
              h(f.Route, { path: 'problems/:problemId', element: h(f.ContestProblemPage) })),
            h(f.Route, { path: '/contest/:contestId', element: h('p', null, 'Contest details') }))));
      } else {
        window.clockContest = await f.contestApi.getContestById('test');
        render(h(f.MemoryRouter, null, h(Clock),
          h(view === 'card' ? f.ContestCard : f.ContestTimeline, { contest: window.clockContest, onClick() {} })));
      }
    }, view);
    return { page, setHeader(value) { headerMode = value; }, setHealthDelay(value) { healthDelay = value; }, setDeliveryDelay(value) { deliveryDelay = value; }, get submissions() { return submissions; }, get leaderboardCalls() { return leaderboardCalls; }, async close() { await page.close(); assert.deepEqual(errors, []); } };
  }

  for (const skew of [4 * 3600000, -4 * 3600000]) {
    test(`${name}: skew ${skew} cannot expire an active exam or unlock an upcoming one`, { timeout: 20000 }, async () => {
      let fixture = await mount({ skew });
      try {
        await fixture.page.getByText('Exam workspace', { exact: true }).waitFor();
        assert.equal(await fixture.page.locator('#clock-location').textContent(), '/contests/test/problems');
        assert.ok(Math.abs(await fixture.page.evaluate(() => clockFixture.getServerTime()) - Date.now()) < 1500);
        await fixture.page.evaluate(() => { window.clockSkew += 12 * 3600000; });
        await fixture.page.waitForTimeout(1100);
        assert.equal(await fixture.page.locator('#clock-location').textContent(), '/contests/test/problems');
        assert.ok(Math.abs(await fixture.page.evaluate(() => clockFixture.getServerTime()) - Date.now()) < 1500);
      } finally { await fixture.close(); }
      fixture = await mount({ skew, phase: 'upcoming', view: 'timeline' });
      try {
        await fixture.page.getByRole('button', { name: 'Already Registered', exact: true }).waitFor();
        assert.equal(await fixture.page.getByRole('button', { name: 'Already Registered', exact: true }).isDisabled(), true);
        assert.equal(await fixture.page.getByRole('button', { name: 'Start Contest', exact: true }).count(), 0);
      } finally { await fixture.close(); }
    });
  }

  test(`${name}: cards use server time and expired exams stay expired on slow clocks`, { timeout: 20000 }, async () => {
    let fixture = await mount({ skew: 4 * 3600000, view: 'card' });
    try { await fixture.page.getByRole('button', { name: 'Enter Contest', exact: true }).waitFor(); }
    finally { await fixture.close(); }
    fixture = await mount({ skew: -4 * 3600000, phase: 'ended', view: 'card' });
    try { await fixture.page.getByRole('button', { name: 'View Problems', exact: true }).waitFor(); }
    finally { await fixture.close(); }
  });

  test(`${name}: a missing first timestamp cannot start proctoring or mark an exam expired`, { timeout: 15000 }, async () => {
    const fixture = await mount({ skew: 4 * 3600000, header: false });
    try {
      await fixture.page.getByText('Loading contest...', { exact: true }).waitFor();
      assert.equal(await fixture.page.locator('#clock-location').textContent(), '/contests/test/problems');
      assert.equal(await fixture.page.locator('dialog[open]').count(), 0);
      assert.equal(await fixture.page.evaluate(() => localStorage.getItem('contest_submitted_test_user')), null);
    } finally { await fixture.close(); }
  });
  test(`${name}: backend processing does not become clock lead`, { timeout: 15000 }, async () => {
    const fixture = await mount({ skew: 0, view: 'card', processingDelay: 1800 });
    try {
      const now = await fixture.page.evaluate(() => clockFixture.getServerTime());
      assert.ok(now <= Date.now() + 100, 'processing must not add half the request duration');
    } finally { await fixture.close(); }
  });

  test(`${name}: slow delivery cannot replace a healthy clock`, { timeout: 15000 }, async () => {
    const fixture = await mount({ skew: 0, view: 'card' });
    try {
      await fixture.page.getByRole('button', { name: 'Enter Contest', exact: true }).waitFor();
      await fixture.page.waitForLoadState('networkidle');
      fixture.setDeliveryDelay(3000);
      await fixture.page.evaluate(() => clockFixture.contestApi.getContestById('test'));
      assert.ok(Math.abs(await fixture.page.evaluate(() => clockFixture.getServerTime()) - Date.now()) < 300,
        'a response delivered three seconds after commitment must not roll back healthy UTC');
    } finally { await fixture.close(); }
  });

  test(`${name}: focus recovery preserves an unsubmitted MCQ answer and blocks interaction`, { timeout: 20000 }, async () => {
    const fixture = await mount({ skew: 0, view: 'mcq' });
    const page = fixture.page;
    try {
      await page.getByRole('button', { name: /Enter fullscreen|Continue demo without fullscreen/ }).click();
      const answer = page.locator('#option-0');
      await answer.check();
      await page.getByRole('button', { name: 'Submit Answer', exact: true }).waitFor();
      await answer.evaluate(node => { window.selectedAnswerNode = node; });
      const otherAnswer = await page.locator('#option-1').boundingBox();
      fixture.setHealthDelay(500);
      await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      });
      await page.waitForFunction(() => clockFixture.getServerClockStatus() === 'recovering');
      assert.equal(await page.getByText('Loading contest...', { exact: true }).count(), 0);
      assert.equal(await answer.count(), 1, 'the selected radio must stay mounted');
      assert.equal(await answer.isChecked(), true);
      assert.equal(await answer.evaluate(node => Boolean(node.closest('[inert]'))), true);
      assert.equal(await page.locator('button').filter({ hasText: /^Submit Answer$/ }).count(), 0, 'submission callback is unavailable until UTC is trusted');
      await page.mouse.click(otherAnswer.x + otherAnswer.width / 2, otherAnswer.y + otherAnswer.height / 2);
      await page.evaluate(() => document.getElementById('option-1').focus());
      await page.keyboard.press('Space');
      assert.equal(await answer.isChecked(), true, 'keyboard input cannot change the answer during recovery');
      assert.equal(fixture.submissions, 0);
      await page.waitForFunction(() => clockFixture.getServerClockStatus() === 'synced');
      await page.waitForFunction(() => !document.querySelector('.contest-screen [inert]'));
      await page.getByRole('button', { name: 'Submit Answer', exact: true }).waitFor();
      assert.equal(await answer.evaluate(node => node === window.selectedAnswerNode), true, 'recovery must retain the same MCQ instance');
      assert.equal(await answer.isChecked(), true);

      fixture.setHeader(false);
      fixture.setHealthDelay(0);
      await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      });
      await page.getByRole('button', { name: 'Retry time sync', exact: true }).waitFor();
      assert.equal(await answer.evaluate(node => node === window.selectedAnswerNode && Boolean(node.closest('[inert]'))), true);
      assert.equal(await answer.isChecked(), true, 'bounded recovery failure also preserves the answer');
      fixture.setHeader(true);
      await page.getByRole('button', { name: 'Retry time sync', exact: true }).click();
      await page.waitForFunction(() => clockFixture.getServerClockStatus() === 'synced');
      await page.getByRole('button', { name: 'Submit Answer', exact: true }).waitFor();
      assert.equal(await answer.isChecked(), true, 'manual calibration retry restores the same answer');
      assert.equal(fixture.submissions, 0);
    } finally { await fixture.close(); }
  });

  test(`${name}: slow resume recovers an untrusted suspended clock`, { timeout: 15000 }, async () => {
    const fixture = await mount({ skew: 0 });
    try {
      await fixture.page.getByText('Exam workspace', { exact: true }).waitFor();
      fixture.setHealthDelay(2500);
      await fixture.page.evaluate(() => {
        clockFixture.syncServerClock(String(Date.now() - 3600000), performance.now());
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await fixture.page.waitForFunction(() => clockFixture.getServerClockStatus() === 'recovering');
      assert.equal(await fixture.page.locator('dialog[open]').count(), 0);
      await fixture.page.waitForFunction(() => clockFixture.getServerClockStatus() === 'synced');
      assert.ok(Math.abs(await fixture.page.evaluate(() => clockFixture.getServerTime()) - Date.now()) < 200);
      assert.equal(await fixture.page.locator('#clock-location').textContent(), '/contests/test/problems');
    } finally { await fixture.close(); }
  });

  for (const header of [false, 'hidden']) {
    test(`${name}: missing/hidden time (${header}) offers retry and recovers`, { timeout: 15000 }, async () => {
      const fixture = await mount({ skew: 4 * 3600000, header });
      try {
        await fixture.page.getByRole('button', { name: 'Retry time sync', exact: true }).waitFor();
        assert.equal(await fixture.page.evaluate(() => clockFixture.getServerClockStatus()), 'error');
        assert.equal(await fixture.page.locator('dialog[open]').count(), 0);
        fixture.setHeader(true);
        await fixture.page.getByRole('button', { name: 'Retry time sync', exact: true }).click();
        await fixture.page.getByText('Exam workspace', { exact: true }).waitFor();
        assert.equal(await fixture.page.evaluate(() => clockFixture.getServerClockStatus()), 'synced');
      } finally { await fixture.close(); }
    });
  }

  test(`${name}: unknown UTC cannot automatically retry before an absolute Retry-After date`, { timeout: 15000 }, async () => {
    const fixture = await mount({ skew: 4 * 3600000, header: false, view: 'polling' });
    try {
      await fixture.page.locator('#polling-error').filter({ hasText: /Rate limited|Metadata unavailable/ }).waitFor();
      const count = fixture.leaderboardCalls;
      await fixture.page.waitForTimeout(1300);
      assert.equal(fixture.leaderboardCalls, count);
    } finally { await fixture.close(); }
  });

}
