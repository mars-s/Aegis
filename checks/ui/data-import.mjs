// Drop a CSV, then ask from the plain composer with nothing selected: the agent finds the dataset and queries it.
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['run', 'build'], { cwd: repo + '/app', encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `data-${process.pid}`, data = mkdtempSync(join(tmpdir(), 'aegis-data-ui-')), capture = join(data, 'model-input.jsonl');
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
  cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_CAPTURE_INPUT: capture }, stdio: ['ignore', 'pipe', 'pipe'],
});
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); });
  host.on('exit', code => reject(Error(`Host exited ${code}`)));
});
// A fictional file with a quoted comma, a blank and a date column.
const csv = 'amount,department,opened_at,note\n120,Sales,2024-01-03 09:00:00,"Laptop, spare"\n80,Support,2024-01-20 10:00:00,\n200,Sales,2024-02-02 11:00:00,Desk\n';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (window.top === window) { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:model', 'fake|fake'); } });
  await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board && [...document.querySelectorAll('#model option')].some(o => o.value === 'fake|fake'));
  const transfer = await page.evaluateHandle(text => { const d = new DataTransfer(); d.items.add(new File([text], 'expenses.csv', { type: 'text/csv' })); return d; }, csv);
  await page.dispatchEvent('#stage', 'drop', { dataTransfer: transfer, clientX: 600, clientY: 400 });
  const card = page.locator('.card.dataset');
  await card.waitFor();
  assert.match(await card.locator('.data-size').textContent(), /^3 rows · 4 columns$/);
  assert.deepEqual(await card.locator('.data-col b').allTextContents(), ['#', 'Aa', '◷', 'Aa']);
  assert.match(await card.locator('.data-col', { hasText: 'note' }).textContent(), /1 blank/);
  assert.equal(await card.locator('tbody td').nth(3).textContent(), 'Laptop, spare');
  const dataset = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'dataset'));
  assert.match(dataset.props.src, /^asset:[a-f0-9]{32}\.csv$/);
  await page.screenshot({ path: out(`data-import-${Date.now()}.png`) });
  console.log('PASS a dropped CSV becomes a dataset window with kinds, gaps and a preview, stored whole');

  // The normal composer: clear the selection, Cmd+K, type, send. The fake model queries the dataset by id.
  await page.evaluate(() => { aegis.canvas.select([]); document.activeElement?.blur(); });
  await page.keyboard.press('Meta+k');
  await page.locator('#composer.open').waitFor();
  assert.equal(await page.locator('#islandContext').isHidden(), true, 'nothing is pinned on the plain path');
  const script = [['data_query', { dataset: dataset.id, groupBy: 'department', measures: [{ op: 'sum', column: 'amount' }] }]];
  await page.locator('#prompt').fill('FAKETOOLS ' + JSON.stringify(script));
  await page.locator('#prompt').press('Enter');
  let result;
  for (let i = 0; i < 100 && !result; i++) {
    await page.waitForTimeout(100);
    let lines = ''; try { lines = readFileSync(capture, 'utf8'); } catch {}
    const tool = lines.split('\n').filter(Boolean).map(l => JSON.parse(l)).flatMap(c => c.messages).find(m => m.role === 'toolResult' && m.toolName === 'data_query');
    if (tool) result = JSON.parse(tool.content.find(c => c.type === 'text').text);
  }
  assert.ok(result, 'the plain request reached data_query');
  assert.deepEqual(result.rows, [{ department: 'Sales', sum_amount: 320 }, { department: 'Support', sum_amount: 80 }]);
  const first = readFileSync(capture, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))[0].messages.find(m => m.role === 'user');
  const context = first.content.map(c => c.text).join('\n');
  assert.doesNotMatch(context, /Work on the selected cards/, 'no selection was sent');
  assert.match(context, /"type":"dataset"[^}]*"dataset":\{"rows":3,"columns":\["amount:number","department:text","opened_at:date","note:text \(1 blank\)"\]/);
  console.log('PASS with nothing selected, the board summary names the dataset and the agent queries every row');
  assert.deepEqual(errors, []);
} finally { await browser.close(); host.kill(); }
