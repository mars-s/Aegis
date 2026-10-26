// Streaming skeletons: the built UI shows what an agent is writing, saves none of it, and clears it on commit and Stop.
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
const token = `drafts-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
  cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-drafts-ui-')), AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_TPS: '250' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); });
  host.on('exit', code => reject(Error(`Host exited ${code}`)));
});
const browser = await chromium.launch();
const count = page => page.evaluate(() => ({ drafts: document.querySelectorAll('.agent-draft:not(.leaving)').length, writing: document.querySelectorAll('.agent-draft.writing').length, cards: aegis.canvas.board.cards.length, empty: getComputedStyle(document.getElementById('empty')).display }));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (window.top === window) { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); } });
  await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board);
  const start = () => page.evaluate(batch => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify(batch), model: { provider: 'fake', modelId: 'fake' } }), demoBatch);

  await start();
  await page.waitForFunction(() => document.querySelectorAll('.agent-draft:not(.leaving)').length >= 3, null, { timeout: 15000 });
  const mid = await count(page);
  await page.screenshot({ path: out(`agent-drafts-mid-${Date.now()}.png`) });
  assert.equal(mid.cards, 0, 'drafts are previews, never board cards');
  assert.equal(mid.writing, 1, 'exactly one draft is still being written');
  assert.equal(mid.empty, 'none', 'the empty hint hides while an agent fills the board');
  const saved = await page.evaluate(id => aegis.host.get(`/boards/${id}`), await page.evaluate(() => aegis.canvas.board.id));
  assert.equal(saved.cards.length, 0, 'nothing is saved before the batch commits');
  await page.waitForFunction(() => aegis.canvas.board.cards.length === 9, null, { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.agent-draft'), null, { timeout: 2000 });
  console.log('PASS drafts stream in, save nothing, and give way to the committed windows');

  // Stop mid-stream: previews go, and no partial batch lands.
  const fresh = await page.evaluate(() => aegis.host.post('/boards', { name: 'Stop drafts' }));
  await page.evaluate(id => localStorage.setItem('aegis:board', id), fresh.id);
  await page.reload(); await page.waitForFunction(id => window.aegis?.canvas?.board?.id === id, fresh.id);
  const before = (await count(page)).cards;
  await start();
  await page.waitForFunction(() => document.querySelectorAll('.agent-draft:not(.leaving)').length >= 2, null, { timeout: 15000 });
  const running = await page.evaluate(async () => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).find(a => a.running));
  await page.evaluate(id => aegis.host.post(`/agents/${id}/stop`), running.id);
  await page.waitForFunction(() => !document.querySelector('.agent-draft'), null, { timeout: 5000 });
  await page.waitForTimeout(500);
  assert.equal((await count(page)).cards, before, 'a stopped batch adds nothing');
  console.log('PASS Stop clears drafts and commits nothing');


  // Replies render Markdown structure; markup inside model text stays text.
  const reply = 'Grouped into **three** areas:\n\n- Errands\n- Uni <img src=x onerror="window.__xss=1">\n\nAn unclosed **marker stays';
  await page.evaluate(reply => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKEREPLY ' + reply, model: { provider: 'fake', modelId: 'fake' } }), reply);
  await page.keyboard.press('Meta+k');
  const turn = page.locator('#composer .island-turn.assistant .turn-text').last();
  await page.waitForFunction(() => { const t = [...document.querySelectorAll('#composer .island-turn.assistant')].at(-1); return t && !t.classList.contains('streaming') && /marker stays$/.test(t.textContent); }, null, { timeout: 15000 });
  const shape = await turn.evaluate(el => ({ strong: [...el.querySelectorAll('strong')].map(n => n.textContent), items: [...el.querySelectorAll('li')].map(n => n.textContent), images: el.querySelectorAll('img').length, last: el.lastElementChild.textContent, xss: window.__xss ?? 0 }));
  assert.deepEqual(shape.strong, ['three']);
  assert.deepEqual(shape.items, ['Errands', 'Uni <img src=x onerror="window.__xss=1">']);
  assert.equal(shape.images, 0); assert.equal(shape.xss, 0);
  assert.equal(shape.last, 'An unclosed **marker stays');
  await page.waitForTimeout(700);
  await page.screenshot({ path: out(`agent-reply-markdown-${Date.now()}.png`) });
  // The island surface must cover everything the expanded composer shows.
  const cover = await page.evaluate(() => {
    const surface = document.querySelector('.island-surface').getBoundingClientRect();
    return [...document.querySelectorAll('#composer .island-head, #composer .island-turns, #composer textarea')].filter(el => el.offsetParent).map(el => { const r = el.getBoundingClientRect(); return { el: el.className || el.tagName, inside: r.top >= surface.top - 1 && r.bottom <= surface.bottom + 1 }; });
  });
  assert.ok(cover.every(c => c.inside), `composer parts outside its surface: ${JSON.stringify(cover)}`);
  console.log('PASS replies render bold and lists, keep unclosed markers and never inject HTML');

  // Custom UI wears the app palette even when the model writes its own pale, green world.
  await page.keyboard.press('Escape');
  await page.evaluate(() => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKE ' + JSON.stringify([{ op: 'create', type: 'object', kind: 'html', text: 'Foreign palette', x: 0, y: 900, data: {
    html: '<h2>Capacity</h2><button class="on">On</button><div class="meter"><i></i></div><p class="note">Plain</p>',
    css: 'body{background:#f4f6f2;color:#fff}.on{background:#25604c;color:white}.meter{height:8px;background:#333}.meter i{display:block;width:40%;height:8px;background:#30d158}.note{color:rgba(255,255,255,.4)}', js: '' } }]) }));
  const widget = page.frameLocator('.card.kind-html iframe');
  await widget.locator('h2').waitFor({ timeout: 15000 });
  const paint = await widget.locator('body').evaluate(body => {
    const css = el => getComputedStyle(el), root = css(document.documentElement);
    const token = name => { const probe = document.createElement('i'); probe.style.color = `var(${name})`; document.body.append(probe); const value = css(probe).color; probe.remove(); return value; };
    return { body: css(body).backgroundColor, h2: css(document.querySelector('h2')).color, text: token('--text'), meter: css(document.querySelector('.meter i')).backgroundColor, data: token('--data'), note: css(document.querySelector('.note')).color, faint: token('--faint'), card: root.backgroundColor };
  });
  assert.equal(paint.body, 'rgba(0, 0, 0, 0)', 'the page takes the window surface, not its own pale fill');
  assert.equal(paint.h2, paint.text); assert.equal(paint.meter, paint.data); assert.equal(paint.note, paint.faint);
  console.log('PASS Custom UI literal colours resolve to theme tokens inside the sandbox');
  assert.deepEqual(errors, []);
} finally { await browser.close(); host.kill(); }
