// One fictional subject, with the same values in the document, sheet, plot and deck.
export const demoBatch = [
  { op: 'create', type: 'doc', text: 'Make room for deep work', ref: 'document', props: { body: '## A week with room to think\n\nProtect two quiet blocks each morning. Group meetings after lunch, then leave a little room to review what changed.\n\nThese are **illustrative figures**, not a record of your activity. The sheet and chart use the same five days.\n\n## The working model\n\nIf a block lasts $m$ minutes and there are $b$ blocks, focused time is:\n\n$$H = \\frac{b \\times m}{60}$$\n\nFour 45-minute blocks give **3 hours**. Across this sample week, the planned total is **15 hours**.\n\n## Try it for one week\n\n- Choose one outcome before opening messages.\n- Keep the first block free of meetings.\n- Review the result on Friday.\n\nUse the small calculator to test a different pace. The progress windows keep the plan beside the evidence.' } },
  { op: 'create', type: 'object', kind: 'stats', text: 'The weekly target', ref: 'stats', data: { tiles: [{ label: 'Focused time', value: '15 h', delta: 'Across five days' }, { label: 'Meeting time', value: '8 h', delta: 'Grouped after lunch' }], note: 'Demo data, a sample working week.' } },
  { op: 'create', type: 'object', kind: 'progress', text: 'Keep the rhythm', ref: 'goals', data: { goals: [{ label: 'Mornings protected', current: 4, target: 5, unit: 'days' }, { label: 'Weekly review', current: 1, target: 1, unit: 'review' }] } },
  { op: 'create', type: 'object', kind: 'diagram', text: 'Idea to decision', ref: 'flow', data: { direction: 'right', nodes: [{ id: 'idea', name: 'Collect', kind: 'step' }, { id: 'test', name: 'Try it', kind: 'step' }, { id: 'decide', name: 'Decide', kind: 'step' }, { id: 'share', name: 'Share', kind: 'step' }], edges: [{ from: 'idea', to: 'test' }, { from: 'test', to: 'decide' }, { from: 'decide', to: 'share' }] } },
  { op: 'create', type: 'object', kind: 'plot', text: 'A little focus each day', ref: 'plot', data: { style: 'line', x: { kind: 'category', label: 'Day' }, y: { format: 'number', label: 'Hours' }, series: [{ name: 'Focus', points: [{ x: 'Mon', y: 3 }, { x: 'Tue', y: 4 }, { x: 'Wed', y: 2 }, { x: 'Thu', y: 4 }, { x: 'Fri', y: 2 }] }], basis: 'Demo data, 15 illustrative hours in total.', knowledge: true } },
  { op: 'create', type: 'object', kind: 'sheet', text: 'Plan the week', ref: 'sheet', data: { columns: [{ label: 'Day', kind: 'text' }, { label: 'Focus', kind: 'number', unit: 'h' }, { label: 'Meetings', kind: 'number', unit: 'h' }], rows: [{ cells: ['Mon', '3', '1'] }, { cells: ['Tue', '4', '2'] }, { cells: ['Wed', '2', '3'] }, { cells: ['Thu', '4', '1'] }, { cells: ['Fri', '2', '1'] }], note: 'Demo data. Focus totals 15 h; meetings total 8 h.' } },
  { op: 'create', type: 'deck', text: 'Share the idea', ref: 'deck', props: { current: 0, slides: [{ id: 'opening', layout: 'title', background: 'sci-fi-wave', title: 'A calmer week', sub: 'Protect a little room to think.', body: '' }, { id: 'evidence', layout: 'chart', title: '15 focused hours', sub: 'Demo data, Monday to Friday.', body: '', chart: { values: [3, 4, 2, 4, 2], labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], label: 'Illustrative focus hours: 3, 4, 2, 4, 2.' } }, { id: 'next', layout: 'three', title: 'Keep it simple', sub: 'One small habit at a time.', body: 'Protect\nTry\nReview' }] } },
  { op: 'create', type: 'object', kind: 'callout', text: 'One useful rule', ref: 'principle', data: { tone: 'tip', text: 'Choose the outcome before choosing the tool. Keep the evidence beside the decision.', attribution: 'A sample working agreement' } },
  { op: 'create', type: 'object', kind: 'html', text: 'Try a different pace', ref: 'widget', data: { html: '<section><h2>Find your pace</h2><label>Minutes per block <input id="minutes" type="range" min="15" max="60" value="45"></label><output id="hours">4 blocks = 3 hours</output></section>', css: 'section{padding:4px}h2{font-size:22px;font-weight:500;letter-spacing:-.02em;margin:0 0 18px}label{display:grid;gap:10px;color:var(--muted);font-size:13px}input{width:100%;accent-color:var(--text)}output{display:block;margin-top:18px;color:var(--data);font-variant-numeric:tabular-nums}', js: 'document.querySelector("#minutes").addEventListener("input",e=>document.querySelector("#hours").textContent="4 blocks = "+(Number(e.target.value)*4/60).toFixed(1)+" hours");', height: 180 } },
  { op: 'layout', shape: 'grid', ids: ['$document', '$stats', '$goals', '$flow', '$plot', '$sheet', '$deck', '$principle', '$widget'], cols: 12, spans: [6, 3, 3, 6, 6, 6, 6, 3, 3], columns: [0, 6, 9, 6, 6, 6, 0, 6, 9], columnWidth: 104, gap: 24, fit: true, pack: 'compact', x: 40, y: 40 },
  { op: 'focus', ids: ['$document', '$stats', '$goals', '$flow', '$plot', '$sheet', '$deck', '$principle', '$widget'] },
];

