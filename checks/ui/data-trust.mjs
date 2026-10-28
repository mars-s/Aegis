import { assertCameraScale } from './static-geometry.mjs';
import { choose } from './dropdown.mjs';
// Exercise the production bundle and real host with temporary data only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { parseCsv } from '@aegis/domain/dataset';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `trust-${process.pid}`, data = mkdtempSync(join(tmpdir(), 'aegis-trust-'));
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_TOKEN: token, AEGIS_PORT: '0', AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((resolve, reject) => { host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); }); host.once('exit', code => reject(Error(`Host exited ${code}`))); });
const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const webkit = playwright.webkit ?? playwright.default?.webkit;
let checks = 0;
const pass = message => { checks++; console.log('PASS ' + message); };
const source = '/tmp/aegis-fix/data/expenses.csv';
const expenses = existsSync(source) ? readFileSync(source, 'utf8') : 'amount,department,opened_at,note\n' + Array.from({ length: 500 }, (_, i) => `${i + 1},${i % 2 ? 'Sales' : 'Support'},2024-01-03,Row ${i + 1}`).join('\n');
// Read each rendered column when the React viewer virtualises the horizontal axis.
const rowValues = async row => {
  const table = row.page().locator('.data-viewer-grid');
  const count = await table.getAttribute('aria-colcount');
  if (!count) return row.locator('td').allTextContents();
  const picker = row.page().getByRole('combobox', { name: 'Go to column' });
  const selected = await picker.evaluate(el => el.value);
  const values = [];
  for (let column = 0; column < Number(count) - 1; column++) {
    await choose(picker, String(column));
    const cell = row.locator(`[aria-colindex="${column + 2}"]`);
    await cell.waitFor({ state: 'attached' });
    values.push(await cell.textContent());
  }
  await choose(picker, selected);
  return values;
};
const expected = parseCsv(expenses);
assert.equal(expected.rows.length, 500);

