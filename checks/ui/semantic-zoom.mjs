// Exercise plain camera scaling in the shipped bundle in both browser engines.
import { chromium, webkit } from './playwright.mjs';
import { assertStaticWindows, assertRealLinkEdges, assertFitBounds } from './static-geometry.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const output = join(repo, '.scratch/semantic-zoom');
mkdirSync(output, { recursive: true });
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const data = mkdtempSync(join(tmpdir(), 'aegis-semantic-zoom-')), token = `semantic-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: join(repo, 'agent'), env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: join(repo, 'app/dist'), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
let browser, page;
const metrics = [];
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const zoom = async z => { await page.evaluate(z => aegis.canvas.setView({ x: 120, y: 120, z }), z); await frames(); };

try {
  const port = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(Error(output || 'Host startup timed out')), 20000);
    host.stdout.on('data', bytes => { output += bytes; const match = /"port":(\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]); } });
    host.stderr.on('data', bytes => output += bytes);
    host.once('exit', code => { clearTimeout(timer); reject(Error(`Host exited ${code}: ${output}`)); });
  });
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    browser = await engine.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { if (window.top !== window) return; localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); });
    await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
    await page.waitForFunction(() => window.aegis?.canvas?.board);
    const boardId = await page.evaluate(async () => { const board = await aegis.host.post('/boards', { name: 'Semantic zoom demo' }); aegis.canvas.setBoard(board); return board.id; });
    await page.waitForFunction(id => window.aegis?.canvas?.board?.id === id, boardId);
    await page.evaluate(batch => aegis.apply(batch), demoBatch);
    await page.waitForFunction(() => aegis.canvas.board.cards.length === 9);
    await page.waitForTimeout(700);
    await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.fit(); }); await page.waitForTimeout(250);
    await page.screenshot({ path: join(output, `after-fit-${engineName}.png`) });
    await page.waitForFunction(() => [...document.querySelectorAll('.card.object, .card.doc')].every(el => el.dataset.intrinsicHeight && Math.abs(aegis.canvas.board.cards.find(c => c.id === el.dataset.id).h - Number(el.dataset.intrinsicHeight)) <= 1));
    await page.waitForTimeout(350); await page.evaluate(() => aegis.canvas.fit()); await frames();
    await assertFitBounds(page);
    await page.evaluate(() => new Promise(resolve => {
      const [doc, plot] = ['doc', 'plot'].map(type => aegis.canvas.board.cards.find(c => c.type === type || c.kind === type));
      aegis.apply([{ op: 'connect', newId: 'staticlink', a: doc.id, b: plot.id }, { op: 'link_update', id: 'staticlink', set: { arrow: 'both', bend: 80 } }, { op: 'create', newId: 'staticrotated', type: 'note', text: 'Rotated real content', x: 150, y: 250, w: 300, h: 180, rot: 30 }, { op: 'connect', newId: 'rotatedlink', a: 'staticrotated', b: plot.id }], resolve);
    }));
    const ids = await page.evaluate(() => aegis.canvas.board.cards.map(c => c.id));
    for (const z of [.3, .5, .75, 1, 2]) {
      // A large viewport retains every window while testing the same world coordinates at 200%.
      await page.setViewportSize({ width: 5600, height: 4400 }); await zoom(z);
      await assertStaticWindows(page, ids); await assertRealLinkEdges(page);
      assert.ok(await page.locator('.card.object .object-host > .object > .content, .scene-card.object > .scene-body > .object > .content, .scene-card.object > .scene-body > .data-card').evaluateAll(nodes => nodes.length === 7 && nodes.every(el => el.childElementCount > 0)), 'every object window keeps its real content DOM');
      assert.ok(await page.locator('.card.kind-plot .cartesian svg .line').count());
      assert.ok(await page.locator('.card.kind-sheet .sheet tbody td').count());
      assert.match(await page.locator('.card.doc').textContent(), /Protect two quiet blocks/);
      assert.match(await page.locator('.card.doc').textContent(), /A week with room to think/);
      assert.equal(await page.locator('.card.deck .deck-thumb').count(), 3);
      assert.equal(await page.frameLocator('.card.kind-html iframe').locator('h2').textContent(), 'Find your pace');
      assert.ok(await page.locator('.card.deck .deck-slide').count());
      const body = page.locator('.card.kind-plot .cartesian svg');
      const sample = await body.evaluate(svg => ({ font: getComputedStyle(svg.querySelector('text.tick')).fontSize, scale: Math.hypot(svg.getScreenCTM().a, svg.getScreenCTM().b) }));
      metrics.push({ engine: engineName, z, chart: sample });
      const docId = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'doc').id);
      await page.evaluate(id => { aegis.canvas.select([id]); document.getElementById('stage').focus(); }, docId); await frames();
      const action = page.locator(`.window-actions [data-window-action="${docId}"]`);
      const anchor = await action.evaluate(el => {
        const strip = el.parentElement.getBoundingClientRect(), card = aegis.canvas.mountedEl(el.dataset.windowAction).getBoundingClientRect();
        return { strip: strip.toJSON(), card: card.toJSON() };
      });
      assert.ok(Math.abs(anchor.strip.right - anchor.card.right + 4) < 1 || Math.abs(anchor.strip.left - anchor.card.right - 8) < 1, JSON.stringify(anchor));
      assert.ok(z < .9 ? Math.abs(anchor.strip.bottom - anchor.card.top + 8) < 1 : Math.abs(anchor.strip.top - anchor.card.top - 2) < 1, JSON.stringify(anchor));
      const camera = await page.evaluate(() => ({ ...aegis.canvas.view }));
      await action.press('Enter'); await page.locator('.docs-panel.is-open, .side-editor.is-open .docs-panel').waitFor();
      assert.equal(await page.getByRole('textbox', { name: 'Document title', exact: true }).inputValue(), 'Make room for deep work');
      await page.keyboard.press('Escape'); await page.locator('.docs-panel').waitFor({ state: 'detached' }); await frames();
      assert.deepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), camera, 'Open returns to the same real-window view');

    }
    const geometryProbe = await page.locator('.card[data-id="staticrotated"]').evaluate(el => {
      const transform = el.style.transform; el.style.transform += ' translateX(8px)'; return transform;
    });
    let detected;
    try { await assertStaticWindows(page, ['staticrotated']); } catch (error) { detected = error; }
    finally { await page.locator('.card[data-id="staticrotated"]').evaluate((el, transform) => el.style.transform = transform, geometryProbe); }
    assert.ok(detected?.message.includes('staticrotated'), 'the geometry check detects a misplaced rotated window');
    metrics.push({ engine: engineName, displacedWindowFailure: detected.message });
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await page.evaluate(async () => {
      const stage = document.getElementById('stage'); let tiers = 0;
      const observer = new MutationObserver(records => { tiers += records.filter(r => r.attributeName === 'data-zoom-tier' || r.attributeName === 'data-has-summaries').length; });
      observer.observe(stage, { attributes: true });
      for (let i = 0; i < 40; i++) aegis.canvas.setView({ ...aegis.canvas.view, z: i % 2 ? .6 : .9 });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); observer.disconnect(); return tiers;
    }), 0, 'batched camera changes never create semantic tiers');
    for (const motion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion: motion });
      for (const z of [.69, .70, .72, .71, .705, .719, .701, .77, .74, .85, .6, .19, .2, .21, .205, .05]) {
        await zoom(z);
        assert.ok(await page.locator('#world > .card:not([hidden])').evaluateAll(nodes => nodes.length > 0 && nodes.every(el => getComputedStyle(el).opacity === '1' && !el.inert)));
        assert.equal(await page.locator('.semantic-window, .overview-cluster, .overview-back').count(), 0);
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await zoom(.85);
    const agentId = await page.evaluate(async () => (await aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE []', model: { provider: 'fake', modelId: 'fake' } }))[0].id);
    const agent = page.locator(`.agent-window[data-agent-id="${agentId}"]`);
    await agent.waitFor(); await agent.locator('.agent-window-toggle').evaluate(el => el.click());
    await frames(); const expanded = await agent.boundingBox();
    for (const z of [.05, .3, .5, .75, 1, 2]) {
      await zoom(z); const bounds = await agent.boundingBox();
      assert.ok(Math.abs(bounds.width - expanded.width) < 1 && Math.abs(bounds.height - expanded.height) < 1, 'agent chrome keeps its expanded screen size');
      assert.equal(await agent.locator('.agent-window-body').evaluate(el => el.inert), false);
      assert.equal(await agent.locator('.agent-window-toggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await agent.locator('.agent-zoom-summary').count(), 0);
    }
    await page.evaluate(() => aegis.canvas.fit()); await frames();
    const agentFit = await agent.boundingBox();
    assert.ok(agentFit.x >= 0 && agentFit.y >= 0 && agentFit.x + agentFit.width <= 1441 && agentFit.y + agentFit.height <= 901);
    await page.screenshot({ path: join(output, `after-agent-${engineName}.png`) });
    await agent.locator('.agent-close').evaluate(el => el.click());
    console.log(`PASS ${engineName}: world rectangles, rotation, real content, links, threshold jitter, motion preferences and fixed agent chrome`);

    // A large mixed board uses the real demo's documents, sheets, decks, plots and custom UI.
    await page.evaluate(async () => {
      const seed = structuredClone(aegis.canvas.board.cards);
      const board = await aegis.host.post('/boards', { name: 'Large semantic demo' });
      const commands = Array.from({ length: 450 }, (_, i) => {
        const card = seed[i % seed.length];
        return { op: 'create', newId: `largedemo${i}`, type: card.type, kind: card.kind, text: card.text, data: card.data, color: card.color, props: { ...card.props, fixedHeight: true }, x: i % 25 * 800, y: Math.floor(i / 25) * 900, w: 620, h: card.h };
      });
      for (let i = 0; i < commands.length; i += 100) await aegis.host.post(`/boards/${board.id}/batch`, { commands: commands.slice(i, i + 100) });
      aegis.canvas.setBoard(await aegis.host.get(`/boards/${board.id}`));
      aegis.canvas.setView({ x: 80, y: 80, z: .52 });
    });
    await page.waitForTimeout(600); await frames();
    const cdp = engineName === 'chromium' ? await page.context().newCDPSession(page) : null;
    await cdp?.send('Performance.enable');
    if (cdp && process.env.AEGIS_ZOOM_TRACE) await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' });
    const initial = cdp ? (await cdp.send('Performance.getMetrics')).metrics : [];
    const timing = await page.evaluate(async () => {
      const times = [], stage = document.getElementById('stage'); let previous = performance.now();
      for (let i = 0; i < 60; i++) {
        for (let j = 0; j < 16; j++) stage.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 2 ? -.8 : .8, ctrlKey: true, clientX: 700, clientY: 400, bubbles: true, cancelable: true }));
        await new Promise(resolve => requestAnimationFrame(resolve));
        const now = performance.now(); times.push(now - previous); previous = now;
      }
      times.sort((a, b) => a - b);
      return { frames: times.length, p95ms: times[Math.floor(times.length * .95)], maxms: times.at(-1), windows: document.querySelectorAll('#world > .card').length };
    });
    const final = cdp ? (await cdp.send('Performance.getMetrics')).metrics : [];
    const layouts = cdp ? final.find(m => m.name === 'LayoutCount').value - initial.find(m => m.name === 'LayoutCount').value : null;
    if (cdp && process.env.AEGIS_ZOOM_TRACE) {
      const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve)); await cdp.send('Tracing.end');
      const { stream } = await complete; let trace = '', chunk;
      do { chunk = await cdp.send('IO.read', { handle: stream }); trace += chunk.data; } while (!chunk.eof);
      await cdp.send('IO.close', { handle: stream }); writeFileSync(join(output, 'zoom-trace.json'), trace);
    }
    if (cdp) assert.ok(layouts <= timing.frames * 2 + 5, `layout count should follow frames, not windows: ${layouts}`);
    assert.ok(timing.windows > 0 && timing.windows < 450, 'off-screen windows stay unmounted');
    metrics.push({ engine: engineName, cards: 450, ...timing, layouts });
    await page.screenshot({ path: join(output, `after-large-demo-${engineName}.png`) });
    await page.evaluate(() => aegis.canvas.fit()); await frames();
    assert.equal(await page.locator('.overview-members, .overview-cluster, .overview-back').count(), 0);
    assert.equal(await page.evaluate(() => aegis.canvas.board.cards.length), 450, 'Fit retains every original window');
    assert.equal(await page.evaluate(() => aegis.canvas.view.z), .05, 'Fit respects the existing minimum camera scale');
    console.log(`PASS ${engineName}: 450-window mixed demo, 960 pinch events in 60 frames, p95 ${timing.p95ms.toFixed(1)} ms, ${layouts ?? 'unavailable'} Chromium layouts, viewport culling`);
    const farGeometry = await page.evaluate(async () => {
      const cards = Array.from({ length: 401 }, (_, i) => ({ id: `crowd${i}`, type: 'note', color: 'plain', text: 'Crowded', x: i % 30 * 80, y: Math.floor(i / 30) * 60, w: 40, h: 30, props: { fixedHeight: true } }));
      cards.push({ id: 'farrectangle', type: 'note', color: 'plain', text: 'True rectangle', x: 3000, y: 500, w: 200, h: 100, props: { fixedHeight: true } });
      cards.push({ id: 'farrotated', type: 'note', color: 'plain', text: 'Rotated rectangle', x: 4000, y: 600, w: 280, h: 80, rot: 30, props: { fixedHeight: true } });
      const board = await aegis.host.post('/boards', { name: 'Crowded static rectangles' });
      for (let i = 0; i < cards.length; i += 100) await aegis.host.post(`/boards/${board.id}/batch`, { commands: cards.slice(i, i + 100).map(({ id, ...card }) => ({ op: 'create', newId: id, ...card })) });
      aegis.canvas.setBoard(await aegis.host.get(`/boards/${board.id}`));
      const context = document.querySelector('.scene-overlay, #grid').getContext('2d'), original = context.fillRect, originalRect = context.rect, calls = [];
      const record = function(x, y, w, h) {
        if (w === 20 && h === 10 || w === 28 && h === 8) {
          const matrix = this.getTransform(), point = new DOMPoint(x, y).matrixTransform(matrix);
          calls.push({ x: point.x / devicePixelRatio, y: point.y / devicePixelRatio, w, h, angle: Math.atan2(matrix.b, matrix.a) });
        }
      };
      context.fillRect = function(x, y, w, h) { record.call(this, x, y, w, h); return original.call(this, x, y, w, h); };
      context.rect = function(x, y, w, h) { record.call(this, x, y, w, h); return originalRect.call(this, x, y, w, h); };
      try {
        aegis.canvas.setView({ x: 120, y: 120, z: .1 });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { calls, far: document.getElementById('stage').classList.contains('far'), mounted: aegis.canvas.stats().mounted };
      } finally { context.fillRect = original; context.rect = originalRect; }
    });
    assert.equal(farGeometry.far, true); assert.equal(farGeometry.mounted, 0);
    const rectangle = farGeometry.calls.find(c => c.w === 20), rotated = farGeometry.calls.find(c => c.w === 28);
    assert.ok(rectangle && Math.abs(rectangle.x - 420) < .01 && Math.abs(rectangle.y - 170) < .01 && rectangle.angle === 0, JSON.stringify(farGeometry));
    const angle = Math.PI / 6, expected = { x: 534 - 14 * Math.cos(angle) + 4 * Math.sin(angle), y: 184 - 14 * Math.sin(angle) - 4 * Math.cos(angle) };
    assert.ok(rotated && Math.abs(rotated.x - expected.x) < .01 && Math.abs(rotated.y - expected.y) < .01 && Math.abs(rotated.angle - angle) < .01, JSON.stringify(farGeometry));
    metrics.push({ engine: engineName, crowded: farGeometry });
    assert.notEqual(await page.locator('#saveState, [data-save-state]').textContent(), 'not saved');
    assert.deepEqual(errors, []);
    await browser.close(); browser = null;
  }
  writeFileSync(join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
} catch (error) {
  if (page && !page.isClosed()) {
    console.error(await page.evaluate(() => ({ cards: window.aegis?.canvas?.board?.cards.length, mounted: document.querySelectorAll('.card').length, view: window.aegis?.canvas?.view })));
    await page.screenshot({ path: join(output, 'failure.png') });
  }
  throw error;
} finally { await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
