// Real host events exercise the canvas animation path. Screenshots sample actual WAAPI frames.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { freeAgentRect } from '../../app/src/features/agents/placement.js';

const exactWidthArea = { x: 8188.749999998775, y: 550, w: 3500, h: 10400 };
const exactWidthLabel = freeAgentRect([], [], exactWidthArea, 775, null, exactWidthArea, 3500);
assert.equal(exactWidthLabel.x, exactWidthArea.x, 'a label fills the available width after a fractional pan without escaping the viewport');

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
  const collision = await page.evaluate(() => [...document.querySelectorAll('.agent-window:not([hidden])')].flatMap(w => {
    const a = w.getBoundingClientRect(); return [...document.querySelectorAll('.card:not([aria-hidden])')].filter(c => {
      const b = c.getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }).map(c => c.dataset.id);
  }));
  assert.deepEqual(collision, [], 'agent windows avoid cards, including cards created later in the run');
  await page.evaluate(() => document.querySelectorAll('.agent-window:not([hidden]) .agent-close').forEach(button => button.click()));
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
try {
  await page.addInitScript(() => { if (window.top === window) localStorage.setItem('aegis:onboarded', '1'); });
  await page.goto(`http://127.0.0.1:${webPort}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board);
  // PM 3: recover a single agent from the left edge with a real centre click.
  const [{ id: recoveryAgent }] = await page.evaluate(() => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKE ' + JSON.stringify([{ op: 'create', type: 'note', text: 'Find this note', x: 0, y: 0 }]) }));
  await page.waitForFunction(async () => aegis.canvas.board.cards.length === 1 && (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).every(a => !a.running));
  await page.waitForTimeout(700);
  await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(500);
  await page.evaluate(() => aegis.canvas.setView({ ...aegis.canvas.view, x: aegis.canvas.view.x + 2200 }));
  await page.waitForTimeout(100);
  const recoveryCue = page.locator(`.agent-edge[data-agent-id="${recoveryAgent}"]`);
  const recoveryBefore = await page.evaluate(() => ({ ...aegis.canvas.view })), recoveryBox = await recoveryCue.boundingBox();
  const recoveryHit = await recoveryCue.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 200), cue: getComputedStyle(el).pointerEvents, parent: getComputedStyle(el.parentElement).pointerEvents, z: getComputedStyle(el.parentElement).zIndex };
  });
  await shot('recovery-single-before');
  await page.evaluate(() => {
    window.recoveryEvents = [];
    window.recoveryListeners = new AbortController();
    for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, e => window.recoveryEvents.push({ type, cue: !!e.target.closest('.agent-edge'), view: { ...aegis.canvas.view } }), { capture: true, signal: window.recoveryListeners.signal });
  });
  await page.mouse.click(recoveryBox.x + recoveryBox.width / 2, recoveryBox.y + recoveryBox.height / 2);
  await page.waitForTimeout(500);
  await shot('recovery-single-after');
  await writeFile(out('recovery-repro.json'), JSON.stringify({ recoveryBefore, recoveryBox, recoveryHit, events: await page.evaluate(() => window.recoveryEvents), after: await page.evaluate(() => ({ ...aegis.canvas.view })) }, null, 2));
  assert.notDeepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), recoveryBefore, `single-agent centre click pans: ${JSON.stringify(recoveryHit)}`);
  assert.equal(recoveryBox.width, 44); assert.equal(recoveryBox.height, 44);
  assert.ok(await page.evaluate(() => window.recoveryEvents.length === 3 && window.recoveryEvents.every(e => e.cue)), 'the cue owns pointer-down, pointer-up and click above the grid');
  await page.evaluate(() => { window.recoveryListeners.abort(); delete window.recoveryListeners; delete window.recoveryEvents; });
  assert.equal(await recoveryCue.isVisible(), false);
  await page.evaluate(() => aegis.canvas.setView({ ...aegis.canvas.view, x: aegis.canvas.view.x + 2200 }));
  await recoveryCue.waitFor({ state: 'visible' });
  await recoveryCue.focus(); await page.keyboard.press('Enter');
  assert.ok(await page.evaluate(id => {
    const w = JSON.parse(localStorage.getItem(`aegis:agent-window:${id}`)), v = aegis.canvas.view;
    return Math.abs(v.x + (w.x + 170) * v.z - innerWidth / 2) < 1 && Math.abs(v.y + (w.y + 22) * v.z - innerHeight / 2) < 1;
  }, recoveryAgent), 'Enter centres the agent immediately without a glide');
  await recoveryCue.waitFor({ state: 'hidden' });
  assert.equal(await page.locator(`.agent-window[data-agent-id="${recoveryAgent}"] .agent-window-toggle`).getAttribute('aria-expanded'), 'false');
  await shot('recovery-single-keyboard');
  console.log('PASS single-agent recovery: real page.mouse.click at the 44px cue centre keeps pointer-down and pointer-up above the grid; Enter also pans without expanding');
  await page.locator(`.agent-window[data-agent-id="${recoveryAgent}"] .agent-close`).click();
  await page.evaluate(async () => {
    await aegis.host.post(`/boards/${aegis.canvas.board.id}/batch`, { commands: [{ op: 'delete', ids: aegis.canvas.board.cards.map(c => c.id) }] });
    aegis.canvas.setBoard(await aegis.host.get(`/boards/${aegis.canvas.board.id}`));
  });
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
  const strokes = await page.evaluate(() => {
    const results = [];
    for (const style of ['solid', 'dashed', 'dotted']) {
      aegis.canvas.ring(['motion00'], '#e5a93b', 4000, `Agent ${style}`, undefined, style);
      document.querySelector('.agent-line').getAnimations({ subtree: true }).forEach(a => a.finish());
      results.push({ style, strokes: [...document.querySelectorAll('.agent-line path, .agent-line .station')].map(el => getComputedStyle(el).stroke), dot: getComputedStyle(document.querySelector('.agent-line .origin')).fill,
        dash: getComputedStyle(document.querySelector('.agent-line .trunk')).strokeDasharray });
    }
    return results;
  });
  for (const result of strokes) { assert.ok(result.strokes.length > 0); assert.ok(result.strokes.every(c => c === 'rgb(63, 141, 253)')); assert.equal(result.dot, 'rgb(63, 141, 253)'); }
  assert.equal(new Set(strokes.map(s => s.dash)).size, 3, 'names and line styles distinguish agents');
  console.log('PASS all agent strokes and dots compute to rgb(63, 141, 253), with solid, dashed and dotted identities');

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
  assert.equal(fit.length, demoBatch.filter(c => c.type === 'object').length);
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
  // Round 3 agents: Fit includes spatial windows on both PM layout fixtures.
  await page.setViewportSize({ width: 1440, height: 992 });
  // A pending result must reveal Show even with Follow off and the pointer away.
  await page.locator('#showChip').evaluate(button => button.click());
  await page.evaluate(() => { document.activeElement?.blur(); aegis.canvas.select([]); });
  await page.mouse.move(700, 800);
  await page.keyboard.press('Shift+F');
  await page.waitForFunction(() => document.querySelector('.bar-right').classList.contains('chrome-visible') === false);
  assert.equal(await page.locator('#followBtn').getAttribute('aria-checked'), 'false');
  for (const count of [12, 25]) {
    await page.evaluate(async count => {
      document.querySelectorAll('.agent-window:not([hidden]) .agent-close').forEach(b => b.click());
      const commands = [{ op: 'delete', ids: aegis.canvas.board.cards.map(c => c.id) }, ...Array.from({ length: count }, (_, i) => ({ op: 'create', type: 'note', newId: `fit${String(i).padStart(3, '0')}`, text: `Plan ${i + 1}`, x: i % 5 * 260, y: Math.floor(i / 5) * 180, w: 220, h: 120 }))];
      await aegis.host.post(`/boards/${aegis.canvas.board.id}/batch`, { commands });
      aegis.canvas.setBoard(await aegis.host.get(`/boards/${aegis.canvas.board.id}`)); aegis.canvas.fit();
    }, count);
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    const [{ id: layoutAgent }] = await page.evaluate(count => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS ' + JSON.stringify([['board_apply', { commands: [...Array.from({ length: count }, (_, i) => ({ op: 'move', id: `fit${String(i).padStart(3, '0')}`, x: i % 5 * 260 + 400, y: Math.floor(i / 5) * 180 + 200 })), { op: 'focus', ids: Array.from({ length: count }, (_, i) => `fit${String(i).padStart(3, '0')}`) }] }]]) }), count);
    await page.waitForFunction(async id => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).find(a => a.id === id)?.history[0]?.canUndo, layoutAgent);
    await settle();
    const win = page.locator(`.agent-window[data-agent-id="${layoutAgent}"]`);
    const assertInView = async label => {
      const rect = await win.boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 1440 && rect.y + rect.height <= 992, `${label}: agent window fits the viewport: ${JSON.stringify(rect)}`);
    };
    await page.locator('#showChip').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#showChip').textContent(), 'Show changes');
    assert.match(await page.locator('#showChip').getAttribute('aria-description'), new RegExp(`^Show what Agent \\d+ changed: ${count} windows$`));
    await page.waitForTimeout(1400);
    await page.waitForFunction(() => { const style = getComputedStyle(document.querySelector('.bar-right')); return style.pointerEvents === 'auto' && style.opacity === '1'; });
    assert.equal(await page.locator('.bar-right').evaluate(el => getComputedStyle(el).opacity), '1', 'pending Show stays visible without an edge reveal');
    await shot(`pending-show-${count}-notes`);
    if (count === 25) { await page.locator('#showChip').focus(); await page.keyboard.press('Enter'); }
    else await page.locator('#showChip').click();
    await page.waitForTimeout(500); await assertInView(`Framed result with ${count} notes`);
    await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(500);
    await assertInView(`Fit with ${count} notes`);
    assert.equal(await win.locator('.agent-window-toggle').getAttribute('aria-expanded'), 'false');
    await shot(`fit-${count}-notes`);
    // PM 3.6: a distant spatial header reveals readable identity without covering cards.
    const identity = page.locator('#agentIdentity'), toggle = win.locator('.agent-window-toggle');
    const identityViews = count === 25 ? [1440, 1586, 390] : [1440];
    for (const width of identityViews) {
      await page.setViewportSize({ width, height: 992 });
      await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(500);
      const fitView = await page.evaluate(() => ({ ...aegis.canvas.view }));
      for (const zoom of [fitView.z, .05]) {
        await page.evaluate(z => { const at = aegis.canvas.centre(); aegis.canvas.setView({ x: innerWidth / 2 - at.x * z, y: innerHeight / 2 - at.y * z, z }); }, zoom);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const spatial = await win.getAttribute('style'), camera = await page.evaluate(() => ({ ...aegis.canvas.view }));
        const target = await toggle.boundingBox();
        await page.mouse.move(700, 900); await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
        await identity.waitFor({ state: 'visible' });
        assert.match(await identity.textContent(), /Agent \d+ · Board assistant/);
        assert.ok(await identity.locator('p').evaluateAll(nodes => nodes.every(el => parseFloat(getComputedStyle(el).fontSize) >= 12 && el.scrollWidth <= el.clientWidth)), 'identity and status stay readable at Fit and 5%');
        const overlaps = await identity.evaluate(el => {
          const r = el.getBoundingClientRect(), z = aegis.canvas.view.z;
          return aegis.canvas.board.cards.filter(c => { const p = aegis.canvas.worldToScreen(c.x, c.y); return p.x < r.right && p.x + c.w * z > r.left && p.y < r.bottom && p.y + c.h * z > r.top; }).map(c => c.id);
        });
        assert.deepEqual(overlaps, [], 'readable identity does not cover cards');
        assert.equal(await win.getAttribute('style'), spatial, 'the agent window stays at its spatial position');
        assert.deepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), camera);
        await shot(`identity-${count}-${width}-${zoom === .05 ? '5-percent' : 'fit'}`);
        await page.mouse.move(700, 900); await page.locator('#stage').focus(); await toggle.focus();
        await identity.waitFor({ state: 'visible' });
        assert.equal(await toggle.getAttribute('aria-describedby'), 'agentIdentity', 'keyboard focus has the same readable identity');
        await page.keyboard.press('Escape'); assert.equal(await identity.isVisible(), false);
      }
    }
    await page.setViewportSize({ width: 1440, height: 992 });
    await page.locator('#stage').focus(); await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(500);
    await page.evaluate(() => aegis.canvas.setView({ ...aegis.canvas.view, x: aegis.canvas.view.x - 5000 }, false));
    const edge = page.locator(`.agent-edge[data-agent-id="${layoutAgent}"]`);
    await edge.waitFor({ state: 'visible' });
    assert.equal(await edge.evaluate(el => getComputedStyle(el).color), 'rgb(63, 141, 253)');
    const pinned = await edge.boundingBox(); assert.ok(pinned.x >= 0 && pinned.x + pinned.width <= 1440 && pinned.y >= 0 && pinned.y + pinned.height <= 992);
    await shot(`edge-${count}-notes`);
    const edgeBefore = await page.evaluate(() => ({ ...aegis.canvas.view }));
    const hit = await edge.evaluate(el => {
      const r = el.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { target: target?.outerHTML.slice(0, 200), cue: getComputedStyle(el).pointerEvents, container: getComputedStyle(el.parentElement).pointerEvents, z: getComputedStyle(el.parentElement).zIndex };
    });
    await page.mouse.click(pinned.x + pinned.width / 2, pinned.y + pinned.height / 2);
    await page.waitForTimeout(500);
    assert.notDeepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), edgeBefore, `real centre click pans to agent: ${JSON.stringify(hit)}`);
    await assertInView(`Edge return with ${count} notes`);
    assert.equal(await win.locator('.agent-window-toggle').getAttribute('aria-expanded'), 'false', 'edge navigation preserves collapse');
    assert.equal(await edge.isVisible(), false);
    const openAt = await win.locator('.agent-window-toggle').boundingBox();
    await page.mouse.click(openAt.x + openAt.width / 2, openAt.y + openAt.height / 2);
    assert.equal(await identity.isVisible(), false, 'expanding with the mouse dismisses the identity label');
    await win.locator('.agent-history-details > summary').click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(500);
    await assertInView(`Expanded history Fit with ${count} notes`);
    assert.ok(await win.locator('.agent-history time').evaluate(el => { const r = el.getBoundingClientRect(), body = el.closest('.agent-window-body').getBoundingClientRect(); return r.top >= body.top && r.bottom <= body.bottom; }), 'time stays visible above the expanded change list');
    await shot(`fit-${count}-expanded`);
    await win.locator('.agent-close').click(); assert.equal(await edge.isVisible(), false);
  }
  console.log('PASS Fit keeps agent windows inside the viewport at 12 and 25 notes; real centre clicks on blue edge indicators pan back without expanding; hover and focus show 12px+ identity at Fit and 5% without covering cards at 1440, 1586 and 390');
  assert.deepEqual(errors, []);
  console.log('PASS agent diffs without reloads, 320ms moves, 30ms stagger, 12-card cap, interruption, pointer handover, enter/exit, reduced motion, local edits and fitted demo at 1440, 1586 and 390');
  console.log(JSON.stringify({ screenshots, fit }));
} catch (error) { await shot('motion-failure'); console.error(error); console.error('page errors', errors); process.exitCode = 1; }
finally { await browser.close(); host.kill(); web.kill(); await rm(data, { recursive: true, force: true }); }
