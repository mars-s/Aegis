// PM4 pan priority: real keys and pointer drags, with host-confirmed geometry.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
const repo = new URL('../..', import.meta.url).pathname;
const token = `pan-${process.pid}`, stamp = Date.now();
const ready = (child, pattern) => new Promise((resolve, reject) => {
  let output = '';
  const timer = setTimeout(() => reject(new Error(output || 'Startup timed out')), 20000);
  child.stdout.on('data', data => { output += data; const match = pattern.exec(output); if (match) { clearTimeout(timer); resolve(match[1]); } });
  child.stderr.on('data', data => output += data);
  child.once('exit', () => { clearTimeout(timer); reject(new Error(output)); });
});
let host, web, browser, page;
const observations = [], errors = [];
try {
  host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-pan-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
  const port = await ready(host, /"port":(\d+)/);
  const webPort = 5202 + Number(process.env.AEGIS_PORT_OFFSET || 0);
  web = spawn('npx', ['vite', '--port', String(webPort), '--strictPort'], { cwd: repo + '/app' }); await ready(web, /Local:.*:(\d+)/);
  browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 992 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (window === window.top) localStorage.setItem('aegis:onboarded', '1'); });
  await page.goto(`http://127.0.0.1:${webPort}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.evaluate(() => aegis.apply([
    { op: 'create', newId: 'pannote', type: 'note', text: 'Pan this note', x: 300, y: 250, w: 300, h: 240 },
    { op: 'create', newId: 'pandoc', type: 'doc', text: 'Pan document', x: 750, y: 250, w: 350, h: 280 },
    { op: 'create', newId: 'pangenui', type: 'object', kind: 'stats', text: 'Pan stats', data: { tiles: [{ label: 'Tasks', value: '21', editable: true }] }, x: 1200, y: 250 },
    { op: 'create', newId: 'pangroup', type: 'template-group', text: 'Pan group', x: 1800, y: 250, w: 360, h: 300 },
    { op: 'create', newId: 'panchild', type: 'note', text: 'Grouped work', parent: 'pangroup', x: 1850, y: 340, w: 200, h: 120 },
    { op: 'create', newId: 'panhtml', type: 'object', kind: 'html', text: 'Pan sandbox', data: { html: '<label>Sandbox text<input id="pan-input" value="one"></label>', css: '', js: '', height: 160 }, x: 2400, y: 250 },
  ]));
  await page.locator('.card[data-id="pannote"]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('.card[data-id="pannote"]').count(), 1, await page.locator('#toast').textContent());
  const snapshot = () => page.evaluate(async () => { const b = await aegis.host.get(`/boards/${aegis.canvas.board.id}`); return { cards: b.cards.map(({ id, x, y, w, h, rot }) => ({ id, x, y, w, h, rot })), links: b.links, agents: Object.keys(localStorage).filter(key => key.startsWith('aegis:agent-window:')).sort().map(key => [key, localStorage.getItem(key)]), view: { ...b.view } }; });
  async function pan(locator, name, button = 'left') {
    await page.evaluate(() => document.activeElement?.blur());
    const box = await locator.boundingBox(); assert.ok(box, name);
    const x = box.x + box.width / 2, y = box.y + Math.min(box.height / 2, 90);
    await page.mouse.move(x, y);
    const before = await snapshot();
    if (button === 'left') {
      await page.keyboard.down('Space');
      assert.equal(await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [x, y]), 'grab', `${name}: grab cursor`);
    }
    await page.mouse.down({ button });
    assert.equal(await page.locator('#stage').evaluate(el => getComputedStyle(el).cursor), 'grabbing', `${name}: grabbing cursor`);
    await page.mouse.move(x + 140, y + 80, { steps: 8 });
    await page.mouse.up({ button });
    if (button === 'left') await page.keyboard.up('Space');
    await page.waitForTimeout(700);
    const after = await snapshot(); observations.push({ name, before, after });
    assert.deepEqual(after.cards, before.cards, `${name}: saved card geometry stays unchanged`);
    assert.deepEqual(after.links, before.links, `${name}: saved connectors stay unchanged`);
    assert.deepEqual(after.agents, before.agents, `${name}: agent windows stay in place`);
    assert.equal(after.view.x - before.view.x, 140, `${name}: saved camera x follows drag`);
    assert.equal(after.view.y - before.view.y, 80, `${name}: saved camera y follows drag`);
    assert.equal(after.view.z, before.view.z, `${name}: zoom stays unchanged`);
    console.log(`PASS pan: ${name}, saved geometry unchanged, camera +140,+80`);
  }
  for (const id of ['pannote', 'pandoc', 'pangenui', 'pangroup']) {
    await page.evaluate(id => { aegis.canvas.select([]); aegis.canvas.frameIds([id], 1); }, id);
    await page.waitForTimeout(700);
    await pan(page.locator(`.card[data-id="${id}"]`), id);
    await pan(page.locator(`.card[data-id="${id}"]`), `${id} middle mouse`, 'middle');
  }
  const frame = async (id, selected = false) => {
    await page.evaluate(([id, selected]) => { document.activeElement?.blur(); aegis.canvas.select(selected ? [id] : []); aegis.canvas.frameIds([id], 1); }, [id, selected]);
    await page.waitForTimeout(700);
  };
  await page.evaluate(() => aegis.apply([{ op: 'update', id: 'pannote', set: { props: { locked: true } } }]));
  await frame('pannote'); await pan(page.locator('.card[data-id="pannote"]'), 'locked note');
  await page.evaluate(() => aegis.apply([{ op: 'update', id: 'pannote', set: { props: { locked: false } } }]));
  await frame('pannote', true);
  await pan(page.locator('.selection-resize').last(), 'selection resize handle');
  await frame('pannote', true);
  await pan(page.locator('.rotation-handle'), 'rotation handle');
  await frame('pannote', true);
  await page.locator('#selectionBar .selection-more > summary').click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await pan(page.locator('.card[data-id="pannote"]'), 'Space overrides Connect gesture');
  await page.keyboard.press('Escape');
  await frame('pannote');
  await pan(page.locator('.card[data-id="pannote"] .body'), 'middle mouse over note', 'middle');
  await frame('pangenui');
  await pan(page.locator('.card[data-id="pangenui"]').getByRole('button', { name: 'Tasks', exact: true }), 'generated value control');
  await page.mouse.move(24, 480); await page.locator('[data-tool="draw-ink"]').click();
  await pan(page.locator('#stage'), 'Space overrides drawing tool');
  await page.evaluate(() => aegis.canvas.setTool(null));
  await frame('pannote');
  await pan(page.locator('#stage'), 'Space overrides marquee');
  await frame('panhtml', true);
  await page.frameLocator('.card.kind-html iframe').locator('#pan-input').waitFor();
  await pan(page.locator('.card.kind-html iframe'), 'sandbox frame with Space in parent');
  await frame('pannote');
  const note = page.locator('.card[data-id="pannote"] .body');
  await note.click(); await page.keyboard.press('End');
  const noteText = await note.textContent(), noteView = (await snapshot()).view;
  await page.keyboard.down('Space'); await page.keyboard.up('Space'); await page.keyboard.type('typed');
  assert.equal(await note.textContent(), noteText + ' typed', 'Space types in a focused note');
  assert.deepEqual((await snapshot()).view, noteView, 'typing in a note leaves the camera still');
  assert.equal(await page.locator('#stage').evaluate(el => el.classList.contains('pan-ready')), false);
  await page.keyboard.press('ControlOrMeta+k');
  const prompt = page.locator('#prompt'); await prompt.fill('one');
  const islandView = (await snapshot()).view;
  await page.keyboard.down('Space'); await page.keyboard.up('Space'); await page.keyboard.type('two');
  assert.equal(await prompt.inputValue(), 'one two', 'Space types in the island');
  assert.deepEqual((await snapshot()).view, islandView, 'typing in the island leaves the camera still');
  await page.keyboard.press('Escape');
  await frame('panhtml', true);
  const sandboxInput = page.frameLocator('.card.kind-html iframe').locator('#pan-input');
  await sandboxInput.click(); await sandboxInput.press('End');
  const iframeView = (await snapshot()).view;
  await page.keyboard.down('Space'); await page.keyboard.up('Space'); await page.keyboard.type('two');
  assert.equal(await sandboxInput.inputValue(), 'one two', 'focused sandbox input keeps Space for typing');
  assert.deepEqual((await snapshot()).view, iframeView, 'typing in a sandbox leaves the camera still');
  await page.locator('#stage').focus();
  // Releasing Space over an iframe must restore normal iframe interaction.
  await pan(page.locator('.card.kind-html iframe'), 'parent Space after iframe focus');
  await sandboxInput.click(); assert.equal(await sandboxInput.evaluate(el => el === document.activeElement), true);
  console.log('PASS pan: Space types in note, island and focused sandbox input without panning');
  await page.locator('#stage').focus();
  const [{ id: agentId }] = await page.evaluate(() => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKE ' + JSON.stringify([{ op: 'create', type: 'note', text: 'Agent result', x: 3200, y: 250 }]) }));
  await page.waitForFunction(async id => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).find(a => a.id === id)?.running === false, agentId);
  const agent = page.locator(`.agent-window[data-agent-id="${agentId}"]`);
  await agent.waitFor(); await page.waitForTimeout(700);
  // Recover the agent through its real edge button when it is outside the view.
  if (!await agent.evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right < innerWidth && b.top >= 0 && b.bottom < innerHeight; })) {
    await page.locator(`.agent-edge[data-agent-id="${agentId}"]`).click(); await page.waitForTimeout(700);
  }
  await pan(agent.locator('header'), 'agent window header');
  for (const width of [1440, 1586, 390]) {
    await page.setViewportSize({ width, height: 992 }); await frame('pannote');
    await page.mouse.move(width / 2, 450); await page.keyboard.down('Space');
    await page.screenshot({ path: out(`r5-pan-grab-${width}-${stamp}.png`) });
    await page.keyboard.up('Space');
  }
  // A missed keyup on app blur must not leave a pan modifier latched.
  await page.keyboard.down('Space');
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  assert.equal(await page.locator('#stage').evaluate(el => el.classList.contains('pan-ready')), false);
  await page.keyboard.up('Space');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: out(`r5-pan-cards-${stamp}.png`) });
} catch (error) {
  if (page) await page.screenshot({ path: out(`r5-pan-failure-${stamp}.png`) }).catch(() => {});
  throw error;
} finally {
  writeFileSync(out(`r5-pan-observations-${stamp}.json`), JSON.stringify(observations, null, 2));
  await browser?.close(); web?.kill(); host?.kill();
}
