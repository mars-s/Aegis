// An agent batch written only from the board_apply guide must render every feature type in the real UI.
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import assert from 'node:assert/strict';
const PORT_OFFSET = Number(process.env.AEGIS_PORT_OFFSET || 0); // separate worktrees can run checks at once
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'types-' + process.pid;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-types-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise((ok, no) => { host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) ok(m[1]); }); host.on('exit', no); });
const vite = spawn('npx', ['vite', '--port', String(5188 + PORT_OFFSET), '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' });
await new Promise((ok, no) => { vite.stdout.on('data', d => { if (/Local/.test(String(d))) ok(); }); vite.on('exit', no); });
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => localStorage.setItem('aegis:introduction-complete', '1'));
const errors = []; page.on('pageerror', e => errors.push(e.message));
const batch = [
  { op: 'create', type: 'frame', text: 'Login', x: 0, y: 0, w: 393, h: 852, props: { device: 'iPhone', radius: 44, fill: '#ffffff' }, ref: 'f' },
  { op: 'create', type: 'text', text: 'Welcome back', parent: '$f', x: 32, y: 120, w: 300, h: 40, props: { font: 'Arial', size: 28, weight: 700, ink: '#18181b' } },
  { op: 'create', type: 'box', parent: '$f', x: 32, y: 700, w: 329, h: 52, props: { fill: '#2563eb', radius: 12 } },
  { op: 'create', type: 'icon', parent: '$f', x: 32, y: 60, w: 32, h: 32, props: { name: 'menu', ink: '#18181b' } },
  { op: 'create', type: 'doc', text: 'Login spec', x: 460, y: 0, props: { body: '# Login\n\n- Email field\n- **Continue** button' } },
  { op: 'create', type: 'shape', text: 'Start', x: 460, y: 120, props: { shape: 'diamond', fill: '#aed3ff', stroke: 'ink', sw: 2 } },
  { op: 'create', type: 'path', x: 700, y: 120, w: 200, h: 100, props: { points: [{ x: 0, y: 100 }, { x: 100, y: 0 }, { x: 200, y: 100 }], ow: 200, oh: 100, stroke: '#e11d48', sw: 3 } },
  { op: 'create', type: 'stamp', x: 940, y: 120, props: { emoji: '🚀' } },
  { op: 'create', type: 'swatch', x: 460, y: 300, props: { hex: '#2563eb', label: 'Brand blue' } },
  { op: 'create', type: 'note', text: 'Member A', x: 700, y: 340, ref: 'a' },
  { op: 'create', type: 'note', text: 'Member B', x: 700, y: 460, ref: 'b' },
  { op: 'create', type: 'coll', text: 'Ideas', x: 680, y: 300, props: { kids: ['$a', '$b'] }, ref: 'c' },

];
try {
  await page.goto(`http://127.0.0.1:${5188 + PORT_OFFSET}/?port=${port}&token=${token}`); await page.waitForFunction(() => window.aegis?.canvas?.board);
  const boardId = await page.evaluate(() => aegis.canvas.board.id);
  const r = await page.evaluate(([boardId, brief]) => aegis.host.post('/agents', { boardId, brief, model: { provider: 'fake', modelId: 'fake' }, count: 1 }), [boardId, 'FAKE ' + JSON.stringify(batch)]);
  assert.ok(r[0]?.id, JSON.stringify(r));
  await page.waitForTimeout(4000); const dbg = await page.evaluate(([id]) => aegis.host.get(`/agents?board=${id}`), [boardId]); const hb = await page.evaluate(([id]) => aegis.host.get(`/boards/${id}`), [boardId]); console.log("host cards", hb.cards.length, "ui cards", await page.evaluate(() => aegis.canvas.board.cards.length)); await page.waitForFunction(() => aegis.canvas.board.cards.length >= 12, null, { timeout: 20000 });
  const board = await page.evaluate(() => aegis.canvas.board);
  const by = t => board.cards.filter(c => c.type === t);
  const frame = by('frame')[0]; assert.ok(frame);
  for (const t of ['text', 'box', 'icon']) assert.equal(by(t)[0].parent, frame.id, t + ' parent');
  const coll = by('coll')[0]; assert.equal(coll.props.kids.length, 2); assert.ok(!coll.props.kids.some(k => k.startsWith('$')), 'refs resolved in props: ' + coll.props.kids);
  await page.evaluate(() => aegis.canvas.frameIds(aegis.canvas.board.cards.map(c => c.id))); await page.waitForTimeout(600);
  const check = async (sel, what) => assert.ok(await page.locator(sel).first().isVisible(), what);
  await check('.card[data-type="frame"]', 'frame'); await check('.card[data-type="icon"] .wf-icon', 'icon glyph');
  assert.equal(await page.locator('.card[data-type="icon"] .wf-icon').textContent(), 'menu');
  await check('.card[data-type="shape"] svg', 'shape art'); await check('.card[data-type="path"] svg path', 'path art'); await check('.card[data-type="stamp"]', 'stamp');
  assert.match(await page.locator('.card[data-type="stamp"]').textContent(), /🚀/);
  await check('.card[data-type="swatch"]', 'swatch'); await check('.card[data-type="doc"]', 'doc pill');
  await page.waitForTimeout(1200);
  const stampBox = await page.locator('.card[data-type="stamp"]').boundingBox();
  await page.screenshot({ path: out('agent-stamp.png'), clip: { x: stampBox.x - 20, y: stampBox.y - 20, width: stampBox.width + 40, height: stampBox.height + 40 } });
  await page.screenshot({ path: out('agent-types.png') });
  await page.locator('.card[data-type="doc"] .doc-strip').dblclick({ position: { x: 40, y: 18 } }); await page.locator('.ProseMirror strong').filter({ hasText: 'Continue' }).waitFor();
  assert.ok(await page.locator('.ProseMirror strong').filter({ hasText: 'Continue' }).isVisible(), 'Markdown body opens as rich text');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: out('agent-types.png') });
  assert.deepEqual(errors, []);
  console.log('PASS agent-made frame with children, doc from Markdown, shape, path, stamp, swatch and collection all render');
} catch (e) { console.error(e); console.error('errors', errors); process.exitCode = 1; await page.screenshot({ path: out('agent-types-fail.png') }); }
finally { await browser.close(); host.kill(); vite.kill(); }
