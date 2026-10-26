// Evidence must tell the same story on the board, in references and in a presentation.
import { chromium, webkit } from './playwright.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { choose } from './dropdown.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const output = join(repo, '.scratch/evidence-fidelity'); mkdirSync(output, { recursive: true });
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
writeFileSync(join(output, 'build.log'), build.stdout + build.stderr);
const data = mkdtempSync(join(tmpdir(), 'aegis-evidence-fidelity-')), token = `evidence-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: join(repo, 'agent'), env: {
  ...process.env, AEGIS_DATA: data, AEGIS_UI: join(repo, 'app/dist'), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1',
} });
const port = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Host startup timed out')), 20000);
  host.stdout.on('data', bytes => { const match = /"port":(\d+)/.exec(String(bytes)); if (match) { clearTimeout(timer); resolve(match[1]); } });
  host.once('exit', code => { clearTimeout(timer); reject(Error(`Host exited ${code}`)); });
});
const line = { style: 'line', basis: 'Fictional evidence', x: { kind: 'category', label: 'Day' }, y: { format: 'number', unit: 'h', label: 'Focus' }, series: [{ name: 'Focus', points: [{ x: 'Mon', y: 3 }, { x: 'Fri', y: 2 }] }] };
const comparison = { ...line, x: { kind: 'category', label: 'Month' }, y: { format: 'money', currency: 'AUD', label: 'Cost' }, series: [{ name: 'Revenue', points: [{ x: 'Jan', y: 40 }, { x: 'Mar', y: 70 }] }, { name: 'Support cost', points: [{ x: 'Jan', y: 150 }, { x: 'Mar', y: 130 }] }] };
const donut = { ...line, style: 'donut', x: { kind: 'category', label: 'Segment' }, y: { format: 'number', unit: 'customers' }, series: [{ name: 'Customers', points: [{ x: 'Startup', y: 70 }, { x: 'Team', y: 20 }, { x: 'Enterprise', y: 10 }] }] };
const sheet = value => ({ columns: [{ label: 'Day', kind: 'text' }, { label: 'Focus', kind: 'number', unit: 'h' }], rows: [{ cells: ['Mon', '3'] }, { cells: ['Fri', String(value)] }] });
const fixtures = [
  { type: 'object', kind: 'sheet', newId: 'source01', text: 'Weekly source', data: sheet(2) },
  { type: 'object', kind: 'sheet', newId: 'source02', text: 'Replacement source', data: sheet(14) },
  { type: 'object', kind: 'plot', newId: 'liveplot', text: 'Weekly focus', data: { ...line, source: { cardId: 'source01', xColumn: 0, yColumns: [1] } } },
  { type: 'object', kind: 'plot', newId: 'compare1', text: 'Revenue and support cost', data: comparison },
  { type: 'object', kind: 'plot', newId: 'donut001', text: 'Customer mix', data: donut },
  { type: 'doc', newId: 'brief001', text: 'Evidence brief', props: { body: 'Compare the weekly focus hours with the evidence. Keep the whole comparison.' } },
  { type: 'deck', newId: 'story001', text: 'Evidence story', props: { current: 0, slides: [
    { id: 'compare', layout: 'chart', title: 'Revenue and support cost', sub: 'Fictional figures, Australian dollars', chart: { sourceId: 'compare1', values: [40, 70], labels: ['Jan', 'Mar'] } },
    { id: 'mix', layout: 'chart', title: 'Customer mix', sub: 'Fictional customers', chart: { sourceId: 'donut001', values: [70, 20, 10] } },
    { id: 'live', layout: 'chart', title: 'Weekly focus', sub: 'Fictional hours', chart: { sourceId: 'liveplot', values: [3, 2] } },
  ] } },
].map((card, i) => ({ op: 'create', x: i % 3 * 600, y: Math.floor(i / 3) * 420, w: 520, h: 360, ...card }));
const results = [];
let browser, page;
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const apply = commands => page.evaluate(commands => new Promise(resolve => aegis.apply(commands, resolve)), commands);
const open = async id => { await page.evaluate(id => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, keyboard: true } })), id); await page.locator('.side-editor').waitFor(); await page.waitForTimeout(350); };
const close = async () => { await page.locator('.side-editor [data-close]').click(); await page.locator('.side-editor').waitFor({ state: 'detached' }); };
const active = () => page.locator('.deck-stage .deck-slide-wrap:not([hidden])');
const selectSlide = async index => { await page.getByRole('tab', { name: `Go to slide ${index + 1}`, exact: true }).click(); await settle(); };
const inspectChart = async root => {
  await root.locator('.deck-evidence svg').first().waitFor(); await settle();
  return root.locator('.deck-evidence').evaluate(el => {
    const box = el.getBoundingClientRect();
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const labels = [...el.querySelectorAll('svg text, .chart-legend .name, .chart-legend .share, .deck-axis-meaning')].filter(node => node.getClientRects().length).map(node => {
      const css = getComputedStyle(node), matrix = node instanceof SVGElement ? node.getScreenCTM() : null;
      return { text: node.textContent, font: parseFloat(css.fontSize) * (matrix ? Math.hypot(matrix.a, matrix.b) : 1), ...rect(node) };
    });
    return { kind: el.dataset.chartKind, lines: el.querySelectorAll('.line').length, slices: el.querySelectorAll('.slice').length,
      legend: [...el.querySelectorAll('.chart-legend .name')].map(node => node.textContent), text: el.textContent,
      labels, box: { x: box.x, y: box.y, w: box.width, h: box.height },
      paths: [...el.querySelectorAll('.line')].map(node => node.getAttribute('d')) };
  });
};
const readable = result => {
  for (const label of result.labels) {
    assert.ok(label.font >= 11.99, `Small chart label: ${JSON.stringify(label)}`);
    assert.ok(label.x >= result.box.x - 1 && label.x + label.w <= result.box.x + result.box.w + 1 && label.y >= result.box.y - 1 && label.y + label.h <= result.box.y + result.box.h + 1, `Clipped chart label: ${JSON.stringify({ label, box: result.box })}`);
  }
  for (const [i, a] of result.labels.entries()) for (const b of result.labels.slice(i + 1)) {
    assert.ok(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, `Overlapping chart labels: ${JSON.stringify({ a, b })}`);
  }
};
try {
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    browser = await engine.launch();
    for (const [width, height] of [[1440, 900], [1586, 992]]) for (const theme of ['dark', 'light']) {
      page = await browser.newPage({ viewport: { width, height }, colorScheme: theme }); page.setDefaultTimeout(15000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => { if (self !== top) return; localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:follow', 'off'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', theme); }, theme);
      await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
      await page.waitForFunction(() => window.aegis?.canvas?.board);
      await page.evaluate(async () => aegis.canvas.setBoard(await aegis.host.post('/boards', { name: 'Evidence fidelity' })));
      await apply([...fixtures, { op: 'connect', a: 'brief001', b: 'liveplot' }]);
      const prefix = `${engineName}-${width}-${theme}`;
      await open('story001');
      let comparisonResult = await inspectChart(active());
      assert.equal(comparisonResult.kind, 'line'); assert.equal(comparisonResult.lines, 2);
      assert.deepEqual(comparisonResult.legend, ['Revenue', 'Support cost']); readable(comparisonResult);
      assert.match(comparisonResult.text, /Month.*Cost/); assert.ok(comparisonResult.labels.some(label => /\$/.test(label.text)));
      await page.waitForFunction(() => document.querySelectorAll('.deck-film-item[data-i="0"] .line').length === 2);
      assert.equal(await page.locator('.deck-film-item[data-i="1"] .slice').count(), 3);
      await page.screenshot({ path: join(output, `${prefix}-comparison-editor.png`) });
      await page.getByRole('button', { name: 'Present', exact: true }).click();
      const presented = await inspectChart(page.locator('.deck-present'));
      assert.equal(presented.lines, 2); assert.deepEqual(presented.legend, comparisonResult.legend); readable(presented);
      await page.keyboard.press('ArrowRight');
      const composition = await inspectChart(page.locator('.deck-present'));
      assert.equal(composition.kind, 'donut'); assert.equal(composition.slices, 3); assert.equal(composition.lines, 0);
      assert.deepEqual(composition.legend, ['Startup', 'Team', 'Enterprise']); assert.match(composition.text, /100 customers/); readable(composition);
      await page.screenshot({ path: join(output, `${prefix}-doughnut-presentation.png`) });
      await page.keyboard.press('Escape'); await selectSlide(1);
      assert.equal((await inspectChart(active())).slices, 3);
      await selectSlide(2);
      const before = await inspectChart(active());
      await apply([{ op: 'object_set', id: 'source01', path: ['rows', 1, 'cells', 1], value: '9' }]);
      await page.waitForFunction(before => document.querySelector('.deck-stage .deck-slide-wrap:not([hidden]) .line')?.getAttribute('d') !== before, before.paths[0]);
      const live = await inspectChart(active());
      await apply([{ op: 'delete', id: 'source01' }]);
      await active().getByText('Source missing, showing saved snapshot', { exact: true }).waitFor();
      const missing = await inspectChart(active()); assert.equal(missing.lines, live.lines); readable(missing);
      assert.match(await active().locator('.cartesian svg').getAttribute('aria-label'), /9 h/);
      readable(await inspectChart(page.locator('#world [data-id="story001"] .deck-main')));
      await page.screenshot({ path: join(output, `${prefix}-saved-snapshot.png`) });
      let saved = await page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`));
      assert.equal(saved.cards.find(card => card.id === 'liveplot').data.snapshot.series[0].points[1].y, 9);
      assert.equal(saved.cards.find(card => card.id === 'story001').props.slides[2].chart.spec.series[0].points[1].y, 9);
      await close();
      const boardId = saved.id;
      await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
      await page.evaluate(async id => aegis.canvas.setBoard(await aegis.host.get(`/boards/${id}`)), boardId);
      await page.evaluate(() => aegis.canvas.fit());
      const summary = page.locator('.semantic-window[data-card-id="liveplot"]');
      await summary.getByText('Source missing, showing saved snapshot', { exact: true }).waitFor();
      assert.equal(await summary.locator('.semantic-headline').textContent(), '9 h');
      const doc = page.locator('.semantic-window[data-card-id="brief001"]');
      await doc.waitFor();
      assert.deepEqual(await doc.locator('.semantic-fact').allTextContents(), ['Compare the weekly focus hours with the evidence.']);
      await open('brief001');
      await page.locator('.editor-reference-chart').getByText('Source missing, showing saved snapshot', { exact: true }).waitFor();
      await close(); await open('liveplot');
      await page.locator('.object-editor .values tbody tr:last-child td').waitFor({ state: 'attached' });
      assert.match(await page.locator('.object-editor .values tbody tr:last-child td').textContent(), /9/);
      await choose(page.locator('.object-editor').getByRole('combobox', { name: 'Choose chart source' }), 'source02');
      await page.waitForFunction(() => !document.querySelector('.object-editor .chart-source-status'));
      await page.waitForFunction(() => /14/.test(document.querySelector('.object-editor .values tbody tr:last-child td')?.textContent || ''));
      await close();
      await apply([{ op: 'delete', id: 'liveplot' }]);
      await open('story001'); await selectSlide(2);
      await active().getByText('Source missing, showing saved snapshot', { exact: true }).waitFor();
      saved = await page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`));
      assert.equal(saved.cards.find(card => card.id === 'story001').props.slides[2].chart.spec.series[0].points[1].y, 14);
      await choose(active().getByRole('combobox', { name: 'Choose chart source' }), 'compare1');
      await page.waitForFunction(() => document.querySelectorAll('.deck-stage .deck-slide-wrap:not([hidden]) .line').length === 2);
      assert.deepEqual((await inspectChart(active())).legend, ['Revenue', 'Support cost']);
      await page.waitForFunction(() => document.querySelector('.deck-panel [data-saved]')?.textContent === 'Saved');
      await close();
      await apply([{ op: 'create', type: 'object', kind: 'plot', newId: 'orphan01', text: 'Unresolved source', data: { ...line, source: { cardId: 'absent01', xColumn: 0, yColumns: [1] } } }]);
      await open('orphan01');
      await page.locator('.object-editor').getByText('Source missing, no saved snapshot', { exact: true }).waitFor();
      assert.equal(await page.locator('.object-editor .line').count(), 0);
      await close();
      await page.evaluate(async () => aegis.canvas.setBoard(await aegis.host.post('/boards', { name: 'Demo topology' })));
      await apply(demoBatch);
      await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(450);
      const diagram = page.locator('.semantic-window').filter({ has: page.locator('strong', { hasText: 'Idea to decision' }) });
      await diagram.locator('.semantic-graphic text').first().waitFor();
      const topology = await diagram.locator('.semantic-graphic').evaluate(svg => ({ names: [...svg.querySelectorAll('text')].map(node => node.textContent), edges: [...svg.querySelectorAll('path')].map(node => [Number(node.dataset.from), Number(node.dataset.to)]), labels: [...svg.querySelectorAll('text')].map(node => ({ font: parseFloat(getComputedStyle(node).fontSize), x: node.getBBox().x, right: node.getBBox().x + node.getBBox().width })), width: svg.viewBox.baseVal.width }));
      assert.deepEqual(topology.names, ['Collect', 'Try it', 'Decide', 'Share']); assert.deepEqual(topology.edges, [[0, 1], [1, 2], [2, 3]]);
      assert.ok(topology.labels.every(label => label.font >= 12 && label.x >= 0 && label.right <= topology.width));
      await page.screenshot({ path: join(output, `${prefix}-demo-fit.png`) });
      assert.deepEqual(errors, []);
      results.push({ engine: engineName, width, height, theme, comparison: comparisonResult, composition, missing, topology, errors });
      console.log(`PASS ${prefix}: complete series, doughnut, readable labels, latest snapshot after deletion/reload, reference status, source replacement and demo chain at Fit`);
      await page.close(); page = null;
    }
    await browser.close(); browser = null;
  }
  writeFileSync(join(output, 'metrics.json'), JSON.stringify(results, null, 2));
} catch (error) {
  writeFileSync(join(output, 'failure-metrics.json'), JSON.stringify(results, null, 2));
  if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure.png') });
  throw error;
} finally { await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
