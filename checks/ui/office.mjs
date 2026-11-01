// Office tools in the side editors: sheet ranges, status sums, ribbon sort and column type; slide ribbon and Present.
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['run', 'build'], { cwd: repo + '/app', encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `office-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
  cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-office-')), AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); });
  host.on('exit', code => reject(Error(`Host exited ${code}`)));
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (window.top === window) { localStorage.setItem('aegis:introduction-complete', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); } });
  await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.evaluate(batch => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify(batch), model: { provider: 'fake', modelId: 'fake' } }), demoBatch);
  await page.waitForFunction(() => aegis.canvas.board.cards.length === 9);
  await page.waitForFunction(async () => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).every(a => !a.running));
  await page.keyboard.press('Escape');
  const saved = () => page.waitForFunction(() => document.querySelector('.side-editor [data-saved]')?.textContent === 'Saved', null, { timeout: 15000 });
  const open = async test => { const id = await page.evaluate(src => aegis.canvas.board.cards.find(new Function('c', 'return ' + src)).id, test); await page.evaluate(id => aegis.canvas.select([id]), id); await page.keyboard.press('Enter'); return id; };

  // Sheet: drag a range, read the status sums, then sort by the active column from the ribbon.
  const sheetId = await open("c.kind === 'sheet'");
  const grid = page.locator('.sheet-grid');
  await grid.waitFor();
  const from = await grid.locator('td[data-r="1"][data-c="1"]').boundingBox(), to = await grid.locator('td[data-r="5"][data-c="2"]').boundingBox();
  await page.mouse.move(from.x + 20, from.y + 10); await page.mouse.down(); await page.mouse.move(to.x + 20, to.y + 10, { steps: 6 }); await page.mouse.up();
  assert.equal(await grid.locator('td.in-range').count(), 10, 'a dragged range covers every cell between its corners');
  assert.equal(await grid.locator('thead th.hl').count(), 2); assert.equal(await grid.locator('tbody th.hl').count(), 5);
  const sheet = await page.evaluate(id => aegis.canvas.board.cards.find(c => c.id === id).data, sheetId);
  const values = sheet.rows.flatMap(r => r.cells.slice(1, 3)).map(Number), sum = values.reduce((a, b) => a + b, 0);
  assert.match(await page.locator('.sheet-status [data-stats]').textContent(), new RegExp(`^Sum ${sum}\\s+Average .+\\s+Count ${values.length}$`));
  await page.screenshot({ path: out(`office-sheet-range-${Date.now()}.png`) });
  await grid.locator('td[data-r="1"][data-c="1"]').click();
  await page.getByRole('button', { name: 'Sort descending', exact: true }).click(); await saved();
  const sorted = (await page.evaluate(id => aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(b => b.cards.find(c => c.id === id).data), sheetId)).rows.map(r => Number(r.cells[1]));
  assert.deepEqual(sorted, [...sorted].sort((a, b) => b - a), 'Sort descending orders the active column on the host');
  await grid.locator('td[data-r="2"][data-c="1"]').click(); await page.keyboard.press('Shift+ArrowDown');
  assert.equal(await grid.locator('td.in-range').count(), 2, 'Shift+arrow extends the range');
  console.log('PASS sheet ranges by drag and Shift+arrow, header highlight, status sum/average/count and ribbon sort saved to the host');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // Slides: change the layout from the ribbon, duplicate, then present and step with the keyboard.
  const deckId = await open("c.type === 'deck'");
  await page.locator('.deck-ribbon').waitFor();
  const before = (await page.evaluate(id => aegis.canvas.board.cards.find(c => c.id === id).props.slides.length, deckId));
  await page.getByRole('button', { name: 'Duplicate slide', exact: true }).click(); await saved();
  assert.equal(await page.evaluate(id => aegis.canvas.board.cards.find(c => c.id === id).props.slides.length, deckId), before + 1);
  await page.locator('.deck-ribbon [data-layout], .deck-ribbon button[aria-label="Slide layout"]').click();
  await page.getByRole('menuitemradio', { name: 'Title and text', exact: true }).click(); await saved();
  assert.equal(await page.evaluate(id => aegis.canvas.board.cards.find(c => c.id === id).props.slides[1].layout, deckId), 'text');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const show = page.getByRole('dialog', { name: 'Presenting slides' });
  await show.waitFor();
  const counter = () => show.locator('.deck-present-count').textContent();
  const first = await counter();
  await page.keyboard.press('ArrowRight'); assert.notEqual(await counter(), first);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.elementFromPoint(innerWidth - 20, 20)?.closest('.deck-present') !== null), true, 'Present covers the editor panel');
  await page.screenshot({ path: out(`office-present-${Date.now()}.png`) });
  await page.keyboard.press('Escape'); await show.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.deck-panel').count(), 1, 'Escape leaves Present, not the editor');
  console.log('PASS slide ribbon duplicates and re-lays out slides, Present steps with the keyboard and Escape returns to the editor');
  assert.deepEqual(errors, []);
} finally { await browser.close(); host.kill(); }
