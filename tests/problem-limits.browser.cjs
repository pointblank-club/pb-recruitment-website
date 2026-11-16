const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:5173';

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  let browser;
  before(async () => { browser = await engine.launch({ headless: true }); });
  after(async () => { await browser?.close(); });

  async function mount(view = 'manager', responseMode = 'persisted') {
    const page = await browser.newPage();
    const writes = [], errors = [];
    const problems = [
      { id: 'code', type: 'code', name: 'Code sample', description: 'Code question', score: 10,
        time_limit: 2500, memory_limit: 384, testcases: [{ input: '1', expected_output: '1', is_sample: true }] },
      { id: 'mcq', type: 'mcq', name: 'MCQ sample', description: 'MCQ question', score: 1,
        answer: [0], options: ['First', 'Second'], time_limit: 9999, memory_limit: 499 },
    ];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'text/javascript', body:
          'export const auth = { currentUser: { uid: "admin", getIdToken: async () => "fixture-token" } };' });
        if (url.pathname === '/src/lib/AuthContext.tsx') return route.fulfill({ contentType: 'text/javascript', body:
          'export const useAuth = () => ({ user: { uid: "admin" }, loading: false });' });
        return route.continue();
      }
      if (url.origin !== 'http://localhost:8080') return route.abort();
      const id = url.pathname.split('/').at(-1);
      if (url.pathname === '/admin/') return route.fulfill({ status: 403, json: { error: 'Not an admin' } });
      if (url.pathname === '/submission/list') return route.fulfill({ json: { submissions: [] } });
      const responseProblem = problem => {
        const saved = { ...problem };
        if (saved.type === 'code' && responseMode === 'missing') {
          delete saved.time_limit;
          delete saved.memory_limit;
        } else if (saved.type === 'code' && responseMode === 'null') {
          saved.time_limit = saved.memory_limit = null;
        }
        return saved;
      };
      if (request.method() === 'GET') {
        if (id === 'problems') return route.fulfill({ json: problems.map(responseProblem) });
        const problem = responseProblem(problems.find(problem => problem.id === id));
        return route.fulfill({ json: { ...problem, problem_id: id, contest_id: 'contest' } });
      }
      writes.push(request.postDataJSON());
      const saved = { ...writes.at(-1), id: id === 'problem' ? 'created' : id, name: writes.at(-1).name + ' (saved)' };
      if (saved.type === 'code') {
        if (responseMode === 'defaults') { saved.time_limit = 1000; saved.memory_limit = 256; }
        if (responseMode === 'time-mismatch') saved.time_limit = 1000;
        if (responseMode === 'memory-mismatch') saved.memory_limit = 256;
      }
      const index = problems.findIndex(problem => problem.id === saved.id);
      if (index < 0) problems.push(saved);
      else problems[index] = saved;
      return route.fulfill({ json: responseProblem(saved) });
    });
    await page.goto(`${origin}/tests/problem-limits.html`);
    await page.waitForFunction(() => window.problemLimitsFixture);
    await page.evaluate(async view => {
      const f = window.problemLimitsFixture, h = f.React.createElement;
      window.saved = [];
      const problems = view === 'manager' ? await f.adminApi.getContestProblems('contest') : [];
      const child = view === 'manager'
        ? h(f.ProblemManager, { contestId: 'contest', problems, onProblemSaved: problem => window.saved.push(problem), onProblemDeleted() {} })
        : h(f.Routes, null, h(f.Route, {
          element: h(f.Outlet, { context: { isContestEnded: true, isAuthenticated: false, isRegistered: false } }),
        }, h(f.Route, { path: '/contests/:contestId/problems/:problemId', element: h(f.ContestProblemPage) })));
      f.createRoot(document.getElementById('root')).render(h(f.React.StrictMode, null,
        h(f.MemoryRouter, { initialEntries: [`/contests/contest/problems/${view}`] }, child)));
    }, view);
    return { page, writes, async close() { await page.close(); assert.deepEqual(errors, []); } };
  }

  test(`${name}: coding edits restore custom limits; MCQs omit controls and payload fields`, async () => {
    const fixture = await mount();
    const { page, writes } = fixture;
    try {
      await page.getByRole('button', { name: 'Edit', exact: true }).nth(0).click();
      const time = page.getByLabel('Time Limit (ms)', { exact: true });
      const memory = page.getByLabel('Memory Limit (MiB)', { exact: true });
      assert.equal(await time.inputValue(), '2500');
      assert.equal(await memory.inputValue(), '384');
      await time.fill('0');
      assert.equal(await time.evaluate(node => node.checkValidity()), false);
      await time.fill('4500');
      await memory.fill('400');
      await page.getByRole('button', { name: 'Update Problem', exact: true }).click();
      await page.waitForFunction(() => window.saved.length === 1);
      assert.equal(writes[0].time_limit, 4500);
      assert.equal(writes[0].memory_limit, 400);
      assert.equal(await page.evaluate(() => window.saved[0].time_limit), 4500);
      assert.equal(await page.evaluate(() => window.saved[0].name), 'Code sample (saved)', 'the callback receives the saved response');
      await page.getByRole('button', { name: 'Edit', exact: true }).nth(0).click();
      assert.equal(await time.inputValue(), '4500');
      assert.equal(await memory.inputValue(), '400');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
      await page.getByRole('heading', { name: 'Edit Problem', exact: true }).waitFor();
      assert.equal(await time.count(), 0);
      assert.equal(await memory.count(), 0);
      await page.getByRole('button', { name: 'Update Problem', exact: true }).click();
      await page.waitForFunction(() => window.saved.length === 2);
      assert.equal(writes[1].type, 'mcq');
      assert.equal('time_limit' in writes[1], false);
      assert.equal('memory_limit' in writes[1], false);
      assert.equal(await page.evaluate(() => 'time_limit' in window.saved[1] || 'memory_limit' in window.saved[1]), false);
    } finally { await fixture.close(); }
  });

  for (const responseMode of ['missing', 'null', 'defaults', 'time-mismatch', 'memory-mismatch']) {
    test(`${name}: ${responseMode} coding write responses keep edits open and never report success`, async () => {
      const fixture = await mount('manager', responseMode);
      const { page } = fixture;
      try {
        await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
        const time = page.getByLabel('Time Limit (ms)', { exact: true });
        const memory = page.getByLabel('Memory Limit (MiB)', { exact: true });
        if (responseMode === 'missing' || responseMode === 'null') {
          assert.equal(await time.inputValue(), '1000');
          assert.equal(await memory.inputValue(), '256');
          assert.equal(await page.evaluate(async mode => {
            const problem = await problemLimitsFixture.adminApi.getProblemById('contest', 'code');
            return mode === 'missing'
              ? problem.time_limit === undefined && problem.memory_limit === undefined
              : problem.time_limit === null && problem.memory_limit === null;
          }, responseMode), true, 'normalization must preserve unsupported fields');
        }
        await time.fill('6000');
        await memory.fill('400');
        await page.getByRole('button', { name: 'Update Problem', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'The backend did not confirm' }).waitFor();
        assert.equal(await page.evaluate(() => window.saved.length), 0);
        assert.equal(await time.inputValue(), '6000');
        assert.equal(await memory.inputValue(), '400');
      } finally { await fixture.close(); }
    });
  }

  for (const responseMode of ['persisted', 'missing', 'null']) {
    test(`${name}: coding creates require persisted limits even when defaults were submitted (${responseMode})`, async () => {
      const fixture = await mount('manager', responseMode);
      const { page } = fixture;
      try {
        await page.getByRole('button', { name: '+ Add Problem', exact: true }).click();
        await page.locator('input[name="title"]').fill('New problem');
        await page.locator('#problem-description').fill('New description');
        await page.getByRole('button', { name: 'Create Problem', exact: true }).click();
        if (responseMode === 'persisted') {
          await page.waitForFunction(() => window.saved.length === 1);
          assert.equal(await page.evaluate(() => window.saved[0].time_limit), 1000);
          assert.equal(await page.evaluate(() => window.saved[0].memory_limit), 256);
        } else {
          await page.getByRole('alert').filter({ hasText: 'The backend did not confirm' }).waitFor();
          assert.equal(await page.evaluate(() => window.saved.length), 0);
          assert.equal(await page.getByRole('button', { name: 'Create Problem', exact: true }).isVisible(), true);
        }
      } finally { await fixture.close(); }
    });
  }

  test(`${name}: switching the create form to MCQ hides coding limits`, async () => {
    const fixture = await mount();
    const { page } = fixture;
    try {
      await page.getByRole('button', { name: '+ Add Problem', exact: true }).click();
      assert.equal(await page.getByLabel('Time Limit (ms)', { exact: true }).inputValue(), '1000');
      assert.equal(await page.getByLabel('Memory Limit (MiB)', { exact: true }).inputValue(), '256');
      await page.locator('select').first().selectOption('mcq');
      assert.equal(await page.getByLabel('Time Limit (ms)', { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Memory Limit (MiB)', { exact: true }).count(), 0);
    } finally { await fixture.close(); }
  });

  test(`${name}: participants see limits only on coding questions`, async () => {
    let fixture = await mount('code');
    try {
      await fixture.page.getByText('Time Limit: 2500 ms', { exact: true }).waitFor();
      await fixture.page.getByText('Memory Limit: 384 MiB', { exact: true }).waitFor();
    } finally { await fixture.close(); }
    fixture = await mount('mcq');
    try {
      await fixture.page.getByRole('heading', { name: 'MCQ sample', exact: true }).waitFor();
      assert.doesNotMatch(await fixture.page.locator('body').innerText(), /Time Limit|Memory Limit/);
    } finally { await fixture.close(); }
  });
}
