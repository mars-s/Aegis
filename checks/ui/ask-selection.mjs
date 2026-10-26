// Select windows, press the selection bar's star, and the request carries exactly those windows as context.
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
const token = `ask-${process.pid}`, data = mkdtempSync(join(tmpdir(), 'aegis-ask-')), capture = join(data, 'model-input.jsonl');
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
  cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_CAPTURE_INPUT: capture }, stdio: ['ignore', 'pipe', 'pipe'],
});
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); });
  host.on('exit', code => reject(Error(`Host exited ${code}`)));
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:model', 'fake|fake'); });
  await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board && [...document.querySelectorAll('#model option')].some(o => o.value === 'fake|fake'));
  await page.evaluate(() => aegis.apply([0, 1, 2, 3].map(i => ({ op: 'create', type: 'note', newId: `asknote${i}`, text: `Idea ${i}`, x: i * 260, y: 0 }))));
  await page.waitForFunction(() => aegis.canvas.board.cards.length === 4);
  const chosen = ['asknote0', 'asknote2', 'asknote3'];
  await page.evaluate(ids => { aegis.canvas.fit(); aegis.canvas.select(ids); }, chosen);
  const star = page.locator('#selectionBar .selection-ai');
  await star.waitFor();
  assert.equal(await star.getAttribute('aria-label'), 'Ask AI about 3 windows');
  await page.screenshot({ path: out(`ask-selection-bar-${Date.now()}.png`) });
  await star.click();
  const chip = page.locator('#islandContext');
  await chip.waitFor();
  assert.match(await chip.textContent(), /3 windows · Idea 0, Idea 2/);
  assert.match(await page.locator('#prompt').getAttribute('placeholder'), /these 3 windows/);
  // Changing the canvas selection after pinning does not change what the request is about.
  await page.evaluate(() => aegis.canvas.select(['asknote1']));
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.card.in-context')].map(el => el.dataset.id).sort()), chosen, 'pinned windows stay marked after the selection moves');
  await page.locator('#prompt').fill('Group these');
  await page.waitForTimeout(300);
  await page.screenshot({ path: out(`ask-selection-chip-${Date.now()}.png`) });
  await page.locator('#prompt').press('Enter');
  await page.waitForFunction(() => document.getElementById('islandContext').hidden && !document.querySelector('.card.in-context'));
  // The fake model receives the same context parts as a real one.
  let line = '';
  for (let i = 0; i < 50 && !line; i++) { await page.waitForTimeout(100); try { line = readFileSync(capture, 'utf8').split('\n').find(Boolean) ?? ''; } catch {} }
  const first = JSON.parse(line).messages.find(m => m.role === 'user');
  const parts = first.content.map(c => c.text);
  assert.equal(parts[0], 'Group these');
  assert.equal(parts[1], `Work on the selected cards: ${chosen.join(', ')}.`);
  console.log('PASS the selection star pins exactly the selected windows and sends them with the request');

  // Cmd+K with windows selected pins them too; the chip's clear button drops them.
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.activeElement?.blur(); aegis.canvas.select(['asknote1', 'asknote2']); });
  await page.keyboard.press('Meta+k');
  await chip.waitFor();
  assert.match(await chip.textContent(), /2 windows/);
  await chip.locator('.context-clear').click();
  assert.equal(await chip.isHidden(), true);
  console.log('PASS Cmd+K asks about the selection, and the chip can be cleared');
  assert.deepEqual(errors, []);
} finally { await browser.close(); host.kill(); }