try {
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => { if (window.top === window) { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', 'dark'); } });
      await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
      await page.waitForFunction(() => window.aegis?.canvas?.board);
      const apply = commands => page.evaluate(commands => aegis.apply(commands), commands);
      const select = async ids => { await page.evaluate(ids => { aegis.canvas.select(ids); document.getElementById('stage').focus(); }, ids); await page.waitForTimeout(100); };
      const close = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.body.classList.contains('editor-open')); await page.waitForTimeout(220); };
      const drop = async (text, name) => {
        await page.evaluate(({ text, name }) => {
          const transfer = new DataTransfer(); transfer.items.add(new File([text], name, { type: 'text/csv' }));
          document.getElementById('stage').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, clientX: 500, clientY: 350, bubbles: true }));
        }, { text, name });
        await page.waitForFunction(name => aegis.canvas.board.cards.some(c => c.props?.name === name), name);
        const id = await page.evaluate(name => aegis.canvas.board.cards.find(c => c.props?.name === name).id, name);
        await select([id]); return id;
      };
      await apply([{ op: 'restore', cards: [], links: [] }]);
      const id = await drop(expenses, 'expenses.csv');
      await page.locator('#selectionBar [aria-label="Open"]').click();
      await page.waitForFunction(() => document.querySelector('.data-viewer-grid') && document.querySelector('.data-viewport')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('.data-viewer-grid').getAttribute('aria-rowcount'), '501');
      assert.ok(await page.locator('.data-viewer-grid tbody tr:not(.data-spacer)').count() < 60);
      assert.deepEqual(await rowValues(page.locator('.data-viewer-grid tbody tr:not(.data-spacer)').first()), expected.rows[0]);
      assert.equal(await page.locator('.data-profile').getAttribute('open'), null);
      await page.screenshot({ path: out(`trust-data-500-${engineName}.png`) });
      await page.locator('.data-viewport').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.waitForFunction(() => [...document.querySelectorAll('.data-viewer-grid tbody th')].some(el => el.textContent === '500'));
      assert.deepEqual(await rowValues(page.locator('.data-viewer-grid tbody tr:not(.data-spacer)').last()), expected.rows.at(-1));
      const sticky = await page.locator('.data-viewer-grid thead').evaluate(el => ({ head: el.querySelector('th').getBoundingClientRect().top, viewport: el.closest('.data-viewport').getBoundingClientRect().top }));
      assert.ok(Math.abs(sticky.head - sticky.viewport) < 2);
      pass(`${engineName}: Open reads all 500 source rows, with a bounded DOM and sticky header`);
      const targetColumn = expected.columns.at(-1);
      await page.getByRole('searchbox', { name: 'Find column' }).fill(targetColumn);
      assert.equal(await page.getByRole('combobox', { name: 'Go to column' }).evaluate(el => el.value), String(expected.columns.length - 1));
      assert.ok(await page.locator('.data-viewport').evaluate(el => el.scrollLeft) > 0);
      await page.locator('.data-profile summary').click();
      assert.match(await page.locator('[data-profile-content]').textContent(), /Gaps/);
      await page.getByRole('searchbox', { name: 'Find column' }).fill('amount');
      assert.match(await page.locator('[data-profile-content]').textContent(), /Range.*Mean.*Median.*Gaps/);
      await page.getByRole('button', { name: 'Sort by amount', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.data-viewport')?.getAttribute('aria-busy') === 'false');
      const amounts = await page.locator('.data-viewer-grid tbody tr:not(.data-spacer) td:first-of-type').allTextContents();
      assert.equal(Number(amounts[0]), Math.min(...expected.rows.map(row => Number(row[0]))));
      assert.equal(await page.locator('.data-viewer-grid thead th[aria-sort=ascending]').count(), 1);
      await page.screenshot({ path: out(`trust-data-profile-${engineName}.png`) });
      pass(`${engineName}: column finder, horizontal scrolling, kinds, profile and numeric sort`);
      await close(); await select([id]); await page.keyboard.press('Enter'); await page.locator('.data-viewer-grid').waitFor(); await close();
      // Window actions render in screen space beside the card (canvas chrome), not inside the scaled card.
      await page.locator(`.window-actions [data-window-action="${id}"]`).click(); await page.locator('.data-viewer-grid').waitFor(); await close();
      pass(`${engineName}: Enter and the dataset window Open action use the shared editor`);

      await apply([{ op: 'create', newId: 'trusthdr', type: 'title', text: 'Launch review', x: 0, y: 0 }, { op: 'create', newId: 'trustweb', type: 'web', text: 'No editor', x: 400, y: 0 }]);
      await select(['trustweb']); assert.equal(await page.locator('#selectionBar [aria-label="Open"]').count(), 0);
      await select(['trusthdr']);
      const size = page.getByRole('textbox', { name: 'Text size', exact: true });
      assert.equal(await size.inputValue(), '24');
      await page.getByRole('button', { name: 'Increase text size', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Text size"]')?.value === '25');
      assert.equal(await size.inputValue(), '25');
      await page.waitForFunction(() => { const body = document.querySelector('.card[data-id="trusthdr"] .body'); return body && getComputedStyle(body).fontSize === '25px'; });
      // One line-height control lives under More > Format; it must report the rendered value, then drive it.
      await page.getByLabel('More selection controls', { exact: true }).click();
      if (!await page.getByLabel('Line height', { exact: true }).isVisible()) await page.getByLabel('Format selection', { exact: true }).click();
      const lineHeight = page.getByLabel('Line height', { exact: true });
      const rendered = await page.evaluate(() => { const body = document.querySelector('.card[data-id="trusthdr"] .body'); const style = getComputedStyle(body); return Math.round(parseFloat(style.lineHeight) / parseFloat(style.fontSize) * 100) / 100; });
      assert.equal(Number(await lineHeight.inputValue()), rendered, 'the control reports the rendered line height');
      await lineHeight.fill('1.5'); await lineHeight.press('Tab');
      await page.waitForFunction(() => { const body = document.querySelector('.card[data-id="trusthdr"] .body'); const style = getComputedStyle(body); return Math.abs(parseFloat(style.lineHeight) / parseFloat(style.fontSize) - 1.5) < 0.01; });
      await page.screenshot({ path: out(`trust-typography-${engineName}.png`) }); await page.keyboard.press('Escape');
      pass(`${engineName}: unavailable Open is hidden, heading size increments 24 to 25 and line-height controls agree`);

      await apply([{ op: 'create', type: 'object', kind: 'sheet', newId: 'trustsht', text: 'Plan the week', x: 0, y: 180, data: { columns: [{ label: 'Day', kind: 'text' }, { label: 'Focus', kind: 'number', unit: 'h' }], rows: [{ cells: ['Mon', '3'] }, { cells: ['Tue', '4'] }] } }]);
      await assertCameraScale(page, ['trustsht']);
      await select(['trustsht']); await page.keyboard.press('Enter'); await page.locator('.sheet-grid').waitFor();
      assert.equal(await page.locator('.sheet-grid td[data-r="0"][data-c="1"]').textContent(), 'Focus (h)');
      assert.equal(await page.locator('.sheet-fx').textContent(), 'Value');
      await page.locator('.sheet-grid td[data-r="1"][data-c="1"]').click();
      assert.equal(await page.locator('[data-kind-label], .sheet-editor [aria-label="Column type"]').textContent(), 'Number · h');
      await page.screenshot({ path: out(`trust-sheet-${engineName}.png`) }); await close();
      pass(`${engineName}: sheet headers retain units and the raw value field says Value`);

      for (const key of ['Backspace', 'Delete']) {
        await select(['trusthdr']); await page.keyboard.press(key);
        const notice = page.locator('.canvas-undo'); await notice.waitFor({ state: 'visible' });
        assert.match(await notice.textContent(), /Deleted 1 window.*·.*Undo/);
        await page.screenshot({ path: out(`trust-deletion-${engineName}.png`) });
        await notice.getByRole('button', { name: 'Undo' }).focus(); await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), ['trusthdr']);
        assert.equal(await page.evaluate(() => aegis.canvas.board.cards.some(c => c.id === 'trusthdr')), true);
      }
      await select(['trusthdr', 'trustweb']); await page.keyboard.press('Delete');
      await page.waitForFunction(() => document.querySelector('.canvas-undo:not([hidden])')?.textContent.includes('Deleted 2 windows'));
      assert.match(await page.locator('.canvas-undo').textContent(), /Deleted 2 windows/);
      await page.keyboard.press('Meta+z'); assert.deepEqual((await page.evaluate(() => aegis.canvas.selection())).sort(), ['trusthdr', 'trustweb']);
      await select(['trustweb']); await page.keyboard.press('Delete');
      await page.waitForTimeout(5200); assert.equal(await page.locator('.canvas-undo').isVisible(), false);
      await page.keyboard.press('Meta+z'); assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), ['trustweb']);
      pass(`${engineName}: Backspace, Delete, keyboard Undo, multi-selection and five-second expiry`);

      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await page.waitForTimeout(50);
      const colours = await page.evaluate(() => {
        const root = document.documentElement;
        return { bg: document.querySelector('button[aria-label="App board background"]').value, panel: document.querySelector('button[aria-label="Panels"]').value, canvas: getComputedStyle(root).getPropertyValue('--canvas').trim(), card: getComputedStyle(root).getPropertyValue('--card').trim() };
      });
      const hex = value => /^#[a-f\d]{3}$/i.test(value) ? '#' + [...value.slice(1)].map(c => c + c).join('') : value;
      assert.equal(colours.bg, hex(colours.canvas)); assert.equal(colours.panel, hex(colours.card));
      await page.mouse.move(1400, 20); await page.locator('#settingsBtn').click();
      const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
      await settings.getByRole('tab', { name: 'General', exact: true }).click();
      await settings.locator('.settings-appearance > summary').click();
      await settings.getByRole('button', { name: 'App board background', exact: true }).click();
      const colourEditor = page.getByRole('dialog', { name: 'Colour editor', exact: true });
      await colourEditor.getByLabel('Hex', { exact: true }).fill('#123456');
      await colourEditor.getByRole('button', { name: 'Done', exact: true }).click();
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()), '#123456');
      await settings.getByRole('button', { name: 'Reset colours for this mode', exact: true }).click();
      assert.equal(await settings.getByLabel('App board background', { exact: true }).evaluate(el => el.value), '#000000');
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; }); await page.waitForTimeout(50);
      assert.equal(await settings.getByLabel('App board background', { exact: true }).evaluate(el => el.value), '#f5f5f7');
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      await settings.getByRole('button', { name: 'Done', exact: true }).click();
      pass(`${engineName}: colour values follow live tokens, overrides, resets and theme changes`);

      // The real host records the final document shape; mounting/opening creates no later batch.
      const agentId = await page.evaluate(async () => {
        const [agent] = await aegis.host.post('/agents', { boardId: aegis.canvas.board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKE ' + JSON.stringify([{ op: 'create', newId: 'trustdoc', type: 'doc', text: 'Launch plan', props: { body: '# Launch plan\n\nReady for review.' }, x: 500, y: 180 }]) }); return agent.id;
      });
      await page.waitForFunction(async id => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).some(a => a.id === id && !a.running && a.history[0]?.finished), agentId);
      await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.id === 'trustdoc'));
      const before = await page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`));
      await select(['trustdoc']); await page.keyboard.press('Enter'); await page.locator('.docs-body').waitFor(); await close(); await page.waitForTimeout(400);
      const after = await page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`)); assert.equal(after.rev, before.rev);
      const history = await page.evaluate(async id => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).find(a => a.id === id).history[0], agentId);
      assert.equal(history.canUndo, true);
      await page.evaluate(({ agentId, requestId }) => aegis.host.post(`/agents/${agentId}/history/${requestId}/undo`, {}), { agentId, requestId: history.id });
      await page.waitForFunction(() => !aegis.canvas.board.cards.some(c => c.id === 'trustdoc'));
      pass(`${engineName}: fresh agent document remains undoable after preview and editor open/close`);

      if (engineName === 'chromium') {
        for (const count of [100_000, 200_000]) {
          const text = 'index,amount,department,opened_at,note\n' + Array.from({ length: count }, (_, i) => `${i + 1},${(count - i) * 2},${i % 2 ? 'Sales' : 'Support'},2024-01-03,Row ${i + 1}`).join('\n');
          const path = out(`trust-${count}.csv`); writeFileSync(path, text);
          const largeId = await drop(text, `rows-${count}.csv`); await page.keyboard.press('Enter');
          await page.waitForFunction(count => document.querySelector('.data-viewer-grid')?.getAttribute('aria-rowcount') === String(count + 1) && document.querySelector('.data-viewport')?.getAttribute('aria-busy') === 'false', count);
          const timing = await page.locator('.data-viewport').evaluate(async el => {
            const samples = []; let last = performance.now();
            for (let i = 0; i < 60; i++) { el.scrollTop = el.scrollHeight * (i / 59); await new Promise(requestAnimationFrame); const now = performance.now(); samples.push(now - last); last = now; }
            samples.sort((a, b) => a - b); return { p95ms: samples[Math.floor(samples.length * .95)], maxms: samples.at(-1), mounted: el.querySelectorAll('tbody tr:not(.data-spacer)').length };
          });
          await page.waitForFunction(count => [...document.querySelectorAll('.data-viewer-grid tbody th')].some(el => el.textContent === String(count)), count);
          const rowNumber = await page.locator('.data-viewer-grid tbody th').last().evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
          assert.ok(rowNumber.content <= rowNumber.width, 'six-digit source row numbers fit without clipping');
          assert.match(await page.locator('.data-viewer-grid thead th.is-found').evaluate(el => getComputedStyle(el).backgroundColor), /^rgb\(/, 'the sticky header stays opaque over scrolling rows');
          assert.ok(timing.mounted < 70, JSON.stringify(timing)); assert.ok(timing.p95ms < 100 && timing.maxms < 250, JSON.stringify(timing));
          await page.screenshot({ path: out(`trust-data-${count}-last-row.png`) });
          await page.getByRole('button', { name: 'Sort by amount', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('.data-viewport')?.getAttribute('aria-busy') === 'false');
          assert.equal(await page.locator('.data-viewer-grid tbody tr:not(.data-spacer)').first().locator('td').nth(1).textContent(), '2');
          writeFileSync(out(`trust-data-${count}-timing.json`), JSON.stringify({ count, ...timing }, null, 2));
          pass(`${count.toLocaleString()} source rows, last row reachable, numeric sort, ${timing.mounted} mounted rows, p95 ${timing.p95ms.toFixed(1)} ms`);
          await close(); await apply([{ op: 'delete', id: largeId }]);
        }
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  console.log(`PASS ${checks} production data trust checks`);
} finally { host.kill(); }