// Run this file directly for the real host, fake-agent and browser composition check.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await checkDemo();
async function checkDemo() {
  const { chromium } = await import('./ui/playwright.mjs');
  const { out } = await import('./ui/out.mjs');
  const { spawn } = await import('node:child_process');
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: assert } = await import('node:assert/strict');
  const root = new URL('..', import.meta.url).pathname, data = await mkdtemp(join(tmpdir(), 'aegis-demo-'));
  const token = 'demo-' + process.pid, webPort = 5201 + Number(process.env.AEGIS_PORT_OFFSET || 0), stamp = Date.now();
  const errors = [];
  let host, web, browser, page;
  const ready = child => new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Startup timed out: ' + output)), 20000);
    child.stdout.on('data', bytes => { output += bytes; const port = /"port":(\d+)/.exec(output); if (port || /Local:/.test(output)) { clearTimeout(timer); resolve(port?.[1]); } });
    child.stderr.on('data', bytes => output += bytes);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
  try {
    host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: join(root, 'agent'), env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
    const port = await ready(host);
    web = spawn('npx', ['vite', '--port', String(webPort), '--strictPort'], { cwd: join(root, 'app') }); await ready(web);
    browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1586, height: 992 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { if (window.top === window) localStorage.setItem('aegis:onboarded', '1'); });
    await page.goto(`http://127.0.0.1:${webPort}/?port=${port}&token=${token}`);
    await page.waitForFunction(() => window.aegis?.canvas?.board);
    await page.evaluate(batch => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify(batch), model: { provider: 'fake', modelId: 'fake' } }), demoBatch);
    await page.waitForFunction(() => aegis.canvas.board.cards.length === 9);
    await page.waitForFunction(async () => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).every(a => !a.running));
    await page.keyboard.press('Escape');
    await page.locator('.agent-window .agent-close').click();
    await page.evaluate(() => aegis.canvas.fit());
    await page.locator('.card.kind-html iframe').waitFor();
    await page.frameLocator('.card.kind-html iframe').locator('#minutes').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.card.object, .card.doc')].length === 8 && [...document.querySelectorAll('.card.object, .card.doc')].every(el => el.dataset.intrinsicHeight && Math.abs(aegis.canvas.board.cards.find(c => c.id === el.dataset.id).h - Number(el.dataset.intrinsicHeight)) <= 1));
    // Wait for asynchronous sandbox height and saved geometry to settle before pressing Fit.
    await page.waitForTimeout(350);
    await page.evaluate(() => aegis.canvas.fit());
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => [...document.querySelectorAll('.card')].map(el => {
      const card = aegis.canvas.board.cards.find(c => c.id === el.dataset.id), window = el.getBoundingClientRect();
      const root = el.querySelector('.content, .doc-view, .deck-view');
      const box = root.getBoundingClientRect(), style = getComputedStyle(root), z = window.width / el.offsetWidth;
      const px = key => (parseFloat(style[key]) || 0) * z;
      const interior = { left: box.left + px('paddingLeft'), right: box.right - px('paddingRight'), top: box.top + px('paddingTop'), bottom: box.bottom - px('paddingBottom') };
      const graph = el.querySelector('.diagram .diagram');
      const children = graph ? [graph] : card.type === 'deck' ? [...root.children] : [...root.children];
      const bounds = children.map(node => node.getBoundingClientRect());
      const occupied = { left: Math.min(...bounds.map(b => b.left)), top: Math.min(...bounds.map(b => b.top)), right: Math.max(...bounds.map(b => b.right)), bottom: Math.max(...bounds.map(b => b.bottom)) };
      const area = Math.max(1, (interior.right - interior.left) * (interior.bottom - interior.top));
      const contentArea = Math.min(interior.right - interior.left, occupied.right - occupied.left) * Math.min(interior.bottom - interior.top, occupied.bottom - occupied.top);
      return { id: card.id, kind: card.kind ?? card.type, x: window.x, y: window.y, w: window.width, h: window.height, empty: 1 - contentArea / area, interior, occupied, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    }));
    await writeFile(out(`demo-content-bounds-${stamp}.json`), JSON.stringify(metrics, null, 2));
    for (const a of metrics) {
      assert.ok(a.empty <= .26, `${a.kind} has ${(a.empty * 100).toFixed(1)}% empty interior`);
      assert.ok(a.occupied.bottom <= a.interior.bottom + 2, `${a.kind} clips its content`);
      assert.ok(a.scrollWidth <= a.clientWidth + 2, `${a.kind} needs horizontal scrolling`);
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= 1586 && a.y + a.h <= 992, `${a.kind} is outside Fit`);
      for (const b of metrics) if (a !== b) assert.ok(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, `${a.kind} overlaps ${b.kind}`);
    }
    assert.equal(await page.locator('.card.kind-reply, .card.note').count(), 0, 'demo answer stays in chat');
    assert.ok(await page.locator('.card.doc .katex').count() >= 3, 'inline and block maths render in the document');
    const saved = await page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`));
    assert.deepEqual(saved.cards.map(c => [c.id, c.x, c.y, c.h]), await page.evaluate(() => aegis.canvas.board.cards.map(c => [c.id, c.x, c.y, c.h])), 'measured geometry is saved to the host');
    await page.screenshot({ path: out(`demo-composed-1586-${stamp}.png`) });
    for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 992 }); await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(200); await page.screenshot({ path: out(`demo-composed-${width}-${stamp}.png`) }); }
    // Exercise content changes after the initial render, including shrink and repack.
    await page.setViewportSize({ width: 1586, height: 992 });
    await page.evaluate(async () => {
      const board = await aegis.host.post('/boards', { name: 'Intrinsic sizing regression' });
      aegis.canvas.setBoard(board);
      aegis.apply([
        { op: 'create', type: 'note', ref: 'note', newId: 'sizingnote', text: 'A short saved note', h: 700 },
        { op: 'create', type: 'object', kind: 'diagram', ref: 'flow', newId: 'sizingflow', text: 'Layer bounds', data: { direction: 'right', layers: [{ id: 'work', name: 'Work' }], nodes: [{ id: 'a', name: 'Read', kind: 'step', layer: 'work' }, { id: 'b', name: 'Try', kind: 'step', layer: 'work' }, { id: 'c', name: 'Review', kind: 'step', layer: 'work' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] } },
        { op: 'layout', ids: ['$note', '$flow'], shape: 'grid', cols: 12, spans: [6, 6], columns: [0, 0], pack: 'compact', columnWidth: 104, fit: true, x: 0, y: 0 },
      ]);
      aegis.canvas.fit();
    });
    await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.id === 'sizingnote')?.h <= 100 && document.querySelector('.card[data-id="sizingflow"]')?.dataset.intrinsicHeight);
    const shortHeight = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.id === 'sizingnote').h);
    await page.evaluate(() => aegis.apply([{ op: 'update', id: 'sizingnote', set: { text: Array.from({ length: 14 }, (_, i) => 'A longer note, line ' + (i + 1)).join('\n') } }]));
    await page.waitForFunction(h => aegis.canvas.board.cards.find(c => c.id === 'sizingnote').h > h + 150, shortHeight);
    assert.ok(await page.evaluate(() => { const [note, flow] = aegis.canvas.board.cards; return flow.y === note.y + note.h + 24; }), 'growing a rendered note repacks the diagram');
    await page.evaluate(() => aegis.apply([{ op: 'update', id: 'sizingnote', set: { text: 'Short again' } }]));
    await page.waitForFunction(h => aegis.canvas.board.cards.find(c => c.id === 'sizingnote').h === h, shortHeight);
    assert.ok(await page.locator('[data-id="sizingflow"] .band').evaluate(el => { const band = el.getBoundingClientRect(), fit = el.closest('.fit').getBoundingClientRect(); return band.left >= fit.left - 1 && band.top >= fit.top - 1 && band.right <= fit.right + 1 && band.bottom <= fit.bottom + 1; }), 'diagram bounds contain the complete layer band');
    assert.ok(await page.evaluate(() => { const [note, flow] = aegis.canvas.board.cards; return flow.y === note.y + note.h + 24; }), 'shrinking a rendered note closes the layout gap');
    assert.deepEqual(errors, []);
    console.log('PASS demo-batch: nine curated windows, rendered intrinsic sizing, <=26% empty interior, no overlaps or clipping, grid composition, Fit, KaTeX, persisted geometry, note grow/shrink and diagram layer bounds');
    console.log('SCREENSHOT ' + out(`demo-composed-1586-${stamp}.png`));
  } catch (error) {
    if (page) {
      await writeFile(out(`demo-failure-${stamp}.json`), JSON.stringify(await page.evaluate(() => ({ cards: aegis.canvas.board.cards, measured: [...document.querySelectorAll('.card')].map(el => ({ id: el.dataset.id, h: el.offsetHeight, intrinsic: el.dataset.intrinsicHeight })) })), null, 2));
      await page.screenshot({ path: out(`demo-failure-${stamp}.png`) });
    }
    throw error;
  } finally { await browser?.close(); host?.kill(); web?.kill(); await rm(data, { recursive: true, force: true }); }
}
