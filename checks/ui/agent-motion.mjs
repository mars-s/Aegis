// Real host events exercise the canvas animation path. Screenshots sample actual WAAPI frames.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { demoBatch } from '../demo-batch.mjs';

const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'motion-' + process.pid;
const data = await mkdtemp(join(tmpdir(), 'aegis-motion-')), stamp = Date.now();
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: root + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_DELAY_MS: '60' }, stdio: ['ignore', 'pipe', 'pipe'] });
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise((resolve, reject) => { host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); }); host.once('exit', reject); });
const webPort = 5200 + Number(process.env.AEGIS_PORT_OFFSET || 0);
const web = spawn('npx', ['vite', '--port', String(webPort), '--strictPort'], { cwd: root + '/app', stdio: 'pipe' });
await new Promise((resolve, reject) => { web.stdout.on('data', d => { if (/Local/.test(String(d))) resolve(); }); web.once('exit', reject); });
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1440, height: 992 } });
const errors = [], screenshots = [];
page.on('pageerror', e => errors.push(e.message));
const shot = async name => { const path = out(`speed-${name}-${stamp}.png`); await page.screenshot({ path, animations: 'allow' }); screenshots.push(path); };
const cardAnimations = () => page.evaluate(() => document.getAnimations().filter(a => a.id === 'aegis-agent-card').map(a => ({ id: a.effect.target.dataset.id ?? 'exit', duration: a.effect.getTiming().duration, delay: a.effect.getTiming().delay, frames: a.effect.getKeyframes() })));
const settle = () => page.evaluate(async () => { document.getAnimations().filter(a => a.id === 'aegis-agent-card').forEach(a => a.finish()); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
async function batch(commands) {
  const rev = await page.evaluate(async commands => {
    const rev = aegis.canvas.board.rev;
    await aegis.host.post('/agents', { boardId: aegis.canvas.board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS ' + JSON.stringify([['board_apply', { commands }]]) });
    return rev + 1;
  }, commands);
  await page.waitForFunction(rev => aegis.canvas.board.rev >= rev, rev);
  await page.evaluate(() => document.querySelectorAll('.agent-window:not([hidden]) .agent-close').forEach(button => button.click()));
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
try {
  await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  await page.goto(`http://127.0.0.1:${webPort}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.evaluate(async () => {
    const commands = Array.from({ length: 18 }, (_, i) => ({ op: 'create', type: 'note', newId: `motion${String(i).padStart(2, '0')}`, text: `Step ${i + 1}`, x: 40 + i % 6 * 200, y: 40 + Math.floor(i / 6) * 150, w: 170, h: 96 }));
    await aegis.host.post(`/boards/${aegis.canvas.board.id}/batch`, { commands });
    aegis.canvas.setBoard(await aegis.host.get(`/boards/${aegis.canvas.board.id}`));
    aegis.canvas.setView({ x: 20, y: 90, z: 1 }, false);
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  let reads = 0;
  const id = await page.evaluate(() => aegis.canvas.board.id);
  page.on('request', r => { if (r.method() === 'GET' && new URL(r.url()).pathname === `/boards/${id}`) reads++; });
  await batch(Array.from({ length: 18 }, (_, i) => ({ op: 'move', id: `motion${String(i).padStart(2, '0')}`, x: 80 + i % 6 * 200, y: 130 + Math.floor(i / 6) * 150 })));
  let animations = await cardAnimations();
  assert.equal(animations.length, 12); assert.ok(animations.every(a => a.duration === 320));
  assert.deepEqual(animations.map(a => a.delay).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i * 30));
  assert.equal(reads, 0, 'normal agent events must not reload the board');
  await page.evaluate(() => document.getAnimations().filter(a => a.id === 'aegis-agent-card').forEach(a => { a.pause(); a.currentTime = 0; }));
  await shot('agent-frame-0');
  await page.evaluate(() => document.getAnimations().filter(a => a.id === 'aegis-agent-card').forEach(a => a.currentTime = 160));
  await shot('agent-frame-160');
  await page.evaluate(() => document.getAnimations().filter(a => a.id === 'aegis-agent-card').forEach(a => a.currentTime = 320));
  await shot('agent-frame-320');
  await settle();

  await batch([{ op: 'move', id: 'motion00', x: 500, y: 110 }]);
  const live = await page.evaluate(() => {
    const el = aegis.canvas.mountedEl('motion00'), a = el.getAnimations().find(a => a.id === 'aegis-agent-card'); a.pause(); a.currentTime = 90;
    return getComputedStyle(el).transform;
  });
  await batch([{ op: 'move', id: 'motion00', x: 150, y: 40 }]);
  const start = (await cardAnimations()).find(a => a.id === 'motion00').frames[0].transform;
  assert.equal(start, live, 'retarget starts from the current on-screen transform');
  await settle();

  await batch([{ op: 'move', id: 'motion00', x: 520, y: 40 }]);
  await page.evaluate(() => { const a = aegis.canvas.mountedEl('motion00').getAnimations().find(a => a.id === 'aegis-agent-card'); a.pause(); a.currentTime = 100; });
  const box = await page.locator('.card[data-id="motion00"]').boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5); await page.mouse.down(); await page.mouse.move(box.x + 55, box.y + 25); await page.mouse.up();
  assert.equal((await cardAnimations()).length, 0, 'a person takes control immediately');
  const dragged = await page.locator('.card[data-id="motion00"]').boundingBox();
  assert.ok(Math.abs(dragged.x - box.x - 50) < 2, 'drag tracks pointer from the visible position');
  await page.waitForFunction(() => document.getElementById('saveState').textContent === 'saved');

  await batch([{ op: 'create', type: 'note', text: 'A new step', newId: 'newmotion', x: 100, y: 600 }, { op: 'delete', id: 'motion17' }]);
  animations = await cardAnimations();
  assert.ok(animations.some(a => a.id === 'newmotion' && a.duration === 240 && a.frames[0].opacity === '0' && a.frames[0].transform.includes('0.96')));
  assert.ok(animations.some(a => a.id === 'exit' && a.duration === 180 && a.frames.at(-1).opacity === '0'));
  await shot('agent-enter-exit'); await settle();
  assert.equal(await page.locator('.card[aria-hidden="true"]').count(), 0, 'exit releases its renderer and DOM');

  await batch([{ op: 'move', id: 'motion01', x: 90, y: 110 }]);
  await page.evaluate(() => document.body.classList.add('motion-off'));
  assert.equal((await cardAnimations()).length, 0, 'changing Motion off settles running animations');
  await batch([{ op: 'move', id: 'motion01', x: 110, y: 110 }]);
  assert.equal((await cardAnimations()).length, 0);
  await page.evaluate(() => document.body.classList.remove('motion-off'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await batch([{ op: 'move', id: 'motion01', x: 130, y: 110 }]);
  assert.equal((await cardAnimations()).length, 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => aegis.apply([{ op: 'move', id: 'motion02', x: 200, y: 100 }]));
  assert.equal((await cardAnimations()).length, 0, 'local board edits stay instant');
  await page.waitForFunction(() => document.getElementById('saveState').textContent === 'saved');

  await batch([{ op: 'delete', ids: await page.evaluate(() => aegis.canvas.board.cards.map(c => c.id)) }, ...demoBatch]);
  await settle(); await page.waitForTimeout(500);
  const fit = await page.evaluate(() => [...document.querySelectorAll('.card.object')].map(el => {
    const content = el.querySelector('.content'), child = content.firstElementChild;
    return { kind: el.className, id: el.dataset.id, width: content.clientWidth, scrollWidth: content.scrollWidth, height: content.clientHeight, scrollHeight: content.scrollHeight, childHeight: child.getBoundingClientRect().height / aegis.canvas.view.z };
  }));
  assert.equal(fit.length, 5);
  await writeFile(out(`speed-demo-fit-${stamp}.json`), JSON.stringify(fit, null, 2));
  for (const item of fit) {
    assert.ok(item.scrollHeight <= item.height + 1, `${item.kind}: vertical clipping ${JSON.stringify(item)}`);
    assert.ok(item.scrollWidth <= item.width + 1, `${item.kind}: horizontal clipping ${JSON.stringify(item)}`);
  }
  const diagram = fit.find(c => c.kind.includes('kind-diagram'));
  assert.ok(diagram.height - diagram.childHeight < 45, 'short diagram leaves no large empty area');
  await shot('demo-1440');
  await page.setViewportSize({ width: 1586, height: 992 }); await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(500); await shot('demo-1586');
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(500); await shot('demo-phone-390');
  assert.deepEqual(errors, []);
  console.log('PASS agent diffs without reloads, 320ms moves, 30ms stagger, 12-card cap, interruption, pointer handover, enter/exit, reduced motion, local edits and fitted demo at 1440, 1586 and 390');
  console.log(JSON.stringify({ screenshots, fit }));
} catch (error) { await shot('motion-failure'); console.error(error); console.error('page errors', errors); process.exitCode = 1; }
finally { await browser.close(); host.kill(); web.kill(); await rm(data, { recursive: true, force: true }); }
