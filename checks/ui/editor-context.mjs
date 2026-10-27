// Production editor composition, fonts, shortcuts and inline AI in both engines.
import { chromium, webkit } from './playwright.mjs';
import { choose } from './dropdown.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const output = join(repo, '.scratch/live-references/editor-context'); mkdirSync(output, { recursive: true });
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const data = mkdtempSync(join(tmpdir(), 'aegis-editor-context-')), token = `editor-context-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: join(repo, 'agent'), env: {
  ...process.env, AEGIS_DATA: data, AEGIS_UI: join(repo, 'app/dist'), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1',
} });
const port = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Host startup timed out')), 20000);
  host.stdout.on('data', bytes => { const match = /"port":(\d+)/.exec(String(bytes)); if (match) { clearTimeout(timer); resolve(match[1]); } });
  host.once('exit', code => { clearTimeout(timer); reject(Error(`Host exited ${code}`)); });
});
const fixtures = [
  { op: 'create', type: 'doc', newId: 'contextdoc', text: 'A clear release plan', x: 100, y: 120, w: 760, h: 540, props: { body: Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}. Write a clear brief and compare it with the supporting evidence.`).join('\n\n') } },
  { op: 'create', type: 'object', kind: 'sheet', newId: 'contextsheet', text: 'Release evidence', x: 1000, y: 400, w: 640, h: 420, data: { columns: [{ label: 'Task', kind: 'text' }, { label: 'Hours', kind: 'number' }], rows: [{ cells: ['Review', '4'] }, { cells: ['Publish', '2'] }] } },
  { op: 'create', type: 'deck', newId: 'contextdeck', text: 'Release story', x: 100, y: 900, w: 760, h: 540, props: { slides: [{ id: 'opening', layout: 'title', title: 'A clear release plan', sub: 'Evidence before action' }] } },
  { op: 'create', type: 'note', newId: 'linkednote', heading: 'Customer feedback', text: 'Readers need a short explanation beside each result.', x: 1000, y: 100, w: 300, h: 220 },
  { op: 'create', type: 'note', newId: 'nearnote', heading: 'Next step', text: 'Compare the brief with the evidence.', x: 100, y: 700, w: 300, h: 160 },
  { op: 'create', type: 'note', newId: 'hiddentext', text: 'Hidden implementation detail', x: 100, y: 150, props: { hidden: true } },
  { op: 'connect', a: 'contextdoc', b: 'linkednote' },
];
const metrics = [], captures = [];
let browser, page;
try {
  for (const [engineName, engine, platform] of [['chromium', chromium, 'MacIntel'], ['webkit', webkit, 'Win32']]) {
    if (process.env.AEGIS_BROWSER && process.env.AEGIS_BROWSER !== engineName) continue;
    browser = await engine.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(platform => {
      Object.defineProperty(navigator, 'platform', { get: () => platform });
      localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', 'dark'); localStorage.setItem('aegis:follow', 'off');
    }, platform);
    await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
    await page.waitForFunction(() => window.aegis?.canvas?.board);
    await page.evaluate(async fixtures => {
      const board = await aegis.host.post('/boards', { name: 'Editor context checks' }); aegis.canvas.setBoard(board);
      await new Promise(resolve => aegis.apply(fixtures, resolve));
    }, fixtures);
    await page.waitForFunction(() => aegis.canvas.board.cards.length === 6);
    const snapshot = () => page.evaluate(() => ({ view: { ...aegis.canvas.view }, selection: aegis.canvas.selection() }));
    const shot = async name => { const path = join(output, `${engineName}-${name}.png`); await page.screenshot({ path }); captures.push(path); };
    const prepare = async (id, z = .5) => {
      await page.evaluate(({ id, z }) => { aegis.canvas.setView({ x: 130, y: 80, z }); aegis.canvas.select([id, 'nearnote']); document.getElementById('stage').focus(); }, { id, z });
      await page.waitForTimeout(50); return snapshot();
    };
    const open = async (id, keyboard = false) => {
      await page.evaluate(({ id, keyboard }) => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, keyboard, viaKey: keyboard } })), { id, keyboard });
      await page.locator('.side-editor.is-open').waitFor(); await page.waitForTimeout(500);
    };
    const close = async before => {
      await page.locator('.side-editor [data-close]').click();
      await page.waitForFunction(before => ['x', 'y', 'z'].every(key => aegis.canvas.view[key] === before.view[key]), before);
      assert.deepEqual(await snapshot(), before, 'closing restores the original camera and selection');
      await page.locator('.side-editor').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.editor-context').count(), 0);
      assert.deepEqual(await page.locator('#stage').evaluate(el => [el.scrollLeft, el.scrollTop]), [0, 0], 'focus cannot scroll the stage');
    };
    async function composition(name, expected) {
      await page.waitForFunction(() => {
        const stage = document.getElementById('stage').getBoundingClientRect(), editor = document.querySelector('.side-editor').getBoundingClientRect();
        const left = Math.max(stage.left, ...[...document.querySelectorAll('.side.open:not([hidden]):not(.side-right), .tools:not([hidden])')].map(el => el.getBoundingClientRect().right));
        const windows = [...document.querySelectorAll('.editor-context-window:not([hidden])')];
        return windows.length && windows.every(el => { const r = el.getBoundingClientRect(); return r.left >= left + 24 - .1 && r.right <= editor.left - 24 + .1 && r.top >= stage.top + 24 - .1 && r.bottom <= stage.bottom - 24 + .1; });
      });
      const result = await page.evaluate(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        return { editor: rect(document.querySelector('.side-editor')), stage: rect(document.getElementById('stage')),
          blockedLeft: Math.max(0, ...[...document.querySelectorAll('.side.open:not([hidden]):not(.side-right), .tools:not([hidden])')].map(el => el.getBoundingClientRect().right)),
          windows: [...document.querySelectorAll('.editor-context-window:not([hidden])')].map(el => ({ id: el.dataset.cardId, ...rect(el), titleSize: getComputedStyle(el.querySelector('strong') || el.querySelector('button') || el).fontSize, factSize: getComputedStyle(el.querySelector('span') || el).fontSize })),
          originals: [...document.querySelectorAll('.editor-context-window:not([hidden])')].map(el => { const original = document.querySelector(`#world > .card[data-id="${el.dataset.cardId}"]`); return original ? getComputedStyle(original).visibility : 'unmounted'; }),
        };
      });
      assert.ok(result.windows.length >= 1 && result.windows.length <= 3);
      if (expected) assert.deepEqual(await page.locator('.editor-context-open').evaluateAll(items => items.map(el => el.dataset.cardId)), expected.slice(1));
      assert.equal(result.windows[0].height, 40, 'Editing marker is one 40px header');
      for (const w of result.windows) {
        assert.ok(w.left >= result.blockedLeft + 24 - .1 && w.right <= result.editor.left - 24 + .1, `${name}: horizontal clearance for ${w.id}`);
        assert.ok(w.top >= result.stage.top + 24 - .1 && w.bottom <= result.stage.bottom - 24 + .1, `${name}: vertical clearance for ${w.id}`);
        assert.ok(parseFloat(w.titleSize) >= (w.id === result.windows[0].id ? 13 : 12) && parseFloat(w.factSize) >= 12);
      }
      for (let i = 0; i < result.windows.length; i++) for (const b of result.windows.slice(i + 1)) {
        const a = result.windows[i]; assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${name}: summaries do not overlap`);
      }
      assert.ok(result.originals.every(v => ['hidden', 'unmounted'].includes(v)), 'full source duplicates are absent');
      assert.equal(await page.locator('.semantic-summaries, .board-overview').count(), 0, 'adaptive overlays cannot crowd the reference area');
      assert.ok(await page.locator('#world > .card').evaluateAll(cards => cards.every(el => getComputedStyle(el).visibility === 'hidden')), 'the compact reference area has no overlapping full windows');
      metrics.push({ engine: engineName, name, ...result }); await shot(name);
    }
    for (const [id, keyboard, z] of [['contextdoc', false, .48], ['contextdoc', true, 1.4], ['contextsheet', false, .5], ['contextdeck', true, .5]]) {
      const before = await prepare(id, z); await open(id, keyboard);
      await composition(`${id}-${keyboard ? 'keyboard' : 'pointer'}`, id === 'contextdoc' ? ['contextdoc', 'linkednote', 'nearnote'] : undefined);
      await close(before);
    }
    console.log(`PASS ${engineName}: document, sheet and deck context, linked priority, quiet empty references, readable summaries and exact return`);

    // Closing restores the invoking Open control even when the source is summarised.
    for (const selector of ['.window-actions [data-window-action="contextdoc"]', '#selectionBar [aria-label="Open"]']) {
      await prepare('contextdoc', 1);
      await page.evaluate(() => aegis.canvas.select(['contextdoc']));
      const invoker = page.locator(selector);
      await invoker.waitFor({ state: 'visible' });
      await invoker.focus();
      const before = await snapshot();
      await page.keyboard.press('Enter');
      await page.locator('.side-editor.is-open').waitFor(); await page.waitForTimeout(500);
      await close(before);
      await page.waitForFunction(selector => document.querySelector(selector) === document.activeElement, selector);
      assert.equal(await page.locator('#stage').evaluate(el => el.classList.contains('editor-source-selected')), false);
    }
    console.log(`PASS ${engineName}: focus returns to the window action and selection Open after clearing the editor source`);

    const original = await prepare('contextsheet'); await open('contextsheet');
    await page.locator('.editor-context-open[data-card-id="contextdoc"]').click();
    await page.locator('.docs-panel').waitFor(); await page.waitForTimeout(500);
    await close(original);
    console.log(`PASS ${engineName}: opening a neighbouring editor preserves the original camera and selection bookmark`);

    // A measured custom panel width, open sidebar, viewport resize and full width.
    let before = await prepare('contextdoc'); await open('contextdoc');
    await page.locator('.side-editor').evaluate(el => { el.style.width = '60vw'; }); await page.waitForTimeout(450);
    await composition('custom-width');
    await page.locator('.side-editor').evaluate(el => { el.style.width = ''; });
    await page.locator('#sideBtn').click(); await page.locator('#side.open:not([hidden])').waitFor();
    await page.waitForTimeout(500); await composition('sidebar-open');
    await page.getByRole('button', { name: 'Hide windows and library', exact: true }).click();
    await page.locator('#side').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1586, height: 992 }); await page.waitForTimeout(500); await composition('resized');
    const expand = page.getByRole('button', { name: 'Full width', exact: true }); await expand.click();
    const side = page.getByRole('button', { name: 'Side panel', exact: true }); assert.equal(await side.getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(100); assert.equal(await page.locator('.editor-context').isVisible(), false); await shot('full-width');
    await side.click(); await page.waitForTimeout(500); await composition('side-again');
    await close({ ...before, view: { ...before.view, x: before.view.x + 73, y: before.view.y + 46 } });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Opening motion yields to a real wheel gesture and never resumes later.
    before = await prepare('contextdoc');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: 'contextdoc' } })));
    await page.waitForTimeout(120); const moving = await snapshot(); assert.notDeepEqual(moving.view, before.view);
    await page.mouse.move(600, 700); await page.mouse.wheel(40, 100); await page.waitForTimeout(60);
    const interrupted = await snapshot(); await page.waitForTimeout(430); assert.deepEqual((await snapshot()).view, interrupted.view, 'opening remains interrupted');
    assert.equal(await page.locator('.editor-context').isVisible(), false, 'manual navigation restores the ordinary canvas windows');
    await close(before);
    for (const gesture of ['space', 'middle']) {
      before = await prepare('contextdoc'); await open('contextdoc');
      await page.locator('#stage').focus();
      if (gesture === 'space') await page.keyboard.down('Space');
      await page.mouse.move(600, 700);
      await page.mouse.down({ button: gesture === 'middle' ? 'middle' : 'left' });
      await page.mouse.move(640, 730, { steps: 4 });
      await page.mouse.up({ button: gesture === 'middle' ? 'middle' : 'left' });
      if (gesture === 'space') await page.keyboard.up('Space');
      assert.equal(await page.locator('.editor-context').isVisible(), false, `${gesture} pan restores ordinary windows`);
      await close(before);
    }
    for (const mode of ['reduce', 'off']) {
      await page.emulateMedia({ reducedMotion: mode === 'reduce' ? 'reduce' : 'no-preference' });
      await page.evaluate(mode => document.body.classList.toggle('motion-off', mode === 'off'), mode);
      before = await prepare('contextdoc'); await open('contextdoc'); const settled = await snapshot();
      await page.waitForTimeout(100); assert.deepEqual((await snapshot()).view, settled.view); await composition(`motion-${mode}`); await close(before);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.evaluate(() => document.body.classList.remove('motion-off'));
    console.log(`PASS ${engineName}: actual panel bounds, sidebar, resize, active width label, interruption and both motion preferences`);

    before = await prepare('contextdoc', 1);
    const preview = page.locator('#world > .card[data-id="contextdoc"] .doc-view');
    const scroll = await preview.evaluate(el => { el.scrollTop = 180; return el.scrollTop; }); assert.ok(scroll > 0);
    await open('contextdoc'); await page.getByLabel('Document title', { exact: true }).fill('Release brief');
    await page.waitForFunction(() => document.querySelector('.side-editor [data-saved]')?.textContent === 'Saved');
    await close(before); await page.waitForFunction(scroll => document.querySelector('#world > .card[data-id="contextdoc"] .doc-view')?.scrollTop === scroll, scroll);

    await page.setViewportSize({ width: 700, height: 800 }); before = await prepare('contextdoc'); await open('contextdoc');
    assert.equal(await page.locator('.editor-context').isVisible(), false, 'a full viewport editor leaves no usable reference rectangle'); await shot('narrow-editor'); await close(before);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'update', id: 'linkednote', set: { x: 8000, y: -5000 } }], resolve)));
    before = await prepare('contextdoc'); await open('contextdoc'); await composition('distant-link', ['contextdoc', 'linkednote', 'nearnote']); await close(before);
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'update', id: 'linkednote', set: { x: 1000, y: 100 } }], resolve)));
    console.log(`PASS ${engineName}: scrolled source survives a saved edit, narrow editors and distant linked context`);

    // Import an actual local dataset through the app, then open its editor.
    await page.evaluate(() => {
      const dt = new DataTransfer(); dt.items.add(new File(['task,hours\nReview,4\nPublish,2\n'], 'context.csv', { type: 'text/csv' }));
      document.getElementById('stage').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: 500, clientY: 350, bubbles: true }));
    });
    await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'dataset'));
    const dataset = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'dataset').id);
    before = await prepare(dataset); await open(dataset); await page.locator('.data-viewer-grid').waitFor(); await composition('dataset'); await close(before);

    before = await prepare('contextdoc'); await open('contextdoc');
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'create', type: 'note', newId: 'addedreference', text: 'An extra source to drag into the document.', x: 300, y: 400 }], resolve)));
    assert.equal(await page.locator('.editor-context').isVisible(), false, 'new board windows remain available for document drag and drop');
    await close(before);
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'delete', ids: ['addedreference'] }], resolve)));

    const chartData = { style: 'line', basis: 'Release evidence', x: { kind: 'category', label: 'Task' }, y: { format: 'number', label: 'Hours' },
      source: { cardId: 'contextsheet', xColumn: 0, yColumns: [1] }, series: [{ name: 'Hours', points: [{ x: 'Review', y: 4 }, { x: 'Publish', y: 2 }] }] };
    await page.evaluate(data => new Promise(resolve => aegis.apply([
      { op: 'create', type: 'object', kind: 'plot', newId: 'liveplot', text: 'Hours by task', x: 1700, y: 400, data },
      { op: 'create', type: 'object', kind: 'plot', newId: 'liveplot2', text: 'Hours comparison', x: 2500, y: 400, data },
      { op: 'connect', a: 'contextsheet', b: 'liveplot' },
      { op: 'connect', a: 'contextdoc', b: 'liveplot' },
    ], resolve)), chartData);
    before = await prepare('contextsheet'); await open('contextsheet');
    const line = page.locator('.editor-reference-chart .line'); await line.waitFor();
    const oldPath = await line.getAttribute('d');
    assert.deepEqual(await page.locator('.editor-reference-chart').evaluate(el => [el.offsetWidth, el.offsetHeight]), [320, 180]);
    await page.locator('.sheet-grid td[data-r="1"][data-c="1"]').dblclick();
    await page.getByLabel('Cell value', { exact: true }).fill('8'); await page.getByLabel('Cell value', { exact: true }).press('Enter');
    await page.waitForFunction(old => document.querySelector('.editor-reference-chart .line')?.getAttribute('d') !== old, oldPath);
    await page.waitForFunction(() => document.querySelector('.side-editor [data-saved]')?.textContent === 'Saved');
    assert.equal(await page.locator('.sheet-editor').count(), 1, 'live evidence does not replace the editor');
    assert.equal(await page.locator('.editor-context-reference:not([hidden])').count(), 1);
    assert.ok(await page.locator('.editor-reference-chart text.tick').evaluateAll(labels => labels.every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)));
    await shot('sheet-live-chart');
    const picker = page.getByRole('combobox', { name: 'Pinned reference', exact: true });
    await picker.focus(); await page.keyboard.press('Enter');
    const choices = page.getByRole('listbox', { name: 'Pinned reference options', exact: true });
    assert.equal(await choices.getByRole('option').count(), 4, 'None and all chart and dataset candidates are offered');
    await choices.locator('[data-value="liveplot2"]').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.editor-reference-chart svg')?.getAttribute('aria-label')?.startsWith('Hours comparison.'));
    assert.equal(await page.locator('.editor-context-reference').getAttribute('data-card-id'), 'liveplot2');
    await picker.focus(); await page.keyboard.press('Enter');
    await choices.locator('[data-value="liveplot"]').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.editor-reference-chart svg')?.getAttribute('aria-label')?.startsWith('Hours by task.'));
    await picker.focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('Escape'); assert.equal(await picker.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.sheet-editor').count(), 1, 'Escape dismisses the switcher first');
    await close(before);

    before = await prepare('contextdoc'); await open('contextdoc');
    await picker.focus(); await page.keyboard.press('Enter');
    assert.equal(await choices.getByRole('option').count(), 5, 'the switcher includes None and every eligible reference');
    const sheetIndex = await choices.getByRole('option').evaluateAll(items => items.findIndex(el => el.dataset.value === 'contextsheet'));
    await page.keyboard.press('Home');
    for (let i = 0; i < sheetIndex; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.locator('.editor-reference-table table').waitFor();
    assert.equal(await page.locator('.docs-panel').count(), 1, 'choosing a pin keeps the current editor');
    assert.deepEqual(await page.locator('.editor-reference-table').evaluate(el => [el.offsetWidth, el.offsetHeight]), [280, 160]);
    assert.equal(await page.locator('.editor-reference-table td').nth(1).textContent(), '8');
    await page.getByLabel('Reference first row', { exact: true }).fill('2'); await page.getByLabel('Reference first row', { exact: true }).press('Tab');
    await page.waitForFunction(() => document.querySelector('.editor-reference-table td')?.textContent === 'Publish');
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'object_set', id: 'contextsheet', path: ['rows', 1, 'cells', 1], value: '5' }], resolve)));
    await page.waitForFunction(() => document.querySelectorAll('.editor-reference-table td')[1]?.textContent === '5');
    await shot('selected-table-region');
    await page.setViewportSize({ width: 1586, height: 992 }); await page.waitForTimeout(500);
    assert.equal(await page.locator('.editor-reference-table td').first().textContent(), 'Publish', 'pin and region survive resizing');
    await page.evaluate(() => document.documentElement.dataset.theme = 'light'); await shot('reference-light');
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await close({ ...before, view: { ...before.view, x: before.view.x + 73, y: before.view.y + 46 } });
    await page.setViewportSize({ width: 1440, height: 900 });
    // The same pin returns when the document is reopened.
    before = await prepare('contextdoc'); await open('contextdoc'); await page.locator('.editor-reference-table table').waitFor(); await close(before);

    // A board update during a CSV read must not strand the pinned dataset in Loading.
    let releaseAsset, assetRequested;
    const requested = new Promise(resolve => { assetRequested = resolve; });
    const heldAsset = new Promise(resolve => { releaseAsset = resolve; });
    const assetUrl = await page.evaluate(id => aegis.host.assetUrl(aegis.canvas.board.cards.find(c => c.id === id).props.src), dataset);
    await page.route(assetUrl, async route => { assetRequested(); await heldAsset; await route.continue(); });
    before = await prepare('contextdoc'); await open('contextdoc');
    await picker.focus(); await page.keyboard.press('Enter');
    await choices.locator(`[data-value="${dataset}"]`).focus(); await page.keyboard.press('Enter');
    await requested;
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'update', id: 'nearnote', set: { text: 'Compare the latest evidence.' } }], resolve)));
    releaseAsset();
    await page.locator('.editor-reference-table table').waitFor();
    assert.equal(await page.locator('.editor-reference-table td').first().textContent(), 'Review');
    assert.deepEqual(await page.locator('.editor-reference-table').evaluate(el => [el.offsetWidth, el.offsetHeight]), [280, 160]);
    assert.ok(await page.locator('.editor-reference-table :is(th, td)').evaluateAll(cells => cells.every(el => getComputedStyle(el).fontSize === '12px')));
    await shot('pinned-dataset'); await page.unroute(assetUrl);
    await page.evaluate(async id => {
      const saved = await aegis.host.upload(new File(['task,hours\nReview,9\nPublish,6\n'], 'updated.csv', { type: 'text/csv' }));
      const source = aegis.canvas.board.cards.find(c => c.id === id);
      await new Promise(resolve => aegis.apply([{ op: 'update', id, set: { props: { ...source.props, src: saved.url } } }], resolve));
    }, dataset);
    await page.waitForFunction(() => document.querySelectorAll('.editor-reference-table td')[1]?.textContent === '9');
    await close(before);
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'delete', ids: ['liveplot', 'liveplot2'] }], resolve)));
    console.log(`PASS ${engineName}: live sheet edits, one pinned chart, all keyboard choices, selected table region, live table and dataset updates, concurrent CSV read, persistent pin and light theme`);

    // Font choices exclude loaded maths fonts and fonts already used by cards.
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'update', id: 'nearnote', set: { props: { font: 'KaTeX_AMS' } } }], resolve)));
    before = await prepare('contextdoc'); await open('contextdoc');
    await page.getByLabel('Format document', { exact: true }).click();
    const font = page.getByRole('combobox', { name: 'Font family', exact: true }); await font.click();
    const fontMenu = page.getByRole('listbox', { name: 'Font family choices', exact: true });
    assert.doesNotMatch(await fontMenu.textContent(), /KaTeX|MathJax|Material Icons|Font Awesome|system-ui|Inter Variable/);
    const inter = fontMenu.getByRole('option', { name: 'Inter', exact: true }); assert.match(await inter.evaluate(el => el.style.fontFamily), /Inter Variable/);
    assert.equal(await fontMenu.getByRole('option', { name: 'Serif', exact: true }).count(), 1); await shot('font-previews');
    await fontMenu.getByRole('option', { name: 'Georgia', exact: true }).click();
    await page.getByLabel('Format document', { exact: true }).click();

    const rewrite = page.locator('.ribbon-ai [data-chooser="Rewrite selection"] button');
    assert.equal(await rewrite.locator('.orb-inline').count(), 1);
    const animations = () => rewrite.locator('.orb-inline').evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length);
    assert.equal(await animations(), 0, 'inline orb is still at rest'); await rewrite.hover(); assert.equal(await animations(), 0, 'hover does not animate inline AI');
    const measureContrast = () => rewrite.evaluate(el => {
      const rgb = text => text.match(/[\d.]+/g).slice(0, 3).map(Number);
      const over = (fg, bg, a) => fg.map((v, i) => v * a + bg[i] * (1 - a));
      let background = [0, 0, 0];
      for (const node of [el, ...function* () { for (let p = el.parentElement; p; p = p.parentElement) yield p; }()].reverse()) {
        const value = getComputedStyle(node).backgroundColor, parts = value.match(/[\d.]+/g).map(Number); background = over(parts.slice(0, 3), background, parts[3] ?? 1);
      }
      const luminance = c => c.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const a = luminance(rgb(getComputedStyle(el).color)), b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    const contrast = await measureContrast();
    assert.ok(contrast >= 4.5, `Rewrite contrast ${contrast}`);
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    const lightContrast = await measureContrast(); assert.ok(lightContrast >= 4.5, `Light Rewrite contrast ${lightContrast}`); await shot('rewrite-light');
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    metrics.push({ engine: engineName, rewriteContrast: contrast, lightRewriteContrast: lightContrast });
    await page.route('**/rewrite', async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.fulfill({ json: { text: 'A clearer release plan.' } }); });
    const runRewrite = async (motion, off = false) => {
      await page.emulateMedia({ reducedMotion: motion });
      await page.evaluate(off => document.body.classList.toggle('motion-off', off), off);
      await page.locator('.docs-prose').click(); await page.locator('.docs-prose').press('ControlOrMeta+a');
      await choose(rewrite, 'Shorter');
      await page.waitForFunction(() => document.querySelector('.ribbon-ai')?.getAttribute('aria-busy') === 'true');
      assert.equal(await animations(), motion === 'reduce' || off ? 0 : 2, `working orb respects ${off ? 'Motion off' : motion}`);
      assert.deepEqual(await rewrite.locator('.orb-inline').evaluate(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }), [16, 16]);
      if (motion !== 'reduce' && !off) await shot('rewrite-working');
      await page.waitForFunction(() => document.querySelector('.ribbon-ai')?.getAttribute('aria-busy') === 'false'); assert.equal(await animations(), 0);
    };
    await runRewrite('no-preference'); await runRewrite('reduce'); await runRewrite('no-preference', true);
    await page.evaluate(() => document.body.classList.remove('motion-off'));
    await page.unroute('**/rewrite'); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await close(before);
    console.log(`PASS ${engineName}: real CSV editor, filtered writing fonts, font previews, shared 16px orb, working states, reduced motion and ${contrast.toFixed(2)}:1 text contrast`);

    // Selection menus use the same platform formatter as context menus.
    await page.evaluate(() => { aegis.canvas.setView({ x: 180, y: -530, z: 1 }); aegis.canvas.select(['nearnote']); document.getElementById('stage').focus(); });
    await page.getByLabel('More selection controls', { exact: true }).click(); await page.getByLabel('Format selection', { exact: true }).click();
    const underline = page.locator('.selection-menu-action[aria-label="Underline"] .selection-value');
    assert.equal(await underline.textContent(), platform === 'MacIntel' ? '⌘U' : 'Ctrl+U');
    assert.equal(await underline.evaluate(el => getComputedStyle(el).fontSize), '12px'); assert.ok((await underline.boundingBox()).width <= 96);
    for (const hint of await page.locator('.selection-menu .selection-value').allTextContents()) assert.ok(!hint.includes(' / '));
    assert.equal(await page.locator('#selectionBar .selection-ai .orb-inline').count(), 1); await shot('selection-shortcuts');

    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.evaluate(() => new Promise(resolve => aegis.apply([{ op: 'restore', cards: [structuredClone(aegis.canvas.board.cards.find(c => c.id === 'contextdoc'))], links: [] }], resolve)));
    before = await prepare('contextdoc'); await open('contextdoc'); await composition('source-alone', ['contextdoc']); await close({ ...before, selection: ['contextdoc'] });
    assert.deepEqual(errors, []); console.log(`PASS ${engineName}: ${platform} shortcut hints, 12px capped hint column and no browser exceptions`);
    await browser.close(); browser = null;
  }
  writeFileSync(join(output, 'metrics.json'), JSON.stringify({ metrics, captures }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: join(output, 'failure.png') });
    writeFileSync(join(output, 'failure.json'), JSON.stringify(await page.evaluate(() => ({
      view: aegis.canvas.view,
      elements: [...document.querySelectorAll('#stage, .side-editor, .editor-context, .editor-context-window, .tools, .side')].map(el => ({
        className: el.className, rect: el.getBoundingClientRect().toJSON(), transform: getComputedStyle(el).transform,
      })),
    })), null, 2));
  }
  throw error;
} finally { await browser?.close(); host.kill(); rmSync(data, { recursive: true, force: true }); }
