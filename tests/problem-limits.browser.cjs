const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:5173';

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  let browser;
  before(async () => { browser = await engine.launch({ headless: true }); });
  after(async () => { await browser?.close(); });

  async function mount(view = 'manager') {
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
      if (request.method() === 'GET') return route.fulfill({ json: problems.find(problem => problem.id === id) });
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { ...writes.at(-1), id: id === 'problem' ? 'created' : id } });
    });
    await page.goto(`${origin}/tests/problem-limits.html`);
    await page.waitForFunction(() => window.problemLimitsFixture);
    await page.evaluate(({ view, problems }) => {
      const f = window.problemLimitsFixture, h = f.React.createElement;
      window.saved = [];
      const child = view === 'manager'
        ? h(f.ProblemManager, { contestId: 'contest', problems, onProblemSaved: problem => window.saved.push(problem), onProblemDeleted() {} })
        : view === 'code'
          ? h(f.ProblemStatementTab, { problem: problems[0], copiedId: null, onCopy() {}, onLoadSample() {} })
          : h(f.MCQProblemView, { problem: problems[1], onSubmit: async () => {} });
      f.createRoot(document.getElementById('root')).render(h(f.React.StrictMode, null, h(f.MemoryRouter, null, child)));
    }, { view, problems });
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
