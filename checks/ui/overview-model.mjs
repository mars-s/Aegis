// Production geometry and keyboard checks, including the displayed representation of each type.
import { chromium, webkit } from './playwright.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { choose } from './dropdown.mjs';
import { assertStaticWindows, assertRealLinkEdges, assertFitBounds, readDiagramTopology } from './static-geometry.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const output = join(repo, '.scratch/summary-truth/overview-model'); mkdirSync(output, { recursive: true });
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' }); assert.equal(build.status, 0, build.stdout + build.stderr);
const data = mkdtempSync(join(tmpdir(), 'aegis-overview-model-')), token = `overview-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: join(repo, 'agent'), env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: join(repo, 'app/dist'), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
let browser, page; const results = [];
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const measure = () => page.evaluate(() => ({ view: { ...aegis.canvas.view }, area: aegis.canvas.availableArea, rectangles: aegis.canvas.board.cards.map(c => { const r = aegis.canvas.representationRect(c.id); return { id: c.id, left: r?.left, top: r?.top, width: r?.width, height: r?.height }; }) }));
const verifyLayout = () => assertFitBounds(page);
const verifyLink = () => assertRealLinkEdges(page);
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
  await page.waitForFunction(() => window.aegis?.canvas?.board?.cards.length === 9);
  const card = id => page.locator(`#world > .card[data-id="${id}"]`);
  const zoom = async z => { await page.evaluate(z => { aegis.canvas.select([]); aegis.canvas.setView({ x: 110, y: 80, z }); }, z); await settle(); };
  await zoom(.6);
  await card('truthline').locator('.line').waitFor();
  assert.equal(await card('truthline').locator('.values tbody tr:last-child td').textContent(), '2');
  const beforePath = await card('truthline').locator('.line').getAttribute('d');
  const donut = card('truthdonut');
  assert.equal(await donut.locator('.round .total').textContent(), '100 customers');
  assert.equal(await donut.locator('.slice').count(), 3);
  assert.deepEqual(await donut.locator('.chart-legend .share').allTextContents(), ['70%', '20%', '10%']);
  assert.equal(await donut.locator('.line, .bar').count(), 0);
  await card('truthbars').locator('.bar').first().waitFor();
  assert.equal(await card('truthbars').locator('.bar').count(), 2);
  assert.equal(await card('truthbars').locator('.line').count(), 0);
  const multi = card('truthmulti');
  assert.equal(await multi.locator('.line').count(), 2);
  const values = await multi.locator('.values tbody tr:last-child td').allTextContents();
  assert.ok(values[0].includes(moneyText[0]), JSON.stringify(values));
  assert.ok(values[1].includes(moneyText[1]), JSON.stringify(values));
  assert.match(await multi.locator('.values').textContent(), /Revenue.*Support cost/);
  await card('truthmany').locator('.line').first().waitFor();
  assert.equal(await card('truthmany').locator('.line').count(), 5, 'all five real series remain in the chart');
  assert.match(await card('truthmany').textContent(), /Measure 5/);
  const topology = await readDiagramTopology(card('truthbranch'));
  assert.deepEqual(topology.names, ['Data', 'Approve', 'Intake', 'Design']);
  assert.deepEqual(topology.edges, [[2, 3], [2, 0], [3, 1], [0, 1]], 'real branching edges retain their topology');
  await card('truthcomplex').locator('.node').first().waitFor();
  assert.equal(await card('truthcomplex').locator('.node').count(), 6);
  assert.equal(await card('truthcomplex').locator('.flow').count(), 3);
  assert.deepEqual((await card('truthsheet').locator('.sheet thead tr:last-child th:not(.rn)').allTextContents()).map(text => text.trim()), ['Day', 'Focus (h)', 'Revenue']);
  assert.ok((await card('truthsheet').locator('td').allTextContents()).includes(moneyText[2]));
  const layout = await assertStaticWindows(page);
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
  assert.equal(await card('truthline').locator('.values tbody tr:last-child td').textContent(), '9');
  assert.notEqual(await card('truthline').locator('.line').getAttribute('d'), beforePath);
  await zoom(1);
  await page.waitForFunction(() => document.querySelector('#world [data-id="truthline"] .values tbody tr:last-child td')?.textContent === '9');
  const saved = await page.evaluate(async () => { const saved = await aegis.host.get(`/boards/${aegis.canvas.board.id}`); aegis.canvas.setBoard(saved); return saved; });
  assert.equal(saved.cards.find(c => c.id === 'truthsheet').data.rows[1].cells[1], '9');
  assert.equal(saved.cards.find(c => c.id === 'truthline').data.series[0].points[1].y, 2, 'the stale fallback is deliberately unchanged');
  await zoom(.6);
  assert.equal(await card('truthline').locator('.values tbody tr:last-child td').textContent(), '9');
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
  // A far camera retains the same data and original diagram DOM.
  await page.evaluate(() => aegis.canvas.setView({ x: 110, y: 80, z: .05 })); await settle();
  await assertStaticWindows(page);
  assert.equal(await card('truthcomplex').locator('.node').count(), 6);
  await page.evaluate(() => aegis.canvas.setView({ x: 110, y: 80, z: .6 })); await settle();
  assert.equal(await card('truthline').locator('.values tbody tr:last-child td').textContent(), '9');
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
      await page.waitForFunction(() => window.aegis?.canvas?.board?.cards.length === 9); await page.waitForTimeout(700);
      await page.evaluate(() => { const [doc, plot] = ['doc', 'plot'].map(type => aegis.canvas.board.cards.find(c => c.type === type || c.kind === type)); aegis.apply([{ op: 'connect', newId: 'overviewlink', a: doc.id, b: plot.id, }, { op: 'link_update', id: 'overviewlink', set: { arrow: 'end' } }]); });
      await page.waitForTimeout(150); await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.fit(); }); await settle();
      await page.waitForFunction(() => [...document.querySelectorAll('.card.object, .card.doc')].every(el => el.dataset.intrinsicHeight && Math.abs(aegis.canvas.board.cards.find(c => c.id === el.dataset.id).h - Number(el.dataset.intrinsicHeight)) <= 1));
      await page.waitForTimeout(350); await page.evaluate(() => aegis.canvas.fit()); await settle();
      const fit = await measure(); await verifyLayout(); const link = await verifyLink();
      const previews = {
        series: await page.locator('.card.kind-plot .line').count(),
        headers: await page.locator('.card.kind-sheet .sheet thead tr:last-child th:not(.rn)').count(),
        cells: await page.locator('.card.kind-sheet .sheet td').count(),
        slides: await page.locator('.card.deck .deck-main .deck-slide').count(),
      };
      assert.deepEqual(previews, { series: 1, headers: 3, cells: 15, slides: 1 });
      assert.match(await page.locator('.card.kind-progress').textContent(), /Mornings protected.*Weekly review/);
      assert.match(await page.locator('.card.doc').textContent(), /Protect two quiet blocks/);
      assert.match(await page.locator('.card.kind-plot .cartesian svg').getAttribute('aria-label'), /Hours/);
      await page.locator('#toast').waitFor({ state: 'hidden' });
      await page.screenshot({ path: join(output, `${name}-${width}-${theme}-fit.png`) });
      const docId = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'doc').id);
      await page.evaluate(id => { aegis.canvas.select([id]); document.getElementById('stage').focus(); }, docId); await settle();
      const action = page.locator(`.window-actions [data-window-action="${docId}"]`); await action.focus();
      const focus = await action.evaluate(el => ({ id: el.dataset.windowAction, h: el.getBoundingClientRect().height, z: aegis.canvas.view.z }));
      assert.equal(focus.id, docId); assert.ok(focus.h >= 32);
      const camera = await page.evaluate(() => ({ ...aegis.canvas.view }));
      await page.keyboard.press('Enter'); await page.locator('.docs-panel').waitFor(); await page.keyboard.press('Escape'); await page.locator('.docs-panel').waitFor({ state: 'detached' }); await settle();
      assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), [docId]);
      assert.deepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), camera);
      await page.locator(`.card[data-id="${docId}"] .win-strip`).click(); await settle(); assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), [docId]);
      const transitions = [];
      for (const z of [.3, .5, .75, 1, 2]) {
        await page.setViewportSize({ width: 5600, height: 4400 });
        await page.evaluate(z => aegis.canvas.setView({ x: 200, y: 100, z }), z); await settle();
        const measured = await assertStaticWindows(page);
        transitions.push({ z, measured, link: await verifyLink() });
      }
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const motion = await page.evaluate(async () => {
        const stage = document.getElementById('stage'), frames = [];
        const check = () => {
          const link = aegis.canvas.board.links[0], path = document.querySelector(`[data-link-line="${link.id}"]`), canvas = document.querySelector('.scene-overlay');
          const route = aegis.canvas.engine?.linkGeometry().find(entry => entry.id === link.id)?.route;
          const stroke = route && canvas?.linkPaint.find(stroke => stroke.commands[0]?.method === 'moveTo' && Math.hypot(stroke.commands[0].args[0] - route.p0.x, stroke.commands[0].args[1] - route.p0.y) < .01 && Math.hypot(stroke.commands.at(-1).args.at(-2) - route.p2.x, stroke.commands.at(-1).args.at(-1) - route.p2.y) < .01);
          if (!path && !stroke) return;
          const endpoints = [link.a, link.b].map((id, i) => {
            const el = document.querySelector(`.card[data-id="${id}"]`);
            const card = aegis.canvas.board.cards.find(card => card.id === id), v = aegis.canvas.view;
            const projected = { left: card.x * v.z + v.x, top: card.y * v.z + v.y, right: (card.x + card.w) * v.z + v.x, bottom: (card.y + card.h) * v.z + v.y };
            const onScreen = projected.left < innerWidth && projected.right > 0 && projected.top < innerHeight && projected.bottom > 0;
            if (onScreen && (!el || el.hidden)) return Infinity;
            const command = stroke?.commands[i ? stroke.commands.length - 1 : 0];
            const r = el && !el.hidden ? el.getBoundingClientRect() : projected, p = command ? { x: command.args.at(-2), y: command.args.at(-1) } : path.getPointAtLength(i ? path.getTotalLength() : 0);
            return Math.min(Math.abs(p.x - r.left), Math.abs(p.x - r.right), Math.abs(p.y - r.top), Math.abs(p.y - r.bottom));
          });
          frames.push({ z: aegis.canvas.view.z, endpoints });
        };
        const release = aegis.canvas.engine?.registerFrameParticipant({ write: check });
        if (!release) stage.addEventListener('canvaspaint', check);
        await new Promise(resolve => aegis.canvas.glideTo({ x: 200, y: 100, z: 1.2 }, 420, resolve));
        await new Promise(resolve => requestAnimationFrame(resolve)); release?.(); stage.removeEventListener('canvaspaint', check); return frames;
      });
      assert.ok(motion.length >= 5); assert.ok(motion.every(f => f.endpoints.every(d => d < .3)), JSON.stringify(motion));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // A deliberate collision stays at the saved position and its endpoints follow the real edges.
      await page.evaluate(() => { const cards = aegis.canvas.board.cards; aegis.apply(cards.slice(0, 3).map(c => ({ op: 'update', id: c.id, set: { x: 40, y: 40 } }))); }); await page.waitForTimeout(150);
      await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.fit(); }); await settle();
      const collision = await measure(); await verifyLayout(); await verifyLink();
      await page.screenshot({ path: join(output, `${name}-${width}-${theme}-collision.png`) });
      // Fit reserves the actual expanded island, including its current conversation height.
      await page.locator('#askPill').click(); await page.waitForTimeout(300); await page.evaluate(() => aegis.canvas.fit()); await settle();
      const island = await measure(); await verifyLayout(); await page.screenshot({ path: join(output, `${name}-${width}-${theme}-island.png`) });
      assert.deepEqual(errors, []); results.push({ engine: name, width, height, theme, fit, link, previews, focus, transitions, motion, collision, island });
      const truth = await verifySummaryTruth(name, width, theme); results.at(-1).truth = truth;
      assert.deepEqual(errors, []);
      console.log(`PASS ${name} ${width}x${height} ${theme}: Fit, measured island, real rectangles, links, keyboard, full content, scaled charts and sheets`);
      await page.close(); page = null;
    }
    await browser.close(); browser = null;
  }
} catch (error) { if (page && !page.isClosed()) { console.error(error); if (await page.evaluate(() => !!window.aegis?.canvas?.board)) console.error(JSON.stringify(await measure())); await page.screenshot({ path: join(output, 'failure.png') }); } throw error;
} finally { writeFileSync(join(output, 'metrics.json'), JSON.stringify(results, null, 2)); await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
