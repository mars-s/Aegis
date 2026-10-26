// Exercise the bundle shipped in Tauri, with screen-space font measurements in both engines.
import { chromium, webkit } from './playwright.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const output = join(repo, '.scratch/semantic-zoom');
mkdirSync(output, { recursive: true });
const before = process.argv.includes('--capture-before');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const data = mkdtempSync(join(tmpdir(), 'aegis-semantic-zoom-')), token = `semantic-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: join(repo, 'agent'), env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: join(repo, 'app/dist'), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
let browser, page;
const metrics = [];
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const zoom = async z => { await page.evaluate(z => aegis.canvas.setView({ x: 120, y: 120, z }), z); await frames(); };
const tier = () => page.locator('#stage').getAttribute('data-zoom-tier');
// Include ancestor transforms, since computed fontSize alone misses the original Fit regression.
const fonts = selector => page.locator(selector).evaluateAll(elements => elements.flatMap(el => {
  if (el.closest('[hidden], [inert]')) return [];
  let opacity = 1;
  for (let node = el; node instanceof Element; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
  if (opacity < .99 || !el.getClientRects().length) return [];
  const text = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (!text) return [];
  let scale = 1;
  for (let node = el; node instanceof Element; node = node.parentElement) {
    const style = getComputedStyle(node), matrix = new DOMMatrixReadOnly(style.transform);
    scale *= Math.hypot(matrix.a, matrix.b) * (Number(style.zoom) || 1);
  }
  return [{ text: text.textContent.trim().slice(0, 60), px: parseFloat(getComputedStyle(el).fontSize) * scale }];
}));

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
    await page.evaluate(async () => { aegis.canvas.setBoard(await aegis.host.post('/boards', { name: 'Semantic zoom demo' })); });
    await page.evaluate(batch => aegis.apply(batch), demoBatch);
    await page.waitForFunction(() => aegis.canvas.board.cards.length === 9);
    await page.waitForTimeout(700);
    await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.fit(); }); await page.waitForTimeout(250);
    await page.screenshot({ path: join(output, `${before ? 'before' : 'after'}-fit-${engineName}.png`) });
    if (before) { await zoom(.05); await page.screenshot({ path: join(output, `before-cluster-${engineName}.png`) }); await browser.close(); browser = null; continue; }
    assert.equal(await tier(), 'summary');
    const rendered = await fonts('.semantic-window :is(strong, .semantic-kind, .semantic-fact)');
    assert.ok(rendered.length >= 18, 'all nine windows keep their title, kind and meaningful labels');
    assert.ok(rendered.every(f => f.px >= 12), JSON.stringify(rendered));
    assert.equal(await page.locator('.semantic-table th').count(), 3);
    assert.equal(await page.locator('.semantic-table td').count(), 6);
    assert.match(await page.locator('.semantic-summaries').textContent(), /3 slides/);
    assert.match(await page.locator('.semantic-summaries').textContent(), /A week with room to think/);
    assert.match(await page.locator('.semantic-summaries').textContent(), /Find your pace/);
    assert.ok(await page.locator('.card').evaluateAll(nodes => nodes.every(el => getComputedStyle(el).opacity === '0' && el.inert)));
    console.log(`PASS ${engineName}: Fit keeps all nine summaries and facts at 12 screen px or larger`);
    await zoom(1); assert.equal(await tier(), 'detail');
    assert.ok(await page.locator('.card').evaluateAll(nodes => nodes.every(el => getComputedStyle(el).opacity === '1' && !el.inert)));
    await zoom(.69); assert.equal(await tier(), 'summary');
    for (const z of [.70, .72, .71, .705, .719, .701]) { await zoom(z); assert.equal(await tier(), 'summary'); }
    await zoom(.77); assert.equal(await tier(), 'detail');
    assert.ok(await page.locator('.card.kind-plot, .card.kind-sheet').evaluateAll(nodes => nodes.every(el => getComputedStyle(el).opacity === '0' && el.inert)), 'charts and sheets retain summaries until their internal text reaches 12px');
    assert.equal(await page.locator('.semantic-window').count(), 2);
    for (const z of [.74, .72, .71, .701, .73]) { await zoom(z); assert.equal(await tier(), 'detail'); }
    // Multiple wheel updates in one frame must produce just one tier mutation.
    assert.equal(await page.evaluate(async () => {
      const stage = document.getElementById('stage'); let mutations = 0;
      const observer = new MutationObserver(records => { mutations += records.filter(r => r.attributeName === 'data-zoom-tier').length; });
      observer.observe(stage, { attributes: true });
      for (let i = 0; i < 40; i++) aegis.canvas.setView({ ...aegis.canvas.view, z: i % 2 ? .6 : .9 });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); observer.disconnect(); return mutations;
    }), 1);
    console.log(`PASS ${engineName}: detail restores, threshold jitter does not flicker, updates batch once per frame`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await zoom(.85); await page.waitForTimeout(220); await zoom(.6);
    await page.waitForFunction(() => { const opacity = Number(getComputedStyle(document.querySelector('.card')).opacity); return opacity > 0 && opacity < 1; }, null, { polling: 'raf' });
    const fading = await page.locator('.card').first().evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), duration: getComputedStyle(el).transitionDuration }));
    assert.ok(fading.opacity > 0 && fading.opacity < 1, JSON.stringify(fading));
    assert.equal(fading.duration, '0.18s');
    await zoom(.85); await page.waitForTimeout(240);
    assert.equal(await page.locator('.card').first().evaluate(el => getComputedStyle(el).opacity), '1');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await zoom(.6);
    assert.equal(await page.locator('.card').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await zoom(.19); assert.equal(await tier(), 'cluster');
    for (const z of [.2, .21, .205]) { await zoom(z); assert.equal(await tier(), 'cluster'); }
    await zoom(.05);
    assert.equal(await page.locator('.overview-members').getAttribute('data-count'), '9');
    assert.ok((await fonts('.overview-members :is(strong, .semantic-kind, .semantic-fact)')).every(f => f.px >= 12));
    await page.screenshot({ path: join(output, `after-cluster-${engineName}.png`) });
    await page.locator('.overview-cluster').first().click(); await page.waitForTimeout(300);
    assert.notEqual(await tier(), 'cluster');
    await page.getByRole('button', { name: 'Back to where you were', exact: true }).click(); assert.equal(await tier(), 'summary');
    console.log(`PASS ${engineName}: interruptible crossfade, reduced motion, readable cluster contents and return`);
    // Agent windows already live in screen space. They must keep their identity and status at far zoom.
    await zoom(.85);
    const agentId = await page.evaluate(async () => (await aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE []', model: { provider: 'fake', modelId: 'fake' } }))[0].id);
    const agent = page.locator(`.agent-window[data-agent-id="${agentId}"]`);
    await agent.waitFor();
    await agent.locator('.agent-window-toggle').evaluate(el => el.click());
    await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(250);
    assert.equal(await agent.locator('.agent-window-body').evaluate(el => el.inert), true);
    assert.match(await agent.locator('.agent-zoom-summary').textContent(), /Agent.*messages/);
    const agentFonts = await fonts('.agent-semantic .semantic-copy > *');
    assert.ok(agentFonts.length >= 4 && agentFonts.every(f => f.px >= 12));
    await page.screenshot({ path: join(output, `after-agent-${engineName}.png`) });
    await agent.locator('.agent-zoom-summary').press('Enter'); await frames();
    assert.equal(await tier(), 'detail');
    assert.equal(await agent.locator('.agent-window-toggle').getAttribute('aria-expanded'), 'true');
    await agent.locator('.agent-close').evaluate(el => el.click());
    console.log(`PASS ${engineName}: agent title, status and message count stay readable, framing restores the expanded conversation`);

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
      return { frames: times.length, p95ms: times[Math.floor(times.length * .95)], maxms: times.at(-1), windows: document.querySelectorAll('.semantic-window').length };
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
    assert.equal(await tier(), 'summary');
    assert.ok(timing.windows > 0 && timing.windows < 450, 'off-screen summaries stay unmounted');
    metrics.push({ engine: engineName, cards: 450, ...timing, layouts });
    await page.screenshot({ path: join(output, `after-large-demo-${engineName}.png`) });
    await page.evaluate(() => aegis.canvas.fit()); await frames();
    assert.equal(await tier(), 'cluster');
    assert.equal(await page.locator('.overview-members').getAttribute('data-count'), '450');
    assert.ok(await page.locator('.overview-members .semantic-content').count() <= 8, 'cluster members are virtualised');
    // The last window is available through the cluster's scroll area even at minimum zoom.
    const viewBeforeScroll = await page.evaluate(() => ({ ...aegis.canvas.view }));
    await page.locator('.overview-members').hover(); await page.mouse.wheel(0, 500);
    await page.waitForFunction(() => document.querySelector('.overview-members').scrollTop > 0);
    assert.deepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), viewBeforeScroll, 'scrolling members does not pan the board');
    await page.locator('.overview-cluster').focus(); await page.keyboard.press('End'); await frames();
    assert.ok(Number(await page.locator('.overview-members').getAttribute('data-start')) >= 445, 'keyboard scrolling reaches the last windows');
    const lastFonts = await fonts('.overview-members .semantic-content :is(strong, .semantic-kind, .semantic-fact)');
    assert.ok(lastFonts.length >= 3 && lastFonts.every(f => f.px >= 12));
    await page.screenshot({ path: join(output, `after-large-cluster-${engineName}.png`) });
    console.log(`PASS ${engineName}: 450-window mixed demo, 960 pinch events in 60 frames, p95 ${timing.p95ms.toFixed(1)} ms, ${layouts ?? 'unavailable'} Chromium layouts, all cluster members retained`);
    assert.notEqual(await page.locator('#saveState').textContent(), 'not saved');
    assert.deepEqual(errors, []);
    await browser.close(); browser = null;
  }
  writeFileSync(join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
} catch (error) {
  if (page && !page.isClosed()) {
    console.error(await page.evaluate(() => ({ cards: window.aegis?.canvas?.board?.cards.length, mounted: document.querySelectorAll('.card').length, view: window.aegis?.canvas?.view, tier: document.getElementById('stage')?.dataset.zoomTier })));
    await page.screenshot({ path: join(output, 'failure.png') });
  }
  throw error;
} finally { await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
