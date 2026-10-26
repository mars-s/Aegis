// Production geometry and keyboard checks, including the displayed representation of each type.
import { chromium, webkit } from './playwright.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { choose } from './dropdown.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const output = join(repo, '.scratch/summary-truth/overview-model'); mkdirSync(output, { recursive: true });
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
async function verifySummaryTruth(name, width, theme) {
  const line = { style: 'line', basis: 'Fictional hours', x: { kind: 'category', label: 'Day' }, y: { format: 'number', label: 'Hours' }, series: [{ name: 'Focus', points: [{ x: 'Mon', y: 3 }, { x: 'Fri', y: 2 }] }] };
  const money = { format: 'money', currency: 'AUD' };
  // Each engine uses its own locale, as does the shared chart formatter.
  const moneyText = await page.evaluate(() => {
    const format = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'AUD', maximumFractionDigits: 0, minimumFractionDigits: 0 });
    return [70, 130, 1200, 2400].map(value => format.format(value));
  });
  const comparison = { ...line, y: money, series: [{ name: 'Revenue', points: [{ x: 'Jan', y: 40 }, { x: 'Mar', y: 70 }] }, { name: 'Support cost', points: [{ x: 'Jan', y: 150 }, { x: 'Mar', y: 130 }] }] };
  const fixtures = [
    { type: 'object', kind: 'sheet', newId: 'truthsheet', text: 'Evidence with units', data: { columns: [{ label: 'Day', kind: 'text' }, { label: 'Focus', kind: 'number', unit: 'h' }, { label: 'Revenue', kind: 'money', unit: 'AUD', currency: 'AUD' }], rows: [{ cells: ['Mon', '3', '1200'] }, { cells: ['Fri', '2', '2400'] }] } },
    { type: 'object', kind: 'plot', newId: 'truthline', text: 'Live hours', data: { ...line, source: { cardId: 'truthsheet', xColumn: 0, yColumns: [1] } } },
    { type: 'object', kind: 'plot', newId: 'truthdonut', text: 'Customer mix', data: { ...line, style: 'donut', y: { format: 'number', unit: 'customers' }, series: [{ name: 'Customers', points: [{ x: 'Startup', y: 70 }, { x: 'Team', y: 20 }, { x: 'Enterprise', y: 10 }] }] } },
    { type: 'object', kind: 'plot', newId: 'truthmulti', text: 'Revenue and support cost', data: comparison },
    { type: 'object', kind: 'plot', newId: 'truthbars', text: 'Category comparison', data: { ...line, style: 'bar' } },
    { type: 'object', kind: 'diagram', newId: 'truthbranch', text: 'Approval branches', data: { direction: 'right', nodes: ['Data', 'Approve', 'Intake', 'Design'].map(name => ({ id: name.toLowerCase(), name, kind: 'step' })), edges: [['intake', 'design'], ['intake', 'data'], ['design', 'approve'], ['data', 'approve']].map(([from, to]) => ({ from, to })) } },
    { type: 'doc', newId: 'truthdoc', text: 'Evidence brief', props: { body: 'Compare these figures.' } },
    { type: 'object', kind: 'plot', newId: 'truthmany', text: 'Five measures', data: { ...line, series: Array.from({ length: 5 }, (_, i) => ({ name: `Measure ${i + 1}`, points: [{ x: 'Mon', y: i + 1 }, { x: 'Fri', y: i + 2 }] })) } },
    { type: 'object', kind: 'diagram', newId: 'truthcomplex', text: 'Large graph', data: { nodes: Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, name: `Node ${i + 1}`, kind: 'step' })), edges: [{ from: 'n0', to: 'n2' }, { from: 'n2', to: 'n0' }, { from: 'n1', to: 'n5' }] } },
  ].map((card, i) => ({ op: 'create', x: i % 3 * 480, y: Math.floor(i / 3) * 300, w: 400, h: 240, ...card }));
  await page.evaluate(async fixtures => {
    aegis.canvas.setBoard(await aegis.host.post('/boards', { name: 'Summary truth fixtures' }));
    await new Promise(resolve => aegis.apply([...fixtures, { op: 'connect', a: 'truthsheet', b: 'truthline' }, { op: 'connect', a: 'truthdoc', b: 'truthsheet' }], resolve));
  }, fixtures);
  await page.waitForFunction(() => aegis.canvas.board.cards.length === 9);
  const summaries = page.locator('.semantic-summaries');
  const card = id => summaries.locator(`[data-card-id="${id}"]`);
  const zoom = async z => { await page.evaluate(z => { aegis.canvas.select([]); aegis.canvas.setView({ x: 110, y: 80, z }); }, z); await settle(); };
  await zoom(.6);
  await card('truthline').waitFor();
  assert.equal(await card('truthline').locator('.semantic-headline').textContent(), '2');
  const beforePath = await card('truthline').locator('.semantic-graphic path').getAttribute('d');
  const donut = card('truthdonut');
  assert.equal(await donut.locator('.semantic-headline').textContent(), '100 customers');
  assert.match(await donut.textContent(), /3 segments/);
  assert.equal(await donut.locator('.semantic-graphic path, .semantic-graphic polyline').count(), 0);
  const shares = await donut.locator('.semantic-graphic rect').evaluateAll(nodes => nodes.map(n => +n.getAttribute('width') / 96));
  shares.forEach((share, i) => assert.ok(Math.abs(share - [.7, .2, .1][i]) < 1e-6));
  assert.equal(await card('truthbars').locator('.semantic-graphic rect').count(), 2);
  assert.equal(await card('truthbars').locator('.semantic-graphic path').count(), 0);
  const multi = card('truthmulti');
  assert.equal(await multi.locator('.semantic-graphic g').count(), 2);
  const values = await multi.locator('.semantic-series').allTextContents();
  assert.ok(values[0].includes('Revenue') && values[0].includes(moneyText[0]), JSON.stringify(values));
  assert.ok(values[1].includes('Support cost') && values[1].includes(moneyText[1]), JSON.stringify(values));
  assert.match(await multi.locator('.semantic-kind').textContent(), /2 series/);
  assert.equal(await card('truthmany').locator('.semantic-series').count(), 3);
  assert.match(await card('truthmany').locator('.semantic-kind').textContent(), /5 series.*\+2/);
  const topology = await card('truthbranch').locator('.semantic-graphic').evaluate(svg => ({ label: svg.getAttribute('aria-label'), names: [...svg.querySelectorAll('text')].map(n => n.textContent), edges: [...svg.querySelectorAll('path')].map(n => [Number(n.dataset.from), Number(n.dataset.to)]) }));
  assert.deepEqual(topology.edges, [[2, 3], [2, 0], [3, 1], [0, 1]]);
  assert.match(topology.label, /Intake to Design, Intake to Data, Design to Approve, Data to Approve/);
  assert.doesNotMatch(topology.label, /Design to Data/);
  assert.equal(await card('truthcomplex').locator('.semantic-graphic').count(), 0);
  assert.match(await card('truthcomplex').textContent(), /6 nodes · 3 connections/);
  assert.deepEqual(await card('truthsheet').locator('th').allTextContents(), ['Day', 'Focus (h)', 'Revenue (AUD)']);
  assert.ok((await card('truthsheet').locator('td').allTextContents()).includes(moneyText[2]));
  const layout = await summaries.locator('.semantic-window').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.cardId, height: n.getBoundingClientRect().height, content: n.firstElementChild.getBoundingClientRect().height, clipped: [...n.querySelectorAll('strong, .semantic-fact, .semantic-headline, .semantic-series > span')].filter(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1).map(el => el.textContent) })));
  for (const r of layout) { assert.ok(r.content <= r.height, JSON.stringify(r)); assert.deepEqual(r.clipped, [], JSON.stringify(r)); }
  await page.screenshot({ path: join(output, `${name}-${width}-${theme}-truth.png`) });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: 'truthsheet', keyboard: true } })));
  await page.locator('.sheet-editor').waitFor();
  const referenceLine = page.locator('.editor-reference-chart .line'); await referenceLine.waitFor();
  const referenceBefore = await referenceLine.getAttribute('d');
  assert.match(await page.locator('.sheet-grid').textContent(), /Focus \(h\).*Revenue \(AUD\)/);
  await page.locator('.sheet-grid td[data-r="2"][data-c="1"]').dblclick();
  await page.getByLabel('Cell value', { exact: true }).fill('9'); await page.getByLabel('Cell value', { exact: true }).press('Enter');
  await page.waitForFunction(before => document.querySelector('.editor-reference-chart .line')?.getAttribute('d') !== before, referenceBefore);
  await page.waitForFunction(() => document.querySelector('.side-editor [data-saved]')?.textContent === 'Saved');
  assert.equal(await page.locator('.sheet-editor').count(), 1);
  await page.screenshot({ path: join(output, `${name}-${width}-${theme}-live-nine.png`) });
  await page.locator('.side-editor [data-close]').click(); await page.locator('.side-editor').waitFor({ state: 'detached' });
  await zoom(.6);
  assert.equal(await card('truthline').locator('.semantic-headline').textContent(), '9');
  assert.notEqual(await card('truthline').locator('.semantic-graphic path').getAttribute('d'), beforePath);
  await zoom(1);
  await page.waitForFunction(() => document.querySelector('#world [data-id="truthline"] .values tbody tr:last-child td')?.textContent === '9');
  const saved = await page.evaluate(async () => { const saved = await aegis.host.get(`/boards/${aegis.canvas.board.id}`); aegis.canvas.setBoard(saved); return saved; });
  assert.equal(saved.cards.find(c => c.id === 'truthsheet').data.rows[1].cells[1], '9');
  assert.equal(saved.cards.find(c => c.id === 'truthline').data.series[0].points[1].y, 2, 'the stale fallback is deliberately unchanged');
  await zoom(.6);
  assert.equal(await card('truthline').locator('.semantic-headline').textContent(), '9');
  await page.screenshot({ path: join(output, `${name}-${width}-${theme}-saved-nine.png`) });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: 'truthdoc', keyboard: true } })));
  await page.locator('.docs-panel').waitFor(); await page.locator('.editor-reference-table').waitFor();
  const picker = page.getByRole('combobox', { name: 'Pinned reference', exact: true });
  await choose(picker, 'truthsheet');
  assert.deepEqual(await page.locator('.editor-reference-table th').allTextContents(), ['Day', 'Focus (h)']);
  await page.getByLabel('Reference first column', { exact: true }).fill('2'); await page.getByLabel('Reference first column', { exact: true }).press('Tab');
  await page.waitForFunction(() => document.querySelector('.editor-reference-table th')?.textContent === 'Focus (h)');
  assert.deepEqual(await page.locator('.editor-reference-table th').allTextContents(), ['Focus (h)', 'Revenue (AUD)']);
  assert.ok((await page.locator('.editor-reference-table td').allTextContents()).includes(moneyText[3]));
  await page.screenshot({ path: join(output, `${name}-${width}-${theme}-table-units.png`) });
  await page.locator('.side-editor [data-close]').click(); await page.locator('.side-editor').waitFor({ state: 'detached' });
  // Unsupported diagrams keep honest counts; gaps and an explicit extra-series count survive cluster view too.
  await page.evaluate(() => aegis.canvas.setView({ x: 110, y: 80, z: .05 })); await settle();
  assert.ok(await page.locator('.overview-members').count());
  await page.evaluate(() => aegis.canvas.setView({ x: 110, y: 80, z: .6 })); await settle();
  assert.equal(await card('truthline').locator('.semantic-headline').textContent(), '9');
  return { topology, layout, values, savedEnding: 9 };
}
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
      assert.match(await page.locator('.semantic-summaries .semantic-plot').textContent(), /2.*Fri.*Hours/);
      const neutral = await page.locator('.semantic-content > svg').evaluateAll(nodes => nodes.every(n => { const probe = document.createElement('span'); probe.style.color = 'var(--muted)'; n.parentElement.append(probe); const expected = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(n).stroke === expected; })); assert.ok(neutral);
      await page.locator('#toast').waitFor({ state: 'hidden' });
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
        const measured = await page.evaluate(() => ['plot', 'sheet'].map(kind => { const card = aegis.canvas.board.cards.find(c => c.kind === kind), el = document.querySelector(`.card[data-id="${card.id}"]`); return { kind, summary: aegis.canvas.representations.get(card.id).summary, inert: el.inert, labels: [...el.querySelectorAll('.tick, .sheet thead th, .sheet .note')].map(n => parseFloat(getComputedStyle(n).fontSize) * aegis.canvas.view.z) }; }));
        for (const r of measured) { assert.equal(r.summary, z < 1); assert.equal(r.inert, z < 1); if (!r.summary) assert.ok(r.labels.length && r.labels.every(px => px >= 12 - .01), JSON.stringify(r)); }
        transitions.push({ z, measured, link: await verifyLink() });
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const motion = await page.evaluate(async () => {
        const stage = document.getElementById('stage'), frames = [];
        const check = () => {
          const link = aegis.canvas.board.links[0], path = document.querySelector(`[data-link-line="${link.id}"]`);
          if (!path) return;
          const endpoints = [link.a, link.b].map((id, i) => {
            const model = aegis.canvas.representations.get(id);
            const el = document.querySelector(model.summary ? `.semantic-window[data-card-id="${id}"]` : `.card[data-id="${id}"]`);
            if (!el) return Infinity;
            const r = el.getBoundingClientRect(), p = path.getPointAtLength(i ? path.getTotalLength() : 0);
            return Math.min(Math.abs(p.x - r.left), Math.abs(p.x - r.right), Math.abs(p.y - r.top), Math.abs(p.y - r.bottom));
          });
          frames.push({ z: aegis.canvas.view.z, endpoints });
        };
        stage.addEventListener('canvaspaint', check);
        await new Promise(resolve => aegis.canvas.glideTo({ x: 200, y: 100, z: 1.2 }, 420, resolve));
        await new Promise(resolve => requestAnimationFrame(resolve)); stage.removeEventListener('canvaspaint', check); return frames;
      });
      assert.ok(motion.length >= 5); assert.ok(motion.every(f => f.endpoints.every(d => d < .3)), JSON.stringify(motion));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // A deliberate collision must move the summaries and their connected endpoints together.
      await page.evaluate(() => { const cards = aegis.canvas.board.cards; aegis.apply(cards.slice(0, 3).map(c => ({ op: 'update', id: c.id, set: { x: 40, y: 40 } }))); }); await page.waitForTimeout(150);
      await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.fit(); }); await settle();
      const collision = await measure(); verifyLayout(collision); await verifyLink();
      await page.screenshot({ path: join(output, `${name}-${width}-${theme}-collision.png`) });
      // Fit reserves the actual expanded island, including its current conversation height.
      await page.locator('#askPill').click(); await page.waitForTimeout(300); await page.evaluate(() => aegis.canvas.fit()); await settle();
      const island = await measure(); verifyLayout(island); await page.screenshot({ path: join(output, `${name}-${width}-${theme}-island.png`) });
      assert.deepEqual(errors, []); results.push({ engine: name, width, height, theme, fit, link, previews, focus, transitions, motion, collision, island });
      const truth = await verifySummaryTruth(name, width, theme); results.at(-1).truth = truth;
      assert.deepEqual(errors, []);
      console.log(`PASS ${name} ${width}x${height} ${theme}: Fit, gaps, measured island, representations, links, keyboard, type previews, minimum detail text`);
      await page.close(); page = null;
    }
    await browser.close(); browser = null;
  }
} catch (error) { if (page && !page.isClosed()) { console.error(error); if (await page.evaluate(() => !!window.aegis?.canvas?.board)) console.error(JSON.stringify(await measure())); await page.screenshot({ path: join(output, 'failure.png') }); } throw error;
} finally { writeFileSync(join(output, 'metrics.json'), JSON.stringify(results, null, 2)); await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
