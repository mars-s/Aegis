// Production geometry and keyboard checks, including the displayed representation of each type.
import { chromium, webkit } from './playwright.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const output = join(repo, '.scratch/overview-model'); mkdirSync(output, { recursive: true });
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' }); assert.equal(build.status, 0, build.stdout + build.stderr);
const data = mkdtempSync(join(tmpdir(), 'aegis-overview-model-')), token = `overview-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: join(repo, 'agent'), env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: join(repo, 'app/dist'), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
let browser, page; const results = [];
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const measure = () => page.evaluate(() => {
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  return { view: { ...aegis.canvas.view }, area: aegis.canvas.availableArea, summaries: [...document.querySelectorAll('.semantic-window')].map(el => ({ id: el.dataset.cardId, ...rect(el), title: el.querySelector('strong').textContent, titlePx: parseFloat(getComputedStyle(el.querySelector('strong')).fontSize), labels: [...el.querySelectorAll('.semantic-kind, .semantic-fact, th, td')].map(n => parseFloat(getComputedStyle(n).fontSize)), iconColour: getComputedStyle(el.querySelector('svg')).stroke, muted: getComputedStyle(el).getPropertyValue('--muted').trim(), clipped: [...el.querySelectorAll('strong, .semantic-fact')].filter(n => n.scrollHeight > n.clientHeight + 1).map(n => n.textContent), contentHeight: el.firstElementChild.getBoundingClientRect().height })), island: rect(document.querySelector('#agentIsland .island-morph')), scroll: document.querySelector('.semantic-summaries').scrollHeight > document.querySelector('.semantic-summaries').clientHeight, representations: [...aegis.canvas.representations].map(([id, r]) => ({ id, ...r })) };
});
const verifyLayout = m => {
  assert.equal(m.summaries.length, 9, JSON.stringify(m)); assert.equal(m.scroll, false);
  const a = m.area;
  for (const r of m.summaries) {
    assert.ok(r.x >= a.x - .1 && r.y >= a.y - .1 && r.x + r.w <= a.x + a.w + .1 && r.y + r.h <= a.y + a.h + .1, `outside available area ${JSON.stringify(r)} ${JSON.stringify(a)}`);
    assert.ok(r.y + r.h <= m.island.y - 24 + .1); assert.ok(r.w >= 220 && r.h >= 127.9);
    assert.equal(r.titlePx, 14); assert.ok(r.labels.every(n => n >= 12)); assert.deepEqual(r.clipped, [], `clipped ${r.title}`); assert.ok(r.contentHeight <= r.h + .1);
    for (const b of m.summaries) if (r !== b) assert.ok(r.x + r.w + 7.9 <= b.x || b.x + b.w + 7.9 <= r.x || r.y + r.h + 7.9 <= b.y || b.y + b.h + 7.9 <= r.y, `overlap ${r.title} / ${b.title}`);
  }
};
const verifyLink = async () => {
  const m = await page.evaluate(() => {
    const link = aegis.canvas.board.links[0], path = document.querySelector(`[data-link-line="${link.id}"]`);
    const endpoint = (id, at) => { const r = aegis.canvas.representations.get(id); const p = path.getPointAtLength(at ? path.getTotalLength() : 0); return { r, p: { x: p.x, y: p.y } }; };
    return { endpoints: [endpoint(link.a, false), endpoint(link.b, true)], stroke: parseFloat(getComputedStyle(path).strokeWidth), arrows: document.querySelectorAll('#links path:not([class])').length };
  });
  for (const { r, p } of m.endpoints) {
    assert.ok(p.x >= r.x - .2 && p.x <= r.x + r.w + .2 && p.y >= r.y - .2 && p.y <= r.y + r.h + .2, JSON.stringify(m));
    assert.ok(Math.min(Math.abs(p.x - r.x), Math.abs(p.x - r.x - r.w), Math.abs(p.y - r.y), Math.abs(p.y - r.y - r.h)) < .2, JSON.stringify(m));
  }
  assert.equal(m.stroke, m.endpoints.some(e => e.r.summary) ? 1 : 1.5); assert.ok(m.arrows >= 1); return m;
};
try {
  const port = await new Promise((resolve, reject) => { let log = ''; const timer = setTimeout(() => reject(Error(log)), 20000); host.stdout.on('data', b => { log += b; const m = /"port":(\d+)/.exec(log); if (m) { clearTimeout(timer); resolve(m[1]); } }); host.stderr.on('data', b => log += b); host.once('exit', code => { clearTimeout(timer); reject(Error(`${code}: ${log}`)); }); });
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    browser = await engine.launch();
    for (const [width, height] of [[1440, 900], [1586, 992]]) for (const theme of ['dark', 'light']) {
      page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 2 });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(theme => { if (window.top !== window) return; localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', theme); }, theme);
      await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`); await page.waitForFunction(() => window.aegis?.canvas?.board);
      await page.evaluate(async batch => { aegis.canvas.setBoard(await aegis.host.post('/boards', { name: 'Overview model' })); aegis.apply(batch); }, demoBatch);
      await page.waitForFunction(() => aegis.canvas.board.cards.length === 9); await page.waitForTimeout(700);
      await page.evaluate(() => { const [doc, plot] = ['doc', 'plot'].map(type => aegis.canvas.board.cards.find(c => c.type === type || c.kind === type)); aegis.apply([{ op: 'connect', newId: 'overviewlink', a: doc.id, b: plot.id, }, { op: 'link_update', id: 'overviewlink', set: { arrow: 'end' } }]); });
      await page.waitForTimeout(150); await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.fit(); }); await settle();
      await page.waitForFunction(() => document.querySelector('.semantic-summaries .semantic-plot svg')?.getBoundingClientRect().width > 95);
      const fit = await measure(); verifyLayout(fit); const link = await verifyLink();
      const previews = await page.evaluate(() => {
        const graph = document.querySelector('.semantic-summaries .semantic-plot svg').getBoundingClientRect();
        return { graph: { w: graph.width, h: graph.height }, metric: parseFloat(getComputedStyle(document.querySelector('.semantic-metric')).fontSize), progress: document.querySelector('.semantic-track').getBoundingClientRect().height, headers: document.querySelectorAll('.semantic-table th').length, cells: document.querySelectorAll('.semantic-table td').length, slides: document.querySelectorAll('.semantic-deck .deck-slide').length };
      });
      assert.deepEqual(previews, { graph: { w: 96, h: 28 }, metric: 24, progress: 6, headers: 3, cells: 6, slides: 1 });
      assert.match(await page.locator('.semantic-progress').textContent(), /Mornings protected.*Weekly review/);
      assert.match(await page.locator('.semantic-summaries').textContent(), /Protect two quiet blocks/);
      assert.match(await page.locator('.semantic-summaries .semantic-plot').textContent(), /2 Fri.*Hours/);
      const neutral = await page.locator('.semantic-content > svg').evaluateAll(nodes => nodes.every(n => { const probe = document.createElement('span'); probe.style.color = 'var(--muted)'; n.parentElement.append(probe); const expected = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(n).stroke === expected; })); assert.ok(neutral);
      await page.screenshot({ path: join(output, `${name}-${width}-${theme}-fit.png`) });
      const docId = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'doc').id);
      await page.locator(`.semantic-window[data-card-id="${docId}"]`).press('Enter'); await settle();
      assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), [docId]);
      const focus = await page.evaluate(() => ({ id: document.activeElement.dataset.windowAction || document.activeElement.dataset.id, h: document.activeElement.getBoundingClientRect().height, z: aegis.canvas.view.z }));
      assert.equal(focus.id, docId); assert.ok(focus.h >= 32); assert.ok(focus.z >= 1, JSON.stringify(focus));
      await page.keyboard.press('Enter'); await page.locator('.docs-panel').waitFor(); await page.keyboard.press('Escape'); await page.locator('.docs-panel').waitFor({ state: 'detached' });
      assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), [docId]);
      await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.fit(); }); await settle();
      await page.locator(`.semantic-window[data-card-id="${docId}"]`).click(); await settle(); assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), [docId]);
      const transitions = [];
      for (const z of [.69, .71, .77, .85, .99, 1, 1.2, .77]) {
        await page.evaluate(z => aegis.canvas.setView({ x: 200, y: 100, z }), z); await settle();
        const measured = await page.evaluate(() => ['plot', 'sheet'].map(kind => { const card = aegis.canvas.board.cards.find(c => c.kind === kind), el = document.querySelector(`.card[data-id="${card.id}"]`); return { kind, summary: aegis.canvas.representations.get(card.id).summary, inert: el.inert, labels: [...el.querySelectorAll('.tick, .sheet thead th')].map(n => parseFloat(getComputedStyle(n).fontSize) * aegis.canvas.view.z) }; }));
        for (const r of measured) { assert.equal(r.summary, z < 1); assert.equal(r.inert, z < 1); if (!r.summary) assert.ok(r.labels.length && r.labels.every(px => px >= 12 - .01), JSON.stringify(r)); }
        transitions.push({ z, measured, link: await verifyLink() });
      }
      // A deliberate collision must move the summaries and their connected endpoints together.
      await page.evaluate(() => { const cards = aegis.canvas.board.cards; aegis.apply(cards.slice(0, 3).map(c => ({ op: 'update', id: c.id, set: { x: 40, y: 40 } }))); }); await page.waitForTimeout(150);
      await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.fit(); }); await settle();
      const collision = await measure(); verifyLayout(collision); await verifyLink();
      await page.screenshot({ path: join(output, `${name}-${width}-${theme}-collision.png`) });
      // Fit reserves the actual expanded island, including its current conversation height.
      await page.locator('#askPill').click(); await page.waitForTimeout(300); await page.evaluate(() => aegis.canvas.fit()); await settle();
      const island = await measure(); verifyLayout(island); await page.screenshot({ path: join(output, `${name}-${width}-${theme}-island.png`) });
      assert.deepEqual(errors, []); results.push({ engine: name, width, height, theme, fit, link, previews, focus, transitions, collision, island });
      console.log(`PASS ${name} ${width}x${height} ${theme}: Fit, gaps, measured island, representations, links, keyboard, type previews, minimum detail text`);
      await page.close(); page = null;
    }
    await browser.close(); browser = null;
  }
} catch (error) { if (page && !page.isClosed()) { console.error(error); if (await page.evaluate(() => !!window.aegis?.canvas?.board)) console.error(JSON.stringify(await measure())); await page.screenshot({ path: join(output, 'failure.png') }); } throw error;
} finally { writeFileSync(join(output, 'metrics.json'), JSON.stringify(results, null, 2)); await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
