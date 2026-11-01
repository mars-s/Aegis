// Saved reference arrangements and connections to the windows actually on screen.
import { chromium, webkit } from './playwright.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { assertRealLinkEdges, observeLinkPaint, readConnectionPreview, readRenderedLinks } from './static-geometry.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const output = join(repo, '.scratch/spatial-memory'); mkdirSync(output, { recursive: true });
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
writeFileSync(join(output, 'build.log'), build.stdout + build.stderr);
assert.equal(build.status, 0, build.stdout + build.stderr);
const data = mkdtempSync(join(tmpdir(), 'aegis-spatial-memory-')), token = `memory-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: join(repo, 'agent'), env: {
  ...process.env, AEGIS_DATA: data, AEGIS_UI: join(repo, 'app/dist'), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1',
} });
const fixtures = demoBatch.map(cmd => cmd.op === 'create' ? { ...cmd, newId: `memory${cmd.ref}` } : cmd);
let browser, page;
const results = [], failures = [];
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const apply = commands => page.evaluate(commands => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error(`Batch was rejected: ${document.getElementById('toast')?.textContent}`)), 5000);
  aegis.apply(commands, value => { clearTimeout(timer); resolve(value); });
}), commands);
const saved = () => page.waitForFunction(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') === 'saved' || document.getElementById('saveState')?.textContent === 'saved');
const shot = name => page.screenshot({ path: join(output, `${name}.png`) });
const open = async id => {
  await page.evaluate(id => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, keyboard: true } })), id);
  await page.locator('.side-editor.is-open').waitFor(); await settle();
};
const close = async () => {
  const button = page.locator('.side-editor [data-close]');
  if (await button.count()) { await button.click(); await page.locator('.side-editor').waitFor({ state: 'detached' }); }
};
const choose = async id => {
  await page.getByRole('combobox', { name: 'Pinned reference', exact: true }).click();
  await page.getByRole('listbox', { name: 'Pinned reference options', exact: true }).locator(`[data-value="${id}"]`).click();
};
const region = async (row, column) => {
  for (const [label, value] of [['Reference first row', row], ['Reference first column', column]]) {
    const input = page.getByLabel(label, { exact: true }); await input.fill(String(value)); await input.press('Tab');
  }
};
const readRegion = () => page.locator('.editor-reference-region input').evaluateAll(inputs => inputs.map(el => Number(el.value)));
const reload = async () => { await saved(); await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board?.cards.some(c => c.id === 'memorydocument')); };
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
    for (const width of process.env.AEGIS_MEMORY_QUICK ? [1440] : [1440, 1586]) for (const theme of process.env.AEGIS_MEMORY_QUICK ? ['dark'] : ['dark', 'light']) {
      const name = `${engineName}-${width}-${theme}`;
      page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 992 }, reducedMotion: 'reduce', colorScheme: theme }); page.setDefaultTimeout(5000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => { if (window !== window.top) return; localStorage.setItem('aegis:introduction-complete', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', theme); }, theme);
      await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
      await page.waitForFunction(() => window.aegis?.canvas?.board);
      await observeLinkPaint(page);
      const fresh = async () => {
        await close(); await saved();
        const boardId = await page.evaluate(async () => { const board = await aegis.host.post('/boards', { name: 'Spatial memory' }); if (aegis.flush) await aegis.flush(); localStorage.setItem('aegis:board', board.id); aegis.canvas.setBoard(board); return board.id; });
        await page.waitForFunction(id => window.aegis?.canvas?.board?.id === id, boardId);
        await apply(fixtures); await settle(); await saved();
      };
      const check = async (label, run) => {
        if (process.env.AEGIS_MEMORY_CASES && !process.env.AEGIS_MEMORY_CASES.split(',').includes(label)) return;
        try { await fresh(); await run(); results.push({ name, label, pass: true }); console.log(`PASS ${name}: ${label}`); }
        catch (error) { failures.push(`${name}: ${label}: ${error.stack}`); await shot(`${name}-${label}-failure`); console.error(`FAIL ${name}: ${label}: ${error.message}`); }
        finally { writeFileSync(join(output, 'results.json'), JSON.stringify({ results, failures }, null, 2)); await close(); }
      };
      await check('world-connect', async () => {
        await apply(['memorydocument', 'memorystats', 'memorygoals'].map((id, i) => ({ op: 'move', id, x: 40 + i * 800, y: 40 })));
        await page.evaluate(() => { aegis.canvas.setView({ x: 70, y: 160, z: .5 }); aegis.canvas.select(['memorydocument']); }); await settle();
        const target = page.locator('.card[data-id="memorystats"]'); await target.waitFor();
        const box = await target.boundingBox(), at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const view = await page.evaluate(() => ({ ...aegis.canvas.view }));
        assert.ok(await page.evaluate(at => { const c = aegis.canvas.board.cards.find(c => c.id === 'memorystats'), v = aegis.canvas.view; return at.x >= c.x * v.z + v.x && at.x <= (c.x + c.w) * v.z + v.x && at.y >= c.y * v.z + v.y && at.y <= (c.y + c.h) * v.z + v.y; }, at), 'the visible target lies inside its real projected rectangle');
        await page.getByLabel('More selection controls', { exact: true }).click(); await page.getByRole('button', { name: 'Connect', exact: true }).click();
        await page.mouse.move(at.x, at.y); await settle();
        const preview = await readConnectionPreview(page, at);
        assert.equal(preview.target, 'memorystats');
        const endpoint = preview.end;
        await shot(`${name}-displaced-connect-preview`); await page.mouse.click(at.x, at.y);
        await page.waitForFunction(() => aegis.canvas.board.links.some(l => l.a === 'memorydocument' && l.b === 'memorystats'));
        assert.deepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), view, 'Connect leaves the zoom and camera unchanged');
        const committed = (await readRenderedLinks(page))[0].end;
        assert.ok(Math.hypot(endpoint.x - committed.x, endpoint.y - committed.y) < .2, 'preview and committed endpoint agree');
        await shot(`${name}-displaced-connect`);
      });
      await check('world-routing', async () => {
        await apply([{ op: 'connect', newId: 'memorywire', a: 'memorydocument', b: 'memoryplot' }, { op: 'link_update', id: 'memorywire', set: { arrow: 'both', bend: 400 } }]);
        await page.evaluate(() => { aegis.canvas.fit(); aegis.canvas.select([]); }); await settle();
        await assertRealLinkEdges(page);
        const path = (await readRenderedLinks(page)).find(link => link.id === 'memorywire');
        assert.match(path.d, /Q/, 'the saved bend stays a world-space curve');
        assert.equal(await page.locator('.scene-overlay').count() ? path.arrows : await page.locator('#links path:not([class])').count(), 2, 'both arrowheads stay present');
        await shot(`${name}-world-routing`);
      });
      await check('reference-memory', async () => {
        await open('memorydocument'); await choose('memorysheet'); await region(2, 2); await close(); await open('memorydocument');
        assert.deepEqual(await readRegion(), [2, 2], 'region returns when reopened');
        await close(); await reload(); await open('memorydocument');
        assert.equal(await page.locator('.editor-context-reference').getAttribute('data-card-id'), 'memorysheet');
        assert.deepEqual(await readRegion(), [2, 2], 'region returns after reload'); await shot(`${name}-saved-region`);
        await close(); await open('memorydeck'); await choose('memorysheet'); await region(3, 1); await close(); await open('memorydocument');
        assert.deepEqual(await readRegion(), [2, 2], 'each editor owns its region');
        const boardId = await page.evaluate(() => aegis.canvas.board.id); await fresh();
        await open('memorydocument'); await choose('memorysheet'); await region(4, 1); await close(); await reload(); await open('memorydocument');
        assert.deepEqual(await readRegion(), [4, 1], 'another board can save a different region for the same card id'); await close();
        await page.evaluate(async id => { localStorage.setItem('aegis:board', id); aegis.canvas.setBoard(await aegis.host.get(`/boards/${id}`)); }, boardId);
        await open('memorydocument'); assert.deepEqual(await readRegion(), [2, 2], 'returning to the first board restores its own region');
        await page.mouse.move(500, 650); await page.mouse.wheel(0, 80); const restore = page.getByRole('button', { name: 'Show references', exact: true }); await restore.waitFor(); await restore.click();
        assert.deepEqual(await readRegion(), [2, 2], 'Show references keeps the saved region');
        await apply([{ op: 'connect', a: 'memorydocument', b: 'memorysheet' }]);
        await choose(''); await close(); await reload(); await open('memorydocument');
        assert.match(await page.getByRole('combobox', { name: 'Pinned reference', exact: true }).textContent(), /None/);
        assert.equal(await page.locator('.editor-reference-region input').count(), 0, 'explicit None survives reload');
      });
      await check('reference-validation', async () => {
        await open('memorydocument'); await choose('memorysheet'); await region(5, 3); await close();
        await apply([{ op: 'revise', id: 'memorysheet', data: { columns: [{ label: 'Day', kind: 'text' }, { label: 'Focus', kind: 'number', unit: 'h' }], rows: [{ cells: ['Mon', '3'] }] } }]);
        await open('memorydocument'); assert.deepEqual(await readRegion(), [1, 2], 'saved row and column clamp to the current data'); await close();
        const sheet = await page.evaluate(() => structuredClone(aegis.canvas.board.cards.find(c => c.id === 'memorysheet')));
        await apply([{ op: 'delete', ids: ['memorysheet'] }]); await reload(); await open('memorydocument');
        await page.getByText('Reference unavailable. Choose another source or None.', { exact: true }).waitFor();
        assert.equal(await page.locator('.editor-reference-table table').count(), 0); await shot(`${name}-unavailable-reference`); await close();
        await apply([{ op: 'restore', cards: [...await page.evaluate(() => aegis.canvas.board.cards), sheet], links: [] }]);
        await open('memorydocument'); assert.deepEqual(await readRegion(), [1, 2], 'restored source is used again');
      });
      await check('dataset-chrome', async () => {
        const dataset = await page.evaluate(async () => {
          const saved = await aegis.host.upload(new File(['day,amount\n' + Array.from({ length: 500 }, (_, i) => `Day ${i + 1},${i + 1}`).join('\n')], 'fictional-memory.csv', { type: 'text/csv' }));
          await new Promise(resolve => aegis.apply([{ op: 'create', type: 'dataset', newId: 'memorydataset', text: 'Fictional memory', props: { src: saved.url, name: 'fictional-memory.csv' } }], resolve)); return 'memorydataset';
        });
        await open(dataset); await page.locator('.data-viewer-grid tbody th').first().waitFor();
        assert.ok(await page.locator('.data-kind, .data-viewer-status, .data-viewer-grid tbody th').evaluateAll(els => els.length > 2 && els.every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)));
        await page.locator('.data-viewport').evaluate(el => el.scrollTop = el.scrollHeight); await page.waitForFunction(() => document.querySelector('.data-viewer-grid tbody')?.textContent.includes('Day 500'));
        await shot(`${name}-dataset-last-row`);
        await close(); await open('memorydocument'); await choose(dataset); await page.locator('.editor-reference-table table').waitFor(); await region(499, 2);
        await close(); await reload(); await open('memorydocument'); await page.locator('.editor-reference-table table').waitFor();
        assert.deepEqual(await readRegion(), [499, 2], 'CSV reference region survives reload');
        assert.equal(await page.locator('.editor-reference-table td').first().textContent(), '499');
      });
      assert.deepEqual(errors, []); await page.close();
    }
    await browser.close(); browser = null;
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ results, failures }, null, 2));
  assert.deepEqual(failures, []);
} finally { await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
