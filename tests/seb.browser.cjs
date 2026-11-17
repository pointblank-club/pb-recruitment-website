const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { before, after, test } = require('node:test');
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:5173';
const api = 'http://localhost:8080';

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  let browser;
  before(async () => { browser = await engine.launch({ headless: true }); });
  after(async () => { await browser?.close(); });

  async function fixture({ seb = true, drop = false, cookies = true } = {}) {
    const context = await browser.newContext({ userAgent: seb ? 'Mozilla/5.0 SEB/3.9.0' : 'Mozilla/5.0 Chrome/139.0' });
    const sessions = new Map(), errors = [];
    let flagged = false, locked = false, dropNext = drop, generation = 0, submissions = 0, resets = 0, admissionGate, statusGate, resetGate, statusReads = 0, starts = 0, ended = false, tabTerminated = false, dropStatus = false;
    const cookieName = '__Host-pb-exam-' + createHash('sha256').update('test\0participant').digest('hex').slice(0, 24);
    const count = () => [...sessions.values()].filter(session => session.generation === generation).length;
    await context.addInitScript(() => {
      document.hasFocus = () => true;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
      window.sebUser = { uid: 'participant', email: 'participant@example.test', getIdToken: async () => 'test-token' };
    });
    const contest = () => ({ id: 'test', name: 'SEB exam', description: '', is_registered: true, eligible_to: [1],
      registration_start_time: Date.now() - 120000, registration_end_time: Date.now() - 60000,
      start_time: Date.now() - 60000, end_time: Date.now() + 3600000 });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/src/lib/AuthContext.tsx') return route.fulfill({ contentType: 'text/javascript', body:
          `export const useAuth = () => ({ user: window.sebFixture.React.useSyncExternalStore(callback => {
              window.addEventListener('seb-auth-change', callback);
              return () => window.removeEventListener('seb-auth-change', callback);
            }, () => window.sebUser), loading: false });` });
        if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'text/javascript', body:
          'export const auth = { get currentUser() { return window.sebUser; } };' });
        return route.continue();
      }
      if (url.origin !== api) return route.abort();
      const requestHeaders = await request.allHeaders();
      const headers = { 'X-Server-Time-Ms': String(Date.now()), 'Access-Control-Expose-Headers': 'X-Server-Time-Ms',
        'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' };
      const fulfill = json => route.fulfill({ headers, json });
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': requestHeaders['access-control-request-headers'] || '*' } });
      if (url.pathname === '/health') return fulfill({ status: 'ok' });
      if (url.pathname === '/admin/') return route.fulfill({ status: 403, headers, json: { error: 'Not an admin' } });
      if (url.pathname === '/contests/test' || url.pathname === '/admin/contest/test') return fulfill(contest());
      if (url.pathname.endsWith('/reset-browser-sessions')) {
        generation++; locked = false; resets++;
        if (resetGate) await resetGate;
        return fulfill({ generation });
      }
      if (url.pathname === '/admin/contests/test/registrations') return fulfill([{
        user_id: 'participant', name: 'Participant', email: 'participant@example.test', registered_at: 1,
        score: 0, hidden: false, disqualified: false, seb_not_detected: flagged, browser_session_count: count(), browser_session_generation: generation,
        is_browser_session_terminated: locked,
      }]);
      if (url.pathname === '/contests/test/browser-session') {
        starts++;
        const body = request.postDataJSON();
        if (admissionGate) await admissionGate;
        if (body.generation !== generation) return route.fulfill({ status: 409, headers, json: { code: 'BROWSER_SESSION_STALE', generation } });
        if (ended) return route.fulfill({ status: 403, headers, json: { code: 'BROWSER_SESSION_FORBIDDEN', error: 'Contest session already ended' } });
        const detected = /(?:^|[\s;(])SEB\/\d+(?:\.\d+)*(?:$|[\s;)])/i.test(requestHeaders['user-agent'] || '');
        flagged ||= !detected;
        const token = (requestHeaders.cookie || '').split('; ').find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
        let session = [...sessions.values()].find(saved => saved.token === token && saved.generation === generation);
        const confirmed = Boolean(session);
        if (tabTerminated && detected && !session) return route.fulfill({ status: 403, headers, json: { code: 'BROWSER_SESSION_FORBIDDEN', error: 'Contest participation terminated due to tab switching' } });
        if (confirmed) session.confirmed = true;
        if (detected && !session && !locked) {
          const attempt = `${generation}:${body.attempt_id}`;
          session = sessions.get(attempt);
          if (session?.confirmed) return route.fulfill({ status: 409, headers, json: { code: 'BROWSER_SESSION_CONFLICT', error: 'Startup already confirmed' } });
          if (!session) {
            if (count() >= 3) locked = true;
            else { session = { token: randomUUID(), generation, confirmed: false, user: 'participant', contest: 'test' }; sessions.set(attempt, session); }
          }
        }
        if (dropNext) { dropNext = false; return route.abort(); }
        if (detected && cookies && session && !locked) headers['Set-Cookie'] = `${cookieName}=${session.token}; Path=/; Secure; HttpOnly; SameSite=None`;
        return fulfill({ is_seb: detected, generation, session_count: count(), seb_not_detected: flagged, is_terminated: locked, cookie_confirmed: confirmed });
      }
      if (url.pathname.endsWith('/session-status')) {
        statusReads++;
        if (statusGate) await statusGate;
        if (dropStatus) { dropStatus = false; return route.abort(); }
        return fulfill({ tab_switch_count: tabTerminated ? 5 : 0, is_tab_switch_terminated: tabTerminated, generation: 0,
          is_session_ended: ended, seb_not_detected: flagged, browser_session_count: count(), browser_session_generation: generation, is_browser_session_terminated: locked });
      }
      if (url.pathname === '/submission/list') return fulfill({ submissions: [] });
      if (url.pathname === '/submission/submit') { submissions++; return route.fulfill({ status: locked ? 403 : 503, headers, json: { error: 'Fixture submission' } }); }
      if (url.pathname.startsWith('/contests/test/problems')) {
        if (ended) return route.fulfill({ status: 403, headers, json: { error: 'Contest session already ended' } });
        if (locked) return route.fulfill({ status: 403, headers, json: { error: 'Browser session limit', code: 'BROWSER_SESSION_LIMIT' } });
        const token = (requestHeaders.cookie || '').split('; ').find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
        if (/SEB\//i.test(requestHeaders['user-agent'] || '') && ![...sessions.values()].some(session => session.token === token && session.generation === generation)) {
          return route.fulfill({ status: 428, headers, json: { error: 'Start your browser exam session before participating', code: 'BROWSER_SESSION_REQUIRED' } });
        }
        const session = [...sessions.values()].find(session => session.token === token && session.generation === generation);
        if (session) session.confirmed = true;
        const problem = { id: 'mcq', problem_id: 'mcq', contest_id: 'test', name: 'SEB question', type: 'mcq', score: 1, options: ['First answer', 'Second answer'] };
        return fulfill(url.pathname.endsWith('/mcq') ? problem : [problem]);
      }
      return route.abort();
    });
    async function open(view = 'exam') {
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/tests/seb.html?view=${view}`);
      await mount(page, view);
      return page;
    }
    async function mount(page, view = 'exam') {
      await page.waitForFunction(() => window.sebFixture);
      await page.evaluate(view => {
        const f = window.sebFixture, h = f.React.createElement;
        function Lifecycle({ children }) { f.React.useEffect(() => f.startServerClockRefresh(), []); return children; }
        const child = view === 'admin'
          ? h(f.Routes, null, h(f.Route, { path: '/admin/contest/:contestId/contestants', element: h(f.AdminContestContestants) }))
          : h(f.Routes, null, h(f.Route, { path: '/contests/:contestId', element: h(f.ContestLayout) },
            h(f.Route, { path: 'problems', element: h(f.ContestProblemsPage) }),
            h(f.Route, { path: 'problems/:problemId', element: h(f.ContestProblemPage) }),
            h(f.Route, { path: 'leaderboard', element: h('p', null, 'Leaderboard view') })),
            h(f.Route, { path: '/contest/:contestId', element: h('p', null, 'Contest details') }));
        f.createRoot(document.getElementById('root')).render(h(f.React.StrictMode, null, h(Lifecycle, null,
          h(f.MemoryRouter, { initialEntries: [view === 'admin' ? '/admin/contest/test/contestants' : '/contests/test/problems/mcq'] }, child))));
      }, view);
    }
    async function enter(page) {
      await page.getByRole('button', { name: /Enter fullscreen|Continue demo without fullscreen/ }).click();
      await page.locator('#option-0').waitFor();
    }
    return { context, open, enter, mount, dropNext() { dropStatus = true; },
      setTerminal(value) { ended = value === 'ended'; tabTerminated = value === 'tab'; },
      get starts() { return starts; }, get statusReads() { return statusReads; },
      holdStatus() {
        let resume;
        statusGate = new Promise(resolve => { resume = resolve; });
        return () => { statusGate = undefined; resume(); };
      },
      holdReset() {
        let resume;
        resetGate = new Promise(resolve => { resume = resolve; });
        return () => { resetGate = undefined; resume(); };
      },
      holdAdmissions() {
        let resume;
        admissionGate = new Promise(resolve => { resume = resolve; });
        return () => { admissionGate = undefined; resume(); };
      },
      get count() { return count(); }, get resets() { return resets; }, get flagged() { return flagged; }, get submissions() { return submissions; },
      async close() { await context.close(); assert.deepEqual(errors, []); } };
  }

  test(`${name}: SEB navigation and concurrent tabs share one HttpOnly cookie session`, { timeout: 20000 }, async () => {
    const f = await fixture();
    try {
      const [first, second] = await Promise.all([f.open(), f.open()]);
      await Promise.all([f.enter(first), f.enter(second)]);
      assert.equal(f.count, 1);
      assert.equal(f.flagged, false);
      const cookie = (await f.context.cookies(api)).find(cookie => cookie.name.startsWith('__Host-pb-exam-'));
      assert.equal(cookie.httpOnly, true);
      assert.equal(cookie.secure, true);
      await first.getByRole('link', { name: 'Leaderboard', exact: true }).click();
      await first.getByText('Leaderboard view', { exact: true }).waitFor();
      assert.equal(f.count, 1);
      const initialStarts = f.starts;
      const resume = f.holdStatus();
      try {
        const checking = first.waitForRequest(request => request.url() === `${api}/contests/test/session-status`);
        await first.getByRole('link', { name: 'Problems', exact: true }).click();
        await checking;
        assert.equal(await first.locator('#browser-session-status').count(), 0, 'navigation rechecks the session without a popup');
        await first.getByRole('link', { name: /SEB question/ }).click();
        await first.locator('#option-0').check();
        await first.locator('#option-0').focus();
        assert.equal(await first.locator('#option-0').evaluate(node => Boolean(node.closest('[inert]'))), false, 'answers remain usable while verification is pending');
      } finally { resume(); }
      await first.evaluate(() => window.dispatchEvent(new Event('online')));
      assert.equal(f.starts, initialStarts, 'navigation and reconnect reuse the accepted cookie without startup POSTs');
      assert.equal(await first.locator('#option-0').isChecked(), true);
      assert.equal(await first.locator('#option-0').evaluate(node => node === document.activeElement), true, 'background verification does not steal focus');
      assert.equal(f.count, 1);
    } finally { await f.close(); }
  });

  test(`${name}: ordinary browsers are flagged in the admin route and can still answer`, { timeout: 20000 }, async () => {
    const f = await fixture({ seb: false, cookies: false });
    try {
      const page = await f.open(); await f.enter(page);
      await page.locator('#option-0').check();
      assert.equal(await page.getByRole('button', { name: 'Submit Answer', exact: true }).isEnabled(), true);
      assert.equal(f.flagged, true);
      const admin = await f.open('admin');
      await admin.getByText('Flagged: SEB not detected', { exact: true }).waitFor();
      await admin.getByText('0 / 3 sessions', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await admin.getByText('Active', { exact: true }).count() > 0, true);
    } finally { await f.close(); }
  });

  test(`${name}: a fourth cookie session locks participation and preserves mounted answers`, { timeout: 25000 }, async () => {
    const f = await fixture();
    try {
      const original = await f.open(); await f.enter(original); await original.locator('#option-0').check();
      for (const expected of [2, 3]) {
        await f.context.clearCookies();
        const page = await f.open(); await f.enter(page);
        assert.equal(f.count, expected);
        await page.close();
      }
      await f.context.clearCookies();
      const fourth = await f.open();
      await fourth.getByRole('alert').filter({ hasText: 'Maximum three exam browser sessions reached' }).waitFor();
      assert.equal(f.count, 3);
      assert.equal(await fourth.locator('#option-0').count(), 0);
      await original.evaluate(() => window.dispatchEvent(new Event('online')));
      await original.getByRole('alert').filter({ hasText: 'Maximum three exam browser sessions reached' }).waitFor();
      assert.equal(await original.locator('#option-0').isChecked(), true);
      assert.equal(await original.locator('#option-0').evaluate(node => Boolean(node.closest('[inert]'))), true);
      assert.equal(f.submissions, 0);
    } finally { await f.close(); }
  });

  test(`${name}: lost startup responses retry without consuming another session`, { timeout: 20000 }, async () => {
    const f = await fixture({ drop: true });
    try {
      const lost = f.context.waitForEvent('requestfailed', request => request.url().endsWith('/browser-session'));
      const page = await f.open();
      await lost;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await f.enter(page);
      assert.equal(f.count, 1);
      assert.equal(f.flagged, false);
    } finally { await f.close(); }
  });

  test(`${name}: failed background status reads preserve the mounted answer and focus`, { timeout: 20000 }, async () => {
    const f = await fixture();
    try {
      const page = await f.open(); await f.enter(page);
      const answer = page.locator('#option-0');
      await answer.check(); await answer.focus();
      await answer.evaluate(node => { window.originalAnswer = node; });
      f.dropNext();
      const read = page.waitForRequest(request => request.url().endsWith('/session-status'));
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await read;
      assert.equal(await answer.isChecked(), true);
      assert.equal(await answer.evaluate(node => node === window.originalAnswer && !node.closest('[inert]')), true);
      assert.equal(await page.locator('#browser-session-status').count(), 0);
      assert.equal(await answer.evaluate(node => node === document.activeElement), true);
      assert.equal(f.count, 1);
    } finally { await f.close(); }
  });

  for (const terminal of ['ended', 'tab']) {
    test(`${name}: ${terminal} status reconciles while browser startup is forbidden`, { timeout: 15000 }, async () => {
      const f = await fixture();
      const resume = f.holdStatus();
      try {
        f.setTerminal(terminal);
        const read = f.context.waitForEvent('request', request => request.url().endsWith('/session-status'));
        const page = await f.open();
        await read;
        await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Retry exam session' && !button.disabled));
        assert.ok(f.statusReads > 0, 'browser blocking does not stop authoritative status requests');
        resume();
        if (terminal === 'ended') await page.getByText('Contest details', { exact: true }).waitFor();
        else await page.getByRole('alert').filter({ hasText: 'Session Locked' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Retry exam session', exact: true }).count(), 0);
        assert.equal(f.count, 0);
      } finally { resume(); await f.close(); }
    });
  }

  test(`${name}: reset cannot dispatch after the admin account changes during token lookup`, { timeout: 15000 }, async () => {
    const f = await fixture();
    try {
      const participant = await f.open(); await f.enter(participant);
      const admin = await f.open('admin'); admin.on('dialog', dialog => dialog.accept());
      await admin.getByRole('button', { name: 'Reset Browser Sessions', exact: true }).waitFor();
      await admin.evaluate(() => { window.sebUser.getIdToken = () => new Promise(resolve => { window.releaseAdminToken = resolve; }); });
      await admin.getByRole('button', { name: 'Reset Browser Sessions', exact: true }).click();
      await admin.waitForFunction(() => window.releaseAdminToken);
      await admin.evaluate(() => {
        window.sebUser = { uid: 'another-admin', getIdToken: async () => 'another-token' };
        window.dispatchEvent(new Event('seb-auth-change'));
        window.releaseAdminToken('old-admin-token');
      });
      await admin.getByRole('button', { name: 'Reset Browser Sessions', exact: true }).waitFor({ state: 'visible' });
      assert.equal(f.resets, 0);
      assert.equal(f.count, 1);
    } finally { await f.close(); }
  });

  test(`${name}: blocked cookies explain the problem without exhausting the allowance`, { timeout: 20000 }, async () => {
    const f = await fixture({ cookies: false });
    try {
      const page = await f.open();
      await page.getByRole('status').filter({ hasText: 'cookie could not be confirmed' }).waitFor();
      await page.getByRole('button', { name: 'Retry exam session', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'cookie could not be confirmed' }).waitFor();
      assert.equal(f.count, 1);
      assert.equal(f.flagged, false);
    } finally { await f.close(); }
  });

  test(`${name}: cancelling a protected read stops cookie confirmation`, { timeout: 15000 }, async () => {
    const f = await fixture({ cookies: false });
    const resume = f.holdAdmissions();
    try {
      const page = await f.open('admin');
      const checking = page.waitForRequest(request => request.url().endsWith('/browser-session'));
      await page.evaluate(async () => {
        const { contestApi } = await import('/src/services/api/contestApi.ts');
        window.readController = new AbortController();
        window.readOutcome = undefined;
        void contestApi.getContestProblems('test', window.readController.signal).catch(error => { window.readOutcome = error.code; });
      });
      await checking;
      await page.evaluate(() => window.readController.abort());
      await page.waitForFunction(() => window.readOutcome === 'ERR_CANCELED');
      resume();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(f.starts, 1, 'cancellation does not dispatch the remaining confirmation attempts');
    } finally { resume(); await f.close(); }
  });

  test(`${name}: a reset response cannot update another admin account's screen`, { timeout: 15000 }, async () => {
    const f = await fixture();
    const resume = f.holdReset();
    try {
      const participant = await f.open(); await f.enter(participant);
      const admin = await f.open('admin'); admin.on('dialog', dialog => dialog.accept());
      const dispatched = admin.waitForRequest(request => request.url().endsWith('/reset-browser-sessions'));
      await admin.getByRole('button', { name: 'Reset Browser Sessions', exact: true }).click();
      await dispatched;
      await admin.evaluate(() => {
        window.sebUser = { uid: 'another-admin', getIdToken: async () => 'another-token' };
        window.dispatchEvent(new Event('seb-auth-change'));
      });
      const response = admin.waitForResponse(response => response.url().endsWith('/reset-browser-sessions'));
      resume(); await response;
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await admin.getByText('1 / 3 sessions', { exact: true }).isVisible(), true);
      assert.equal(f.resets, 1, 'the already-dispatched reset is audited once');
    } finally { resume(); await f.close(); }
  });

  test(`${name}: admins reset the session lock and the existing browser resumes as session 1`, { timeout: 25000 }, async () => {
    const f = await fixture();
    try {
      const page = await f.open(); await f.enter(page); await page.locator('#option-0').check();
      for (let i = 0; i < 3; i++) {
        await f.context.clearCookies();
        const other = await f.open();
        if (i < 2) await f.enter(other);
        else await other.getByRole('alert').filter({ hasText: 'Maximum three exam browser sessions reached' }).waitFor();
        await other.close();
      }
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.getByRole('alert').filter({ hasText: 'Maximum three exam browser sessions reached' }).waitFor();
      const admin = await f.open('admin');
      admin.on('dialog', dialog => dialog.accept());
      await admin.getByRole('button', { name: 'Reset Browser Sessions', exact: true }).click();
      await admin.getByText('Not observed', { exact: true }).waitFor();
      await admin.getByText('0 / 3 sessions', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(f.resets, 1);
      const resumed = page.waitForResponse(response => response.url().endsWith('/browser-session') && response.status() === 200);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await resumed;
      await page.waitForFunction(() => !document.querySelector('.contest-screen [inert]'));
      assert.equal(f.count, 1);
      assert.equal(await page.locator('#option-0').isChecked(), true);
      assert.equal(f.submissions, 0);
    } finally { await f.close(); }
  });

  test(`${name}: returning from leaderboard recovers an admin reset in the background`, { timeout: 15000 }, async () => {
    const f = await fixture();
    try {
      const page = await f.open(); await f.enter(page);
      await page.getByRole('link', { name: 'Leaderboard', exact: true }).click();
      await page.getByText('Leaderboard view', { exact: true }).waitFor();
      const admin = await f.open('admin');
      admin.on('dialog', dialog => dialog.accept());
      await admin.getByRole('button', { name: 'Reset Browser Sessions', exact: true }).click();
      await admin.getByText('Not observed', { exact: true }).waitFor();
      await admin.getByText('0 / 3 sessions', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(f.count, 0, 'leaderboard viewing does not consume the reset allowance');
      const resume = f.holdAdmissions();
      try {
        const checking = page.waitForRequest(request => request.url() === `${api}/contests/test/browser-session`);
        const missingCookie = page.waitForResponse(response => response.status() === 428 && response.url().includes('/problems')).catch(() => undefined);
        await page.getByRole('link', { name: 'Problems', exact: true }).click();
        await checking;
        assert.equal(await page.locator('#browser-session-status').count(), 0, 'reset reconciliation does not show a verification popup');
        assert.equal(await page.locator('.contest-screen [inert]').count(), 0, 'navigation remains available while the reset is reconciled');
        assert.ok(await missingCookie, 'protected reads detect the old-generation cookie');
      } finally { resume(); }
      await page.getByRole('link', { name: /SEB question/ }).click();
      await page.locator('#option-0').waitFor();
      assert.equal(f.count, 1);
      assert.equal(await page.locator('dialog[open]').count(), 0, 'navigation does not require another entry confirmation');
    } finally { await f.close(); }
  });
}
