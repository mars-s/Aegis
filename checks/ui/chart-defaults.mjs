// Production chart drawing rules, sheet binding and transfer into slides in both engines.
import { chromium, webkit } from './playwright.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const output = join(repo, '.scratch/live-references/chart-defaults'); mkdirSync(output, { recursive: true });
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const data = mkdtempSync(join(tmpdir(), 'aegis-chart-defaults-')), token = `charts-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: join(repo, 'agent'), env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: join(repo, 'app/dist'), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
const port = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Host startup timed out')), 20000);
  host.stdout.on('data', bytes => { const match = /"port":(\d+)/.exec(String(bytes)); if (match) { clearTimeout(timer); resolve(match[1]); } });
  host.once('exit', code => { clearTimeout(timer); reject(Error(`Host exited ${code}`)); });
});
const plot = { style: 'line', basis: 'Weekday hours', x: { kind: 'category', label: 'Day' }, y: { format: 'number', label: 'Hours' }, series: [{ name: 'Hours', points: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((x, i) => ({ x, y: [3, 7, 4, 8, 6][i] })) }] };
const metrics = [];
let browser, page;
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    browser = await engine.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:follow', 'off'); localStorage.setItem('aegis:orb-hint-seen', '1'); });
    await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
    await page.waitForFunction(() => window.aegis?.canvas?.board);
    await page.evaluate(async plot => {
      const board = await aegis.host.post('/boards', { name: 'Chart rules' }); aegis.canvas.setBoard(board);
      await new Promise(resolve => aegis.apply([
        { op: 'create', type: 'object', kind: 'plot', newId: 'plotchart', text: 'Weekday hours', x: 100, y: 100, w: 560, h: 400, data: plot },
        { op: 'create', type: 'deck', newId: 'slides', text: 'Chart story', x: 800, y: 100, props: { slides: [{ id: 'evidence', layout: 'chart', title: 'Weekday hours', chart: { sourceId: 'plotchart', labels: [], values: [] } }] } },
      ], resolve));
    }, plot);
    const measure = selector => page.locator(selector).evaluate(svg => {
      const line = svg.querySelector('.line'), dot = svg.querySelector('.dot, .pt'), text = svg.querySelector('text.tick, text.axis');
      const matrix = svg.getScreenCTM(), scale = Math.hypot(matrix.a, matrix.b);
      return { path: line.getAttribute('d'), stroke: getComputedStyle(line).strokeWidth, vector: getComputedStyle(line).vectorEffect, radius: +dot.getAttribute('r') * scale, label: parseFloat(getComputedStyle(text).fontSize) * scale };
    });
    const check = (result, smooth = false) => {
      assert.equal(/[CSQ]/.test(result.path), smooth); assert.equal(result.stroke, '1.5px'); assert.equal(result.vector, 'non-scaling-stroke');
      assert.ok(Math.abs(result.radius - 2.5) < .02, JSON.stringify(result)); assert.ok(result.label >= 11.99, JSON.stringify(result));
    };
    // Below 100% a plot is shown as its semantic summary (features/overview/zoom.js), so detail is measured from 100%.
    for (const z of [1, 1.5, 3]) {
      await page.evaluate(z => { aegis.canvas.setView({ x: 10, y: 0, z }); aegis.canvas.select(['plotchart']); }, z);
      await page.locator('#world [data-id="plotchart"] .cartesian svg .dot').first().waitFor(); await page.waitForTimeout(550);
      const result = await measure('#world [data-id="plotchart"] .cartesian svg'); check(result); metrics.push({ engine: name, z, ...result });
    }
    await page.evaluate(() => aegis.canvas.setView({ x: 10, y: 0, z: 1 }));
    const smoothing = page.locator('#world [data-id="plotchart"]').getByLabel('Smooth line', { exact: true }); await smoothing.check();
    await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.id === 'plotchart').data.smooth === true);
    await page.waitForFunction(() => /C/.test(document.querySelector('#world [data-id="plotchart"] .line')?.getAttribute('d') || ''));
    const saved = await page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`)); assert.equal(saved.cards.find(c => c.id === 'plotchart').data.smooth, true);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: 'slides', keyboard: true } })));
    const deck = '.deck-stage .deck-slide-wrap:not([hidden]) .deck-chart';
    await page.locator(deck).waitFor(); await page.waitForTimeout(550); check(await measure(deck), true);
    await page.screenshot({ path: join(output, `${name}-smooth-deck.png`) });
    await page.getByRole('button', { name: 'Present', exact: true }).click(); await page.locator('.deck-present .deck-chart').waitFor(); await page.waitForTimeout(100);
    check(await measure('.deck-present .deck-chart'), true);
    await page.screenshot({ path: join(output, `${name}-smooth-presentation.png`) }); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close editor', exact: true }).click(); await page.locator('.side-editor').waitFor({ state: 'detached' });
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'object_set', id: 'plotchart', path: ['smooth'], value: false }], resolve)));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: 'slides', keyboard: true } })));
    await page.locator(deck).waitFor(); await page.waitForTimeout(550); check(await measure(deck));
    await page.screenshot({ path: join(output, `${name}-straight-deck.png`) });
    await page.getByRole('button', { name: 'Present', exact: true }).click(); await page.locator('.deck-present .deck-chart').waitFor(); await page.waitForTimeout(100); check(await measure('.deck-present .deck-chart'));
    await page.screenshot({ path: join(output, `${name}-straight-presentation.png`) });
    assert.deepEqual(errors, []); console.log(`PASS ${name}: straight defaults at 100%, 150%, 300%, 1.5px stroke, 2.5px points, 12px labels, saved explicit smoothing and source transfer into deck/presentation`);
    await browser.close(); browser = null;
  }
  writeFileSync(join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
} catch (error) { writeFileSync(join(output, 'failure-metrics.json'), JSON.stringify(metrics, null, 2)); if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure.png') }); throw error; }
finally { await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
