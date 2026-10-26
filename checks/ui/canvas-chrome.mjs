// Exercise the shipped canvas chrome in Chromium and the macOS WebKit engine.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { demoBatch } from '../demo-batch.mjs';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `canvas-chrome-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-canvas-chrome-')), AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
const port = await new Promise((resolve, reject) => {
  let output = '';
  const timer = setTimeout(() => reject(Error(output || 'Host startup timed out')), 20000);
  host.stdout.on('data', bytes => { output += bytes; const match = /"port":(\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]); } });
  host.stderr.on('data', bytes => output += bytes);
  host.once('exit', code => { clearTimeout(timer); reject(Error(`Host exited ${code}: ${output}`)); });
});
const engines = [['chromium', chromium], ['webkit', playwright.webkit]];
try {
  for (const [engineName, engine] of engines) {
    const browser = await engine.launch();
    const page = await browser.newPage({ viewport: { width: 1586, height: 992 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => { errors.push(error.stack || error.message); console.error(engineName, error.stack || error.message); });
    const shot = name => page.screenshot({ path: out(`canvas-chrome-${engineName}-${name}.png`) });
    const card = id => page.locator(`#world > .card[data-id="${id}"]`);
    const select = async id => { await page.evaluate(id => { document.activeElement?.blur(); aegis.canvas.select([id]); }, id); await page.locator('#selectionBar').waitFor({ state: 'visible' }); };
    const connect = async id => { await select(id); await page.locator('#selectionBar .selection-more > summary').click(); await page.getByRole('button', { name: 'Connect', exact: true }).click(); await page.locator('#stage.connecting').waitFor(); };
    const centre = locator => locator.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const moveTo = async locator => { const p = await centre(locator); await page.mouse.move(p.x, p.y); return p; };
    try {
      await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); });
      await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
      await page.waitForFunction(() => window.aegis?.canvas?.board);
      // A fresh board per engine keeps persisted-link assertions independent.
      await page.evaluate(async name => { const board = await aegis.host.post('/boards', { name }); localStorage.setItem('aegis:board', board.id); }, `Canvas chrome ${engineName}`);
      await page.reload(); await page.waitForFunction(name => window.aegis?.canvas?.board?.name === name, `Canvas chrome ${engineName}`);
      const fixtures = demoBatch.filter(c => c.op === 'create' && ['document', 'sheet', 'deck', 'plot'].includes(c.ref)).map((c, i) => ({ ...c, newId: `chrome${c.ref}`, ref: undefined, x: i ? 900 : 400, y: i ? 180 + (i - 1) * 360 : 180, w: i ? 560 : 440, h: 300 }));
      await page.evaluate(commands => { aegis.apply(commands); aegis.canvas.setView({ x: 0, y: 0, z: 1 }); }, fixtures);
      await card('chromedocument').waitFor(); await card('chromesheet').waitFor();
      for (const viewport of [{ width: 1586, height: 992 }, { width: 1440, height: 900 }, { width: 760, height: 800 }]) {
        await page.setViewportSize(viewport); await page.mouse.move(100, 20);
        await page.locator('#sideBtn').click(); await page.locator('#side.open').waitFor();
        await page.waitForFunction(() => getComputedStyle(document.getElementById('side')).opacity === '1');
        const geometry = await page.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
          return { toggle: rect('#sideBtn'), tools: rect('#tools'), close: rect('#closeSide'), title: rect('.side-head > span'), adds: [...document.querySelectorAll('#side .adds button')].map(el => el.getBoundingClientRect().toJSON()), icons: [...document.querySelectorAll('#side .phead .fold')].filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect().toJSON()) };
        });
        assert.equal(geometry.toggle.x, 84, 'traffic lights have the first 80px'); assert.equal(geometry.toggle.height, 32);
        assert.ok(geometry.toggle.bottom <= 44 && geometry.tools.top >= geometry.toggle.bottom);
        const buttonSize = 32, iconSize = 28;
        assert.equal(geometry.close.width, buttonSize); assert.equal(geometry.close.height, buttonSize);
        assert.ok(Math.abs(geometry.close.y + buttonSize / 2 - geometry.title.y - geometry.title.height / 2) <= 1, 'close icon aligns with the title');
        assert.ok(geometry.icons.every(r => r.width === iconSize && r.height === iconSize));
        assert.equal(geometry.adds.length, 3); assert.ok(geometry.adds.every(r => r.height === buttonSize && r.y === geometry.adds[0].y));
        await page.keyboard.press('Tab'); await page.locator('#closeSide').focus(); assert.equal(await page.locator('#closeSide').evaluate(el => getComputedStyle(el).outlineColor), 'rgb(63, 141, 253)');
        if (viewport.width >= 1440) await shot(`sidebar-${viewport.width}`);
        await page.keyboard.press('Enter'); await page.locator('#side').waitFor({ state: 'hidden' });
      }
      await page.setViewportSize({ width: 520, height: 600 });
      await page.locator('#mobileHub').getByRole('button', { name: 'Windows', exact: true }).click();
      assert.ok(await page.locator('.mobile-content .layer-row .row-more').evaluateAll(nodes => nodes.length && nodes.every(el => el.getBoundingClientRect().height >= 44)));
      await page.getByRole('button', { name: 'Close sheet', exact: true }).click();
      console.log(`PASS ${engineName}: title bar clears traffic lights and tools at 760/1440/1586px; sidebar header, folds and add actions align; 520px uses the Windows sheet`);
      await page.setViewportSize({ width: 1586, height: 992 });
      await select('chromedocument'); await moveTo(card('chromedocument'));
      assert.equal(await page.locator('[data-connect-card]').count(), 0);
      assert.equal(await card('chromedocument').evaluate(el => getComputedStyle(el).outlineWidth), '1px');
      assert.equal(await page.locator('.rotation-handle svg').count(), 1);
      for (const selector of ['.win-strip', '.deck-title-strip']) {
        assert.ok(await page.locator(`#world ${selector}`).evaluateAll(nodes => nodes.every(el => { const s = getComputedStyle(el); return s.height === '36px' && s.boxShadow === 'none' && s.borderBottomWidth === '1px'; })));
      }
      await shot('selected-window');
      // Keyboard invocation and Escape must leave the board unchanged.
      await page.locator('#selectionBar .selection-more > summary').focus(); await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Connect', exact: true }).focus(); await page.keyboard.press('Enter');
      await moveTo(card('chromesheet')); await page.locator('[data-connect-target="chromesheet"]').waitFor();
      assert.equal(await page.locator('[data-connect-preview]').evaluate(el => getComputedStyle(el).stroke), 'rgb(63, 141, 253)');
      await shot('connect-preview'); await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-connect-preview]').count(), 0); assert.equal(await page.locator('[data-connect-target]').count(), 0);
      assert.equal(await page.evaluate(() => aegis.canvas.board.links.length), 0);
      console.log(`PASS ${engineName}: More > Connect works from keyboard, draws a blue preview and target highlight, Escape cancels without saving`);
      await connect('chromedocument'); await moveTo(card('chromedocument')); await page.mouse.down(); const to = await centre(card('chromesheet')); await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
      await page.waitForFunction(() => aegis.canvas.board.links.length === 1);
      await page.locator('.draw-inspector').getByLabel('Connector label', { exact: true }).fill('Shared context'); await page.keyboard.press('Tab');
      await page.locator('[data-connect-bend]').waitFor();
      const bend = await moveTo(page.locator('[data-connect-bend]')); await page.mouse.down(); await page.mouse.move(bend.x, bend.y + 80, { steps: 8 }); await page.mouse.up();
      await page.waitForFunction(async () => { const b = await aegis.host.get('/boards/' + aegis.canvas.board.id); return b.links[0]?.label === 'Shared context' && Math.abs(b.links[0]?.bend) > 20; });
      await shot('editable-link'); await page.locator('#stage').focus(); await page.keyboard.press('Escape');
      await connect('chromedocument'); await moveTo(card('chromesheet')); await page.mouse.down(); await page.mouse.up();
      assert.equal(await page.evaluate(() => aegis.canvas.board.links.length), 1, 'duplicate links are rejected');
      await connect('chromedocument'); await page.mouse.click(700, 750); assert.equal(await page.evaluate(() => aegis.canvas.board.links.length), 1, 'empty canvas creates no link');
      assert.equal(await page.locator('#stage.connecting').count(), 0, 'an empty drop ends the gesture');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const midpoint = await page.locator('.link-hit').evaluate(el => { const p = el.getPointAtLength(el.getTotalLength() / 2); return new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM()).toJSON(); });
      await page.mouse.click(midpoint.x, midpoint.y);
      await page.locator('[data-connect-end="b"]').waitFor();
      await moveTo(page.locator('[data-connect-end="b"]')); await page.mouse.down(); const replacement = await centre(card('chromeplot')); await page.mouse.move(replacement.x, replacement.y, { steps: 10 }); await page.mouse.up();
      await page.waitForFunction(async () => (await aegis.host.get('/boards/' + aegis.canvas.board.id)).links[0]?.b === 'chromeplot');
      await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board?.links?.[0]?.label === 'Shared context');
      assert.equal(await page.locator('.link-hit').count(), 1);
      console.log(`PASS ${engineName}: drag creates a persisted editable link; bend, label and reconnected endpoint save; duplicate and empty drops leave links unchanged; reload keeps the link`);
      // Every registered card type uses the same selection and resize chrome.
      const types = ['note', 'title', 'todo', 'link', 'image', 'video', 'web', 'agent', 'doc', 'swatch', 'audio', 'spotify', 'coll', 'frame', 'box', 'text', 'icon', 'font', 'section', 'ink', 'shape', 'path', 'stamp', 'dataset', 'canvas', 'template-group'];
      for (let start = 0; start < types.length; start += 6) {
        const group = types.slice(start, start + 6);
        await page.evaluate(group => {
          aegis.apply(group.map((type, i) => ({ op: 'create', type, newId: `atlas${type.replaceAll('-', '').slice(0, 11)}`, text: `${type} window`, x: 1800 + i % 3 * 440, y: 160 + Math.floor(i / 3) * 340, w: 360, h: 260, props: type === 'stamp' ? { emoji: '✦' } : type === 'shape' ? { shape: 'rect', fill: 'none', stroke: '#abb2bf' } : type === 'path' ? { points: [{ x: 20, y: 180 }, { x: 160, y: 40 }, { x: 320, y: 120 }], ow: 360, oh: 260 } : type === 'doc' ? { body: '## A quiet window\n\nIllustrative content.' } : type === 'swatch' ? { hex: '#3f8dfd' } : {} })));
          aegis.canvas.select([]); aegis.canvas.setView({ x: -1720, y: 0, z: 1 }); document.getElementById('toast').hidden = true;
        }, group);
        for (const type of group) {
          await card(`atlas${type.replaceAll('-', '').slice(0, 11)}`).waitFor(); await select(`atlas${type.replaceAll('-', '').slice(0, 11)}`);
          assert.equal(await page.locator('.selection-resize:not([hidden])').count(), 1, `${type} has a selection resize target`);
          assert.ok(await card(`atlas${type.replaceAll('-', '').slice(0, 11)}`).locator('.resize').count() <= 1, `${type} has no duplicate card resize targets`);
          assert.equal(await page.locator('[data-connect-card]').count(), 0);
        }
        await page.evaluate(() => { aegis.canvas.select([]); document.activeElement?.blur(); }); await shot(`card-types-${start / 6 + 1}`);
        await page.evaluate(group => aegis.apply([{ op: 'delete', ids: group.map(type => `atlas${type.replaceAll('-', '').slice(0, 11)}`) }]), group);
      }
      console.log(`PASS ${engineName}: all 26 card types retain selection and resize controls without edge connectors`);
      const touch = await browser.newPage({ viewport: { width: 1100, height: 900 }, hasTouch: true, colorScheme: 'dark' });
      try {
        await touch.addInitScript(() => localStorage.setItem('aegis:onboarded', '1')); await touch.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`); await touch.waitForFunction(() => window.aegis?.canvas?.board);
        await touch.locator('#sideBtn').click(); await touch.locator('#side.open').waitFor();
        assert.ok(await touch.locator('#side :is(.side-head .icon-btn, .phead .fold, .adds button)').evaluateAll(nodes => nodes.filter(el => el.getClientRects().length).every(el => el.getBoundingClientRect().height >= 44)));
      } finally { await touch.close(); }
      assert.deepEqual(errors, []);
      console.log(`PASS ${engineName}: touch retains 44px sidebar targets; no browser exceptions`);
    } catch (error) { await shot('FAIL'); throw error; }
    finally { await browser.close(); }
  }
} finally { host.kill(); }
