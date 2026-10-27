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
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-canvas-chrome-')), AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
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
    const documentPanel = process.env.AEGIS_UI_IMPL === 'react' ? '.side-editor.is-open .docs-panel' : '.docs-panel.is-open';
    const objectPanel = process.env.AEGIS_UI_IMPL === 'react' ? '.side-editor.is-open:has(.object.expanded)' : '.object-editor.is-open';
    const card = id => page.locator(`#world > .card[data-id="${id}"]`);
    const select = async id => { await page.evaluate(id => { document.activeElement?.blur(); aegis.canvas.select([id]); }, id); await page.locator('#selectionBar').waitFor({ state: 'visible' }); };
    const connect = async id => { await select(id); await page.locator('#selectionBar .selection-more > summary').click(); await page.getByRole('button', { name: 'Connect', exact: true }).click(); await page.locator('#stage.connecting').waitFor(); };
    const centre = locator => locator.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const moveTo = async locator => { const p = await centre(locator); await page.mouse.move(p.x, p.y); return p; };
    try {
      await page.addInitScript(() => { if (window !== window.top) return; localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', 'system'); });
      await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
      await page.waitForFunction(() => window.aegis?.canvas?.board);
      // A fresh board per engine keeps persisted-link assertions independent.
      await page.evaluate(async name => { const board = await aegis.host.post('/boards', { name }); localStorage.setItem('aegis:board', board.id); }, `Canvas chrome ${engineName}`);
      await page.reload(); await page.waitForFunction(name => window.aegis?.canvas?.board?.name === name, `Canvas chrome ${engineName}`);
      const fixtures = demoBatch.filter(c => c.op === 'create' && ['document', 'sheet', 'deck', 'plot'].includes(c.ref)).map((c, i) => ({ ...c, newId: `chrome${c.ref}`, ref: undefined, x: i ? 900 : 400, y: i ? 180 + (i - 1) * 360 : 180, w: i ? 560 : 440, h: 300 }));
      await page.evaluate(commands => { aegis.apply(commands); aegis.canvas.setView({ x: 0, y: 0, z: 1 }); }, fixtures);
      await card('chromedocument').waitFor(); await card('chromesheet').waitFor();
      for (const theme of ['dark', 'light']) {
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
        const contrasts = await page.evaluate(() => {
          const rgba = value => { const n = value.match(/[\d.]+/g)?.map(Number) || []; return [n[0] || 0, n[1] || 0, n[2] || 0, n[3] ?? 1]; };
          const over = (a, b) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
          const lum = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
          return [...document.querySelectorAll('#world .card :is(.win-kind, .deck-kind, .kind, .sheet-note, .sheet .note, .footnote, .meta, .data-size)')].filter(el => el.textContent.trim() && el.getClientRects().length).map(el => {
            let bg = [255, 255, 255, 1], opacity = 1;
            const chain = []; for (let parent = el; parent; parent = parent.parentElement) chain.unshift(parent);
            for (const parent of chain) { const style = getComputedStyle(parent); bg = over(rgba(style.backgroundColor), bg); opacity *= Number(style.opacity); }
            const fg = over(rgba(getComputedStyle(el).color), bg), a = lum(fg), b = lum(bg);
            return { text: el.textContent.slice(0, 60), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), opacity };
          });
        });
        assert.ok(contrasts.length >= 3); assert.ok(contrasts.every(c => c.ratio >= 4.5 && c.opacity === 1), `${theme}: ${JSON.stringify(contrasts)}`);
        await shot(`full-contrast-${theme}`);
      }
      await page.emulateMedia({ colorScheme: 'dark' });
      for (const edge of ['left', 'right']) {
        const arrow = page.locator(edge === 'left' ? '#revealLeft' : '#revealRight');
        for (const y of [64, 496, 928]) {
          await page.mouse.move(793, y); await page.mouse.move(edge === 'left' ? 10 : 1576, y);
          await page.waitForFunction(id => document.getElementById(id).classList.contains('show'), edge === 'left' ? 'revealLeft' : 'revealRight', { timeout: 1000 });
          await page.mouse.move(edge === 'left' ? 60 : 1526, 496); await page.waitForTimeout(120);
          assert.equal(await arrow.evaluate(el => el.classList.contains('show')), true, 'an approached arrow stays revealed');
        }
      }
      assert.equal((await page.locator('#revealLeft').boundingBox()).y, (await page.locator('#revealRight').boundingBox()).y);
      await page.mouse.move(793, 850);
      console.log(`PASS ${engineName}: secondary canvas text has at least 4.5:1 contrast in both themes; matching full-height edge zones retain approached arrows`);
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
        const buttonSize = 32, iconSize = 32;
        assert.equal(geometry.close.width, buttonSize); assert.equal(geometry.close.height, buttonSize);
        assert.ok(Math.abs(geometry.close.y + buttonSize / 2 - geometry.title.y - geometry.title.height / 2) <= 1, 'close icon aligns with the title');
        assert.ok(geometry.icons.every(r => r.width === iconSize && r.height === iconSize));
        assert.equal(geometry.adds.length, 3); assert.ok(geometry.adds.every(r => r.height === buttonSize && r.y === geometry.adds[0].y));
        assert.equal(await page.locator('#side [data-panel=library] > footer.library-footer').count(), 1, 'Library creation stays outside the scrolling body');
        assert.ok((await page.locator('#side [data-panel=layers]').boundingBox()).height <= (await page.locator('#side').boundingBox()).height * .45 + 1);
        assert.ok((await page.locator('#side [data-panel=library]').boundingBox()).height >= 240);
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
      await page.mouse.move(100, 20); await page.locator('#sideBtn').click();
      const tree = page.getByRole('tree', { name: 'Windows', exact: true });
      assert.equal(await tree.getByRole('treeitem').count(), 4);
      assert.equal(await tree.locator('[role=treeitem][tabindex="0"]').count(), 1);
      await tree.locator('[role=treeitem][tabindex="0"]').focus(); await page.keyboard.press('End');
      const lastName = await tree.locator('[role=treeitem]').last().getAttribute('aria-label');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), lastName);
      await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-selected') === 'true');
      assert.equal(await tree.locator('[role=treeitem][tabindex="0"]').count(), 1);
      await page.keyboard.press('Home'); assert.equal(await tree.locator('[role=treeitem]').first().evaluate(el => el === document.activeElement), true);
      await page.locator('#closeSide').click();
      console.log(`PASS ${engineName}: Windows exposes named tree items, selected state, one roving row, arrow/Home/End navigation and Enter activation`);
      for (const z of [1, .55, .2]) {
        await page.evaluate(z => new Promise(resolve => { if (aegis.canvas.engine) { const release = aegis.canvas.engine.registerFrameParticipant({ write: () => { release(); resolve(); } }); } else document.getElementById('stage').addEventListener('canvaspaint', () => resolve(), { once: true }); aegis.canvas.select(['chromedocument']); aegis.canvas.setView({ x: 160, y: 220, z }); }), z);
        await moveTo(card('chromedocument'));
        const action = page.locator('.window-actions [data-window-action="chromedocument"]'); await action.waitFor();
        const box = await action.boundingBox(); assert.ok(box.width >= 32 && box.height >= 32, `${z}: ${JSON.stringify(box)}`);
        if (z === .55) { await shot('unscaled-window-action'); await action.click(); await page.locator(documentPanel).waitFor(); await page.keyboard.press('Escape'); }
      }
      console.log(`PASS ${engineName}: Open actions remain at least 32px in screen space at 100%, 55% and 20%, and open the document`);
      await page.evaluate(() => aegis.canvas.setView({ x: 0, y: 0, z: 1 }));
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
      // Blue is reserved for data and agents; the connection preview is a neutral line.
      assert.equal(await page.locator('[data-connect-preview]').evaluate(el => getComputedStyle(el).stroke), await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() && getComputedStyle(Object.assign(document.body.appendChild(document.createElement('i')), { style: 'color: var(--muted)' })).color));
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
      await page.evaluate(() => { aegis.apply([{ op: 'create', type: 'object', kind: 'html', newId: 'chromewidget', text: 'Widget actions', x: 400, y: 540, w: 440, h: 300, data: { html: '<p>Interactive widget</p>', css: '', js: '', height: 180 } }]); aegis.canvas.select([]); aegis.canvas.setView({ x: 0, y: 0, z: 1 }); });
      await card('chromewidget').locator('iframe').hover();
      const widgetOpen = page.locator('.window-actions').getByRole('button', { name: 'Open Widget actions', exact: true });
      await widgetOpen.click(); await page.locator(objectPanel).waitFor(); await page.keyboard.press('Escape');
      const focusReturn = await page.evaluate(() => ({ id: document.activeElement.dataset.windowAction, active: document.activeElement.outerHTML.slice(0, 240), strip: document.querySelector('.window-actions').outerHTML.slice(0, 500), visibility: getComputedStyle(document.querySelector('.window-actions')).visibility, source: document.querySelector('.card.editor-source')?.dataset.id }));
      assert.equal(focusReturn.id, 'chromewidget', `Escape restores the unscaled widget action: ${JSON.stringify(focusReturn)}`);
      await page.evaluate(() => { document.activeElement?.blur(); aegis.apply([{ op: 'delete', ids: ['chromewidget'] }]); });
      console.log(`PASS ${engineName}: iframe hover reveals the window action, and Escape restores its focus`);
      // Every registered card type uses the same selection and resize chrome in detail.
      const types = ['note', 'title', 'todo', 'link', 'image', 'video', 'web', 'agent', 'doc', 'swatch', 'audio', 'spotify', 'coll', 'frame', 'box', 'text', 'icon', 'font', 'section', 'ink', 'shape', 'path', 'stamp', 'dataset', 'canvas', 'template-group'];
      for (let start = 0; start < types.length; start += 6) {
        const group = types.slice(start, start + 6);
        await page.evaluate(group => {
          aegis.apply(group.map((type, i) => ({ op: 'create', type, newId: `atlas${type.replaceAll('-', '').slice(0, 11)}`, text: `${type} window`, x: 1800 + i % 3 * 440, y: 160 + Math.floor(i / 3) * 340, w: 360, h: 260, props: type === 'stamp' ? { emoji: '✦' } : type === 'shape' ? { shape: 'rect', fill: 'none', stroke: '#abb2bf' } : type === 'path' ? { points: [{ x: 20, y: 180 }, { x: 160, y: 40 }, { x: 320, y: 120 }], ow: 360, oh: 260 } : type === 'doc' ? { body: '## A quiet window\n\nIllustrative content.' } : type === 'swatch' ? { hex: '#3f8dfd' } : {} })));
          aegis.canvas.select([]); aegis.canvas.setView({ x: -1900, y: 0, z: 1.1 }); document.getElementById('toast').hidden = true;
        }, group);
        for (const type of group) {
          await card(`atlas${type.replaceAll('-', '').slice(0, 11)}`).waitFor(); await select(`atlas${type.replaceAll('-', '').slice(0, 11)}`);
          assert.equal(await page.evaluate(id => aegis.canvas.mountedEl(id)?.inert, `atlas${type.replaceAll('-', '').slice(0, 11)}`), false, `${type} is shown in detail`);
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
        const boardId = await page.evaluate(() => aegis.canvas.board.id);
        await touch.addInitScript(id => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:board', id); }, boardId); await touch.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`); await touch.waitForFunction(() => window.aegis?.canvas?.board);
        await touch.locator('#sideBtn').click(); await touch.locator('#side.open').waitFor();
        assert.ok(await touch.locator('#side :is(.side-head .icon-btn, .phead .fold, .adds button)').evaluateAll(nodes => nodes.filter(el => el.getClientRects().length).every(el => el.getBoundingClientRect().height >= 44)));
        await touch.locator('#closeSide').click();
        await touch.evaluate(() => { aegis.canvas.select(['chromedocument']); aegis.canvas.setView({ x: 50, y: 220, z: .55 }); });
        const open = touch.locator('.window-actions [data-window-action="chromedocument"]'); await open.waitFor();
        const hit = await open.boundingBox(); assert.ok(hit.width >= 44 && hit.height >= 44);
      } finally { await touch.close(); }
      assert.deepEqual(errors, []);
      console.log(`PASS ${engineName}: touch retains 44px sidebar targets; no browser exceptions`);
    } catch (error) { await shot('FAIL'); throw error; }
    finally { await browser.close(); }
  }
} finally { host.kill(); }
