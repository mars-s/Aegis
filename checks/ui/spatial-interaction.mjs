// Interaction regressions against the shipped bundle, with fictional local data only.
import { chromium, webkit } from './playwright.mjs';
import { assertRealLinkEdges, readRenderedLinks } from './static-geometry.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const contextSelector = '.document-context';
const output = join(repo, '.scratch/spatial-interaction'); mkdirSync(output, { recursive: true });
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const data = mkdtempSync(join(tmpdir(), 'aegis-spatial-interaction-')), token = `spatial-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: join(repo, 'agent'), env: {
  ...process.env, AEGIS_DATA: data, AEGIS_UI: join(repo, 'app/dist'), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1',
} });
const series = [
  { name: 'Revenue', points: [{ x: 'Jan', y: 20 }, { x: 'Feb', y: 40 }, { x: 'Mar', y: 70 }] },
  { name: 'Support cost', points: [{ x: 'Jan', y: 90 }, { x: 'Feb', y: 110 }, { x: 'Mar', y: 130 }] },
];
const plot = { style: 'line', basis: 'Fictional quarterly finance', x: { kind: 'category', label: 'Month' }, y: { format: 'money', currency: 'AUD', label: 'AUD' }, series };
const fixtures = [
  { op: 'create', type: 'doc', newId: 'decision', text: 'Quarterly decision', x: 100, y: 160, w: 760, h: 540, props: { body: 'Compare revenue and support cost before choosing the next step.' } },
  { op: 'create', type: 'object', kind: 'plot', newId: 'comparison', text: 'Revenue and support cost', x: 1100, y: 160, w: 640, h: 420, data: plot },
  { op: 'create', type: 'doc', newId: 'unrelated', text: 'Independent brief', x: 100, y: 800, w: 760, h: 540, props: { body: 'This brief has no linked evidence.' } },
  { op: 'create', type: 'object', kind: 'sheet', newId: 'sheetdata', text: 'Finance source', x: 1000, y: 800, w: 640, h: 420, data: { columns: [{ label: 'Month', kind: 'text' }, { label: 'Revenue', kind: 'number' }, { label: 'Support', kind: 'number' }], rows: [{ cells: ['Jan', '20', '90'] }, { cells: ['Feb', '40', '110'] }, { cells: ['Mar', '70', '130'] }] } },
  { op: 'create', type: 'object', kind: 'plot', newId: 'boundplot', text: 'Bound revenue', x: 1900, y: 800, data: { ...plot, series: series.slice(0, 1), source: { cardId: 'sheetdata', xColumn: 0, yColumns: [1] } } },
  { op: 'create', type: 'object', kind: 'plot', newId: 'sharedplot', text: 'Bound support', x: 2800, y: 800, data: { ...plot, series: series.slice(1), source: { cardId: 'sheetdata', xColumn: 0, yColumns: [2] } } },
  { op: 'connect', newId: 'evidence', a: 'decision', b: 'comparison' },
  { op: 'link_update', id: 'evidence', set: { arrow: 'end' } },
];
let browser, page;
const results = [], errors = [];
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const shot = name => page.screenshot({ path: join(output, `${name}.png`) });
const open = async id => {
  await page.evaluate(id => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, keyboard: true } })), id);
  await page.locator('.side-editor.is-open').waitFor(); await page.waitForTimeout(450);
};
const close = async () => {
  const button = page.locator('.side-editor [data-close]');
  if (await button.count()) { await button.click(); await page.locator('.side-editor').waitFor({ state: 'detached' }); }
};
const choose = async id => {
  await page.getByRole('combobox', { name: 'Pinned reference', exact: true }).click();
  await page.getByRole('listbox', { name: 'Pinned reference options', exact: true }).locator(`[data-value="${id}"]`).click();
};
try {
  const port = await new Promise((resolve, reject) => {
    let log = ''; const timer = setTimeout(() => reject(Error(log || 'Host startup timed out')), 20000);
    host.stdout.on('data', b => { log += b; const match = /"port":(\d+)/.exec(log); if (match) { clearTimeout(timer); resolve(match[1]); } });
    host.stderr.on('data', b => log += b);
    host.once('exit', code => { clearTimeout(timer); reject(Error(`${code}: ${log}`)); });
  });
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    if (process.env.AEGIS_BROWSER && process.env.AEGIS_BROWSER !== engineName) continue;
    browser = await engine.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: 'dark' }); page.setDefaultTimeout(5000);
    const exceptions = []; page.on('pageerror', error => { exceptions.push(error.message); console.error(error.message); });
    await page.addInitScript(() => { localStorage.setItem('aegis:introduction-complete', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', 'dark'); });
    await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
    await page.waitForFunction(() => window.aegis?.canvas?.board);
    await page.evaluate(async fixtures => { aegis.canvas.setBoard(await aegis.host.post('/boards', { name: 'Spatial interaction' })); aegis.apply(fixtures); }, fixtures);
    await page.waitForFunction(() => window.aegis?.canvas?.board?.cards.length === 6);
    const check = async (name, run) => {
      try { await run(); results.push({ engine: engineName, name, pass: true }); console.log(`PASS ${engineName}: ${name}`); }
      catch (error) { errors.push(`${engineName}: ${name}: ${error.message}`); await shot(`${engineName}-${name}-failure`); }
      finally { await close(); }
    };
    await check('window-selection', async () => {
      await page.evaluate(() => { aegis.canvas.setView({ x: 70, y: 80, z: .6 }); aegis.canvas.select(['decision']); }); await settle();
      const before = await page.evaluate(() => ({ ...aegis.canvas.view }));
      await page.locator('.card[data-id="comparison"] .win-strip').click({ modifiers: ['Shift'] }); await settle();
      assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), ['decision', 'comparison']);
      assert.deepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), before, 'modifier selection leaves the camera still');
      await page.locator('.card[data-id="comparison"] .win-strip').click({ modifiers: ['Shift'] }); await settle();
      assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), ['decision']);
      await page.locator('.card[data-id="comparison"] .win-strip').click({ modifiers: ['Shift'] }); await settle();
      await page.evaluate(() => aegis.canvas.setView({ x: 40, y: 0, z: 1 })); await settle();
      assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), ['decision', 'comparison'], 'selection survives detail');
      await page.evaluate(() => aegis.canvas.setView({ x: 70, y: 80, z: .6 })); await settle();
      const worldBefore = await page.evaluate(() => aegis.canvas.board.cards.filter(c => ['decision', 'comparison'].includes(c.id)).map(c => ({ id: c.id, x: c.x, y: c.y })));
      const strip = await page.locator('.card[data-id="comparison"] .win-strip').boundingBox();
      await page.keyboard.down('Meta'); await page.mouse.move(strip.x + 80, strip.y + strip.height / 2); await page.mouse.down();
      await page.mouse.move(strip.x + 141, strip.y + strip.height / 2 + 37, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Meta');
      await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.id === 'comparison').x !== 1100);
      const moved = await page.evaluate(() => aegis.canvas.board.cards.filter(c => ['decision', 'comparison'].includes(c.id)).map(c => ({ id: c.id, x: c.x, y: c.y })));
      assert.deepEqual(moved[0], worldBefore[0], 'Cmd-drag leaves the other selected window still');
      assert.ok(Math.abs(moved[1].x - worldBefore[1].x - 61 / .6) < 1 && Math.abs(moved[1].y - worldBefore[1].y - 37 / .6) < 1, 'Cmd-drag uses the exact camera scale and bypasses snapping');
      assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), ['comparison']);
      await page.evaluate(cards => new Promise(resolve => aegis.apply(cards.map(c => ({ op: 'move', ...c })), resolve)), worldBefore);

    });
    await check('visible-controls', async () => {
      await page.evaluate(() => { aegis.canvas.setView({ x: 70, y: 80, z: .6 }); aegis.canvas.select(['decision']); document.getElementById('stage').focus(); });
      await settle(); await page.mouse.move(1400, 850);
      await page.waitForTimeout(300);
      const geometry = await page.evaluate(() => {
        const r = el => el.getBoundingClientRect().toJSON();
        const visible = el => el && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
        return { window: r(document.querySelector('.card[data-id="decision"]')), bar: r(document.getElementById('selectionBar')), resize: visible(document.querySelector('.selection-resize')), rotate: visible(document.querySelector('.rotation-handle')) };
      });
      assert.equal(geometry.resize, true); assert.equal(geometry.rotate, true);
      assert.ok(geometry.bar.bottom <= geometry.window.top - 23.9, JSON.stringify(geometry));
      await shot(`${engineName}-summary-controls`);
      await page.evaluate(() => { aegis.canvas.setView({ x: 300, y: 250, z: .05 }); document.getElementById('stage').focus(); }); await page.waitForTimeout(150);
      assert.ok(await page.locator('#selectionBar, .editing-outline').evaluateAll(els => els.every(el => !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden')));
      assert.equal(await page.locator('.overview-back, .overview-cluster').count(), 0);
      assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), ['decision']);
      await shot(`${engineName}-selected-cluster`);
    });
    await check('connector-layer', async () => {
      await page.evaluate(() => {
        aegis.apply([{ op: 'create', type: 'note', newId: 'obstacle', text: 'Unrelated window', x: 800, y: 433, w: 480, h: 256 }, { op: 'link_update', id: 'evidence', set: { bend: 400 } }]);
        aegis.canvas.setView({ x: 70, y: 80, z: .6 }); aegis.canvas.select([]);
      }); await settle();
      await assertRealLinkEdges(page);
      const curve = (await readRenderedLinks(page)).find(link => link.id === 'evidence').d;
      assert.match(curve, /Q/, 'links retain the world-space bend instead of routing around summaries');
      const obstacle = await page.locator('.card[data-id="obstacle"]').boundingBox();
      assert.ok(Math.abs(obstacle.x - (800 * .6 + 70)) < 1 && Math.abs(obstacle.y - (433 * .6 + 80)) < 1, 'unrelated windows keep their position');
      await shot(`${engineName}-window-connectors`);
      await open('decision'); await close(); await settle();
      await assertRealLinkEdges(page);
      assert.equal((await readRenderedLinks(page)).find(link => link.id === 'evidence').d, curve, 'the real curve returns after the editor closes');
      await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'delete', ids: ['obstacle'] }, { op: 'link_update', id: 'evidence', set: { bend: 0 } }], resolve)));
    });
    await check('reference-legend', async () => {
      await open('decision');
      const legend = page.locator('.editor-reference-chart .chart-legend');
      assert.equal(await legend.isVisible(), true);
      assert.match(await legend.textContent(), /Revenue.*Support cost/);
      assert.ok(await legend.locator('.name').evaluateAll(els => els.every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)));
      assert.ok(await page.locator('.editor-reference-chart').evaluate(el => el.clientHeight >= el.scrollHeight));
      await shot(`${engineName}-multi-reference`);
    });
    await check('reference-recovery', async () => {
      await open('decision'); await choose('sheetdata');
      await page.getByLabel('Reference first row', { exact: true }).fill('2'); await page.getByLabel('Reference first row', { exact: true }).press('Tab');
      await page.mouse.move(500, 650); await page.mouse.wheel(0, 80);
      await page.locator(contextSelector).waitFor({ state: 'hidden' });
      const restore = page.getByRole('button', { name: 'Show references', exact: true }); await restore.waitFor();
      const rect = await restore.boundingBox(), editor = await page.locator('.side-editor').boundingBox(); assert.ok(rect.x + rect.width <= editor.x - 24);
      await restore.focus(); await shot(`${engineName}-restore-control`); await page.keyboard.press('Enter');
      await page.locator(contextSelector).waitFor({ state: 'visible' });
      assert.equal(await page.locator('.editor-context-reference').getAttribute('data-card-id'), 'sheetdata');
      assert.equal(await page.getByLabel('Reference first row', { exact: true }).inputValue(), '2');
      assert.equal(await page.locator('.editor-reference-table td').first().textContent(), 'Feb');
      await page.mouse.move(500, 650); await page.mouse.down({ button: 'middle' }); await page.mouse.move(540, 680); await page.mouse.up({ button: 'middle' });
      await restore.waitFor(); await restore.click(); await page.locator(contextSelector).waitFor({ state: 'visible' });
      await shot(`${engineName}-restored-region`);
    });
    await check('relevant-defaults', async () => {
      await open('unrelated');
      await page.getByText('Link a window to pin it here', { exact: true }).waitFor();
      assert.equal(await page.locator('.editor-reference-chart, .editor-reference-table').count(), 0);
      await shot(`${engineName}-empty-reference`);
      await choose('comparison'); assert.equal(await page.locator('.editor-context-reference').getAttribute('data-card-id'), 'comparison');
      await choose(''); await close(); await open('unrelated');
      assert.equal(await page.locator('.editor-reference-chart, .editor-reference-table').count(), 0, 'None is remembered');
      await close(); await open('boundplot');
      assert.equal(await page.locator('.editor-context-reference').getAttribute('data-card-id'), 'sheetdata', 'a source sheet is a shared-data reference');
      await close();
      await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'update', id: 'sheetdata', set: { props: { hidden: true } } }], resolve)));
      await open('sharedplot');
      assert.equal(await page.locator('.editor-context-reference').getAttribute('data-card-id'), 'boundplot', 'plots with the same source share data');
      await close();
      await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'update', id: 'sheetdata', set: { props: { hidden: false } } }], resolve)));
      await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'connect', a: 'sharedplot', b: 'comparison' }], resolve)));
      await open('sharedplot');
      assert.equal(await page.locator('.editor-context-reference').getAttribute('data-card-id'), 'comparison', 'an explicit link takes priority over shared data');
    });
    await check('import-notice', async () => {
      await open('decision');
      await page.evaluate(() => {
        const dt = new DataTransfer(); dt.items.add(new File(['amount,department\n12,Research\n24,Support\n'], 'fictional-quarterly-amounts.csv', { type: 'text/csv' }));
        document.getElementById('stage').dispatchEvent(new DragEvent('drop', { bubbles: true, clientX: 400, clientY: 350, dataTransfer: dt }));
      });
      await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'dataset'));
      const dataset = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'dataset').id);
      await open(dataset); await page.locator('.data-viewer-grid').waitFor();
      await page.getByText('Link a window to pin it here', { exact: true }).waitFor();
      const notice = page.locator('#toast'); await notice.waitFor();
      const m = await notice.evaluate(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.right - 4, r.top + r.height / 2); return { width: r.width, left: r.left, right: r.right, full: el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth, top: hit === el || el.contains(hit), message: el.textContent }; });
      assert.ok(m.top, JSON.stringify(m)); assert.ok(m.full); assert.ok(m.width <= 480 && m.left >= 24 && m.right <= 1416, JSON.stringify(m));
      assert.match(m.message, /fictional-quarterly-amounts|Imported/);
      await shot(`${engineName}-import-notice`);
    });
    assert.deepEqual(exceptions, []);
    await browser.close(); browser = null;
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
