import { waitForAsync } from './poll.mjs';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

// The app answers its own confirmations: WKWebView returns false from window.confirm() without showing it.
const nativeDialogs = [];
const answer = async yes => {
  const dialog = page.getByRole('dialog').filter({ has: page.locator('.aegis-confirm-actions') });
  await dialog.waitFor();
  assert.ok(!nativeDialogs.length, 'a native dialog was opened');
  await dialog.locator(yes ? '.aegis-confirm-actions button:last-child' : '.aegis-confirm-actions button:first-child').click();
  await dialog.waitFor({ state: 'detached' });
};
const PORT_OFFSET = Number(process.env.AEGIS_PORT_OFFSET || 0); // separate worktrees can run checks at once
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'library-smoke-' + process.pid;
const data = mkdtempSync(join(tmpdir(), 'aegis-library-'));
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
let vite, browser, page;
const errors = [], checks = [];
const check = s => { checks.push(s); console.log('PASS', s); };
const ready = proc => new Promise((resolve, reject) => {
  let out = ''; const timeout = setTimeout(() => reject(new Error('Server startup timed out: ' + out)), 20000);
  proc.stdout.on('data', d => { out += d; const found = /"port":(\d+)/.exec(out) ?? new RegExp(`Local:.*:(${5185 + PORT_OFFSET})`).exec(out); if (found) { clearTimeout(timeout); resolve(found[1]); } });
  proc.stderr.on('data', d => { out += d; }); proc.on('exit', code => { clearTimeout(timeout); reject(new Error('Server exited ' + code + ': ' + out)); });
});
try {
  const port = await ready(host);
  vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(5185 + PORT_OFFSET), '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' }); await ready(vite);
  browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' }); await page.addInitScript(() => localStorage.setItem('aegis:introduction-complete', '1'));
  page.on('dialog', d => { nativeDialogs.push(d.message()); d.dismiss(); });
  page.on('pageerror', e => errors.push(e.message));
  const api = async (path, body) => { const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); const j = await r.json(); assert.ok(r.ok, JSON.stringify(j)); return j; };
  const uiMenu = title => page.locator('.aegis-action-menu:not([hidden])').getByRole('menuitem', { name: title, exact: true });
  const row = id => page.locator(`.tree-row[data-node="${id}"], .tree-row[data-board="${id}"]`);
  const read = () => api('/library');
  const board = () => page.evaluate(() => aegis.canvas.board.id);
  const waitBoard = id => page.waitForFunction(id => aegis.canvas.board.id === id, id);
  const rename = async (id, name, cancel = false) => {
    await row(id).locator('.row-more').focus(); await page.keyboard.press('Enter'); await uiMenu('Rename').click();
    const field = row(id).locator('.name'), previous = await field.elementHandle(); await field.fill(name); await field.press(cancel ? 'Escape' : 'Enter');
    await page.waitForFunction(el => !el.isConnected, previous); await previous.dispose();
    await page.waitForFunction(() => !document.querySelector('.tree-row [contenteditable="plaintext-only"]'));
  };
  await page.goto(`http://127.0.0.1:${5185 + PORT_OFFSET}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.locator('#toast').evaluate(el => { el.hidden = true; });
  const original = await board();
  await page.locator('#boardName').click();
  await page.locator('#side').waitFor({ state: 'visible' });
  // Round 3 hierarchy: active windows get the available space, reference stays folded.
  const windows = page.locator('#side > [data-panel="layers"]'), library = page.locator('#side > [data-panel="library"]');
  assert.deepEqual(await page.locator('#side > .pbox').evaluateAll(boxes => boxes.map(el => el.dataset.panel)), ['layers', 'library']);
  assert.equal(await page.locator('#side > .pbox').first().getAttribute('data-panel'), 'layers');
  assert.match(await windows.locator('.phead').textContent(), /^Windows/);
  assert.ok((await windows.boundingBox()).height <= (await page.locator('#side').boundingBox()).height * .45 + 1);
  assert.ok((await library.boundingBox()).height >= 240);
  assert.equal(await windows.getByRole('searchbox', { name: 'Filter windows' }).isVisible(), false, 'small Windows lists need no filter');
  const navFolders = [];
  // Enough folders that the more compact 30px rows still overflow the Library pane.
  for (let i = 0; i < 24; i++) navFolders.push((await api('/library', { op: 'create', kind: 'folder', name: `Navigation folder ${i + 1}` })).created);
  await row(navFolders.at(-1)).waitFor();
  await page.evaluate(() => new Promise(resolve => aegisCtx.apply(Array.from({ length: 25 }, (_, i) => ({ op: 'create', type: 'note', newId: `navwindow${i}`, text: `Window ${i + 1}`, x: (i % 5) * 280, y: Math.floor(i / 5) * 180 })), resolve)));
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 25);
  const filter = windows.getByRole('searchbox', { name: 'Filter windows', exact: true });
  await filter.click(); await page.keyboard.type('wInDoW 25');
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 1);
  assert.equal(await windows.locator('.layer-row .name').textContent(), 'Window 25', 'the Windows filter matches names live without case sensitivity');
  await page.screenshot({ path: out(`r5-windows-filter-${Date.now()}.png`) });
  await filter.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 25);
  assert.equal(await filter.inputValue(), ''); assert.equal(await page.locator('#side').isVisible(), true, 'Escape clears search before closing the side bar');
  await filter.fill('No such window'); await windows.getByRole('status').waitFor();
  assert.equal(await windows.locator('.layer-row').count(), 0);
  await filter.press('Escape');
  await windows.locator('.ptoggle').click(); assert.equal(await filter.isVisible(), false, 'a folded Windows section hides its filter');
  await windows.locator('.ptoggle').click(); await filter.waitFor();
  check('Windows filter appears for long lists, matches names live, shows an empty result, clears with Escape and follows its disclosure');
  // PM5.5: filtering borrows only the space it needs, without saving a new panel size.
  const resizeWindows = windows.locator('.resize-handle'), resizeBox = await resizeWindows.boundingBox();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down(); await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y - 80, { steps: 6 }); await page.mouse.up();
  const unfiltered = await windows.locator('.pbody').boundingBox(), libraryBefore = await library.boundingBox();
  const savedSize = await page.evaluate(() => JSON.parse(localStorage.getItem('aegis:panels')).heights.layers);
  // Give exactly two of the 25 fixture windows the same searchable name.
  await page.evaluate(() => new Promise(resolve => aegisCtx.apply([0, 1].map(i => ({ op: 'update', id: `navwindow${i}`, set: { heading: `Proposal ${i + 1}` } })), resolve)));
  for (const width of [1440, 1586]) {
    await page.setViewportSize({ width, height: 1000 });
    await filter.click(); await page.keyboard.type('proposal');
    await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 2);
    assert.equal(await windows.locator('.pcount').textContent(), '2 of 25');
    assert.ok((await windows.locator('.pbody').boundingBox()).height <= 150, 'two results use only their content height');
    assert.ok((await library.boundingBox()).height > libraryBefore.height + 100, 'Library receives the reclaimed height');
    assert.equal(await windows.locator('.pbody').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, 'both results fit without a scrollbar');
    await page.screenshot({ path: out(`r6-windows-filter-${width}-${Date.now()}.png`) });
    await filter.press('Escape');
    assert.equal(await windows.locator('.pcount').textContent(), '25');
    assert.ok(Math.abs((await windows.locator('.pbody').boundingBox()).height - unfiltered.height) <= 1, 'clearing restores the manually resized Windows height');
  }
  await filter.click(); await page.keyboard.type('no such window'); await windows.getByRole('status').waitFor();
  assert.equal(await windows.locator('.pcount').textContent(), '0 of 25');
  assert.ok((await windows.locator('.pbody').boundingBox()).height <= 170, 'empty results do not reserve blank space');
  await page.screenshot({ path: out(`r6-windows-empty-${Date.now()}.png`) });
  await windows.getByRole('button', { name: 'Clear filter', exact: true }).click();
  assert.equal(await filter.inputValue(), '');
  assert.equal(await filter.evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('aegis:panels')).heights.layers), savedSize, 'filtering never overwrites the saved panel height');
  await page.keyboard.type('window'); await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 23);
  assert.ok((await windows.locator('.pbody').boundingBox()).height <= 320, 'many matching windows stay within the sensible maximum');
  assert.equal(await windows.locator('.pbody').evaluate(el => el.scrollHeight > el.clientHeight), true, 'a long filtered result remains scrollable');
  await filter.press('Escape');
  // Restore the default layout for the independent scrolling checks below.
  await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('aegis:panels')); delete state.heights.layers; localStorage.setItem('aegis:panels', JSON.stringify(state)); });
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  check('filtered Windows shows 2 of 25, gives spare height to Library, has a compact empty state, and restores the saved unfiltered size');
  for (const width of [1440, 1586]) {
    await page.setViewportSize({ width, height: 992 });
    await page.waitForFunction(() => Math.abs(document.getElementById('side').getBoundingClientRect().left - 8) < .5);
    assert.ok((await windows.boundingBox()).height <= (await page.locator('#side').boundingBox()).height * .45 + 1, 'Windows uses at most 45% of the sidebar');
    assert.ok((await library.boundingBox()).height >= 240, 'Library keeps at least 240px');
    await page.screenshot({ path: out(`r3-nav-${Date.now()}-windows-first-${width}.png`) });
  }
  const scrollWindows = windows.locator('.pbody'), scrollLibrary = library.locator('.tree');
  await scrollWindows.hover(); await page.mouse.wheel(0, 440);
  await page.waitForFunction(() => document.querySelector('[data-panel="layers"] .pbody').scrollTop > 0);
  const windowScroll = await scrollWindows.evaluate(el => el.scrollTop);
  await scrollLibrary.hover(); await page.mouse.wheel(0, 300);
  await page.waitForFunction(() => document.querySelector('[data-panel="library"] .tree').scrollTop > 0);
  assert.equal(await scrollWindows.evaluate(el => el.scrollTop), windowScroll, 'Library scrolling does not move Windows');
  assert.equal(await page.locator('#side').evaluate(el => el.scrollTop), 0, 'the outer sidebar does not scroll');
  // Upgrade an older layout without a saved reference preference.
  await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('aegis:panels')); state.columns.left = ['library', 'layers', 'keys']; state.folded = {}; localStorage.setItem('aegis:panels', JSON.stringify(state)); });
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  assert.equal(await page.locator('#side > .pbox').first().getAttribute('data-panel'), 'layers');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobileHub').getByRole('button', { name: 'Windows', exact: true }).click();
  assert.equal(await page.locator('#mobileTitle').textContent(), 'Windows');
  await page.screenshot({ path: out(`r3-nav-${Date.now()}-windows-phone-390.png`) });
  await page.getByRole('button', { name: 'Close sheet', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => new Promise(resolve => aegisCtx.apply([{ op: 'delete', ids: aegis.canvas.board.cards.map(c => c.id) }], resolve)));
  for (const id of navFolders) await api('/library', { op: 'delete', id, recursive: true });
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 0);
  check('Windows stays below 45% at 1440/1586 and Library keeps at least 240px; each section scrolls independently; Shortcuts remembers changes; phone says Windows');
  await page.getByRole('button', { name: 'New in library' }).click();
  await page.getByRole('menuitem', { name: 'New project' }).click();
  await page.waitForFunction(() => document.querySelector('.tree-row.project'));
  let lib = await read(), project = lib.nodes.find(n => n.kind === 'project').id;
  await rename(project, 'Research');
  const nameWidths = await page.locator('.tree-row').evaluateAll(rows => rows.map(row => ({ ratio: row.querySelector('.name').getBoundingClientRect().width / row.getBoundingClientRect().width, title: row.querySelector('.name').title, text: row.querySelector('.name').textContent, buttons: row.querySelectorAll('.row-more').length })));
  assert.ok(nameWidths.every(row => row.ratio >= .6 && row.title === row.text && row.buttons === 1), JSON.stringify(nameWidths));
  const more = row(project).locator('.row-more'); await more.focus();
  assert.equal((await more.boundingBox()).width, 32); assert.equal((await more.boundingBox()).height, 32);
  assert.equal(await more.evaluate(el => getComputedStyle(el).opacity), '1');
  await more.press('ArrowDown'); await uiMenu('Rename').waitFor(); await page.keyboard.press('Escape');
  assert.equal(await more.evaluate(el => document.activeElement === el), true);
  check('library names use at least 60% of each row; one 28px More button opens from the keyboard and Escape restores focus');
  await page.screenshot({ path: out(`r2-library-rows-${Date.now()}.png`) });

  await page.getByRole('button', { name: 'New in library' }).click();
  await page.getByRole('menuitem', { name: 'New folder' }).click();
  await page.waitForFunction(() => document.querySelector('.tree-row.folder'));
  lib = await read(); const folder = lib.nodes.find(n => n.kind === 'folder').id;
  await rename(folder, 'Interviews'); await rename(folder, 'Cancelled rename', true);
  assert.equal((await read()).nodes.find(n => n.id === folder).name, 'Interviews'); check('project and folder creation, rename, and Escape cancellation');
  const otherProject = (await api('/library', { op: 'create', kind: 'project', name: 'Other project' })).created;
  const looseFolder = (await api('/library', { op: 'create', kind: 'folder', name: 'Loose folder' })).created;
  await row(otherProject).waitFor();
  await page.getByRole('button', { name: 'New in library' }).click();
  await page.getByRole('menuitem', { name: 'New board' }).click();
  await page.waitForFunction(id => aegis.canvas.board.id !== id, original);
  const parent = await board(); assert.equal((await read()).boards.find(b => b.id === parent).parent, folder);
  await page.waitForFunction(() => document.querySelectorAll('.tree-row.project').length === 1);
  assert.equal(await row(otherProject).count(), 0); assert.equal(await row(looseFolder).count(), 0);
  assert.equal(await row(original).count(), 0); assert.equal(await page.locator('.tree-sep').count(), 0);
  check('opening a project board scopes the tree to its project and excludes loose items');
  await rename(parent, 'Session notes');
  await row(parent).locator('.name').dblclick(); await row(parent).locator('.name').fill('Interview board'); await row(parent).locator('.name').press('Enter');
  await page.waitForFunction(() => document.getElementById('boardName').textContent === 'Interview board'); check('scoped board creation and double-click rename');
  await api('/boards', { name: 'Child board', boardParent: parent, at: { x: 900, y: 500 } });
  await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'canvas'));
  const child = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'canvas').props.board);
  assert.equal((await api(`/boards/${child}`)).parent, parent);
  await page.evaluate(() => { const c = aegis.canvas.board.cards.find(c => c.type === 'canvas'); aegis.canvas.frameIds([c.id], 1); });
  await page.waitForTimeout(700);
  await page.locator('.canvas-preview').dblclick(); await waitBoard(child);
  assert.deepEqual(await page.evaluate(() => { const s = document.getElementById('stage'); return [aegis.canvas.board.cards.length, aegis.canvas.view.x, aegis.canvas.view.y, aegis.canvas.view.z, s.clientWidth / 2, s.clientHeight / 2]; }).then(([count, x, y, z, cx, cy]) => [count, x === cx, y === cy, z]), [0, true, true, 1]);
  assert.equal(await page.locator('#boardCrumbs button').last().textContent(), 'Interview board');
  await page.evaluate(() => new Promise(resolve => aegisCtx.apply([{ op: 'create', type: 'note', text: 'Child board evidence', x: 0, y: 0 }], resolve)));
  await waitForAsync(page, async () => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.some(c => c.text === 'Child board evidence'));
  await page.evaluate(() => aegis.canvas.setView({ x: -15000, y: -12000, z: .2 }));
  await waitForAsync(page, async () => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).view.x === -15000);
  await page.locator('#boardCrumbs button').last().click(); await waitBoard(parent);
  await page.evaluate(() => aegis.canvas.frameIds(aegis.canvas.board.cards.filter(c => c.type === 'canvas').map(c => c.id), 1));
  await page.waitForTimeout(550);
  await page.locator('.canvas-preview').dblclick(); await waitBoard(child);
  await page.waitForFunction(() => {
    const r = document.querySelector('.card.note')?.getBoundingClientRect();
    return r && r.left > 280 && r.top > 50 && r.right < innerWidth - 20 && r.bottom < innerHeight - 80;
  });
  assert.notEqual(await page.evaluate(() => aegis.canvas.view.x), -15000);
  check('opening an empty child centres the view, and reopening content fits it despite an off-screen saved view');
  await page.locator('#boardCrumbs button').last().click(); await waitBoard(parent);
  await page.evaluate(() => aegis.canvas.frameIds(aegis.canvas.board.cards.filter(c => c.type === 'canvas').map(c => c.id), 1));
  await page.waitForTimeout(700);
  await page.waitForFunction(() => document.querySelectorAll('.canvas-preview svg rect').length > 0);
  await page.screenshot({ path: out('library-canvas.png') }); check('Canvas placement, double-click navigation, child persistence, parent breadcrumb and live mini preview');
  // The Home view drills down, with geometry previews and Escape to return.
  await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.locator('.library-home[open]').waitFor();
  assert.equal(await page.getByRole('searchbox', { name: 'Search library', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  assert.deepEqual(await page.getByRole('menu', { name: 'New in library', exact: true }).getByRole('menuitem').allTextContents(), ['Board', 'Folder', 'Project']);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.library-home').evaluate(el => el.open), true);
  check('Home focuses search and keeps Board, Folder and Project in one keyboard-dismissable New menu');

  assert.ok(await row(otherProject).count()); assert.ok(await row(looseFolder).count()); assert.ok(await row(original).count());
  await page.locator(`.home-tile[data-item="${otherProject}"]`).click({ button: 'right' }); await uiMenu('Rename').click();
  const homeName = page.locator(`.home-tile[data-item="${otherProject}"] strong`);
  await homeName.fill('Other project renamed'); await homeName.press('Enter');
  await waitForAsync(page, async id => (await aegis.host.get('/library')).nodes.find(n => n.id === id).name === 'Other project renamed', otherProject);
  await homeName.waitFor();
  assert.equal(await page.locator('.library-home[open]').evaluate(el => el.open), true);
  check('Home can rename a project outside the current board scope without closing the overview');
  const coverButton = () => page.locator(`[data-project-cover="${project}"]`);
  const coverPreview = () => page.locator(`[data-cover="${project}"]`);
  await coverButton().click();
  await page.getByRole('menuitem', { name: 'Choose an image…', exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1440; c.height = 720;
    const ctx = c.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 1440, 720);
    gradient.addColorStop(0, '#114e54'); gradient.addColorStop(1, '#dfb465'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1440, 720);
    ctx.fillStyle = '#ffffff'; ctx.font = '64px sans-serif'; ctx.fillText('Research', 90, 380);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('[data-cover-file]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await coverPreview().locator('img').waitFor();
  await page.waitForFunction(id => { const img = document.querySelector(`[data-cover="${id}"] img`); return img?.complete && img.naturalWidth === 720; }, project);
  const savedCover = (await read()).nodes.find(n => n.id === project).cover;
  assert.match(savedCover, /^data:image\/jpeg;base64,/);
  assert.deepEqual(await coverPreview().locator('img').evaluate(img => [img.naturalWidth, img.naturalHeight]), [720, 360]);
  await page.screenshot({ path: out('library-project-cover.png') });
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.locator('.library-home[open]').waitFor();
  await coverPreview().locator('img').waitFor(); assert.equal(await coverPreview().locator('img').getAttribute('src'), savedCover);
  await coverButton().click(); await page.getByRole('menuitem', { name: 'Use the first board', exact: true }).click();
  await coverPreview().locator('svg').waitFor(); assert.equal((await read()).nodes.find(n => n.id === project).cover, undefined);
  check('project image picker converts a 1440 px PNG to a 720 px JPEG, persists across reload and restores first-board preview');
  await page.locator(`.home-tile[data-into="${project}"]`).click();
  assert.equal(await row(otherProject).count(), 0); assert.ok(await row(project).count());
  await page.locator(`.home-tile[data-into="${folder}"]`).click();
  assert.equal(await row(otherProject).count(), 0); assert.ok(await row(project).count());
  await page.waitForFunction(() => document.querySelectorAll('.home-preview svg rect').length > 0);
  await page.screenshot({ path: out('library-home.png') });
  assert.ok((await page.locator('.library-home nav').textContent()).includes('Research'));
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  assert.equal(await page.locator('.home-heading h1').textContent(), 'Research');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.library-home').evaluate(el => el.open), false);
  await row(parent).click(); check('full-window Home, project/folder navigation, counts, board previews, breadcrumbs, Back, Escape and matching tree scope');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.locator('.library-home[open]').waitFor();
  await page.locator('.library-home[open]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.home-preview svg rect').length > 0);
  await page.screenshot({ path: out('library-home-dark.png') }); await page.keyboard.press('Escape'); await page.emulateMedia({ colorScheme: 'light' });

  // Recursive duplication through the UI, including a child board.
  await row(project).click({ button: 'right' }); await uiMenu('Duplicate').click();
  await waitForAsync(page, async () => (await aegis.host.get('/library')).nodes.some(n => n.name === 'Research copy'));
  lib = await read(); const copyProject = lib.nodes.find(n => n.name === 'Research copy').id;
  const copyFolder = lib.nodes.find(n => n.parent === copyProject).id;
  const copyParent = lib.boards.find(b => b.parent === copyFolder && !b.boardParent).id;
  const copyData = await api(`/boards/${copyParent}`), copyChild = copyData.cards.find(c => c.type === 'canvas').props.board;
  assert.notEqual(copyChild, child); assert.equal((await api(`/boards/${copyChild}`)).parent, copyParent);
  assert.equal((await api(`/boards/${copyChild}`)).cards[0].text, 'Child board evidence'); check('recursive project duplication creates independent child boards');
  // A current board's ancestors must reopen after reload even if stored as collapsed.
  await page.evaluate(id => { localStorage.setItem('aegis:board', id); localStorage.setItem('aegis:lib-open', '[]'); }, child);
  await page.reload(); await page.waitForFunction(id => window.aegis?.canvas?.board?.id === id, child);
  assert.ok(await row(child).isVisible()); assert.equal(await row(project).getAttribute('aria-expanded'), 'true'); assert.equal(await row(folder).getAttribute('aria-expanded'), 'true'); check('current board ancestors auto-open across reload');
  // Move a child out through the destination submenu, removing the old parent card.
  await row(child).click({ button: 'right' }); await uiMenu('Move to…').click(); await uiMenu('Loose boards').click();
  await waitForAsync(page, async id => !(await aegis.host.get(`/boards/${id}`)).parent, child);
  assert.equal((await api(`/boards/${parent}`)).cards.some(c => c.type === 'canvas'), false); check('Move to submenu detaches a nested board and removes its old canvas card');
  // Drag the detached board back into a folder.
  const libraryGrip = await page.locator('[data-panel="library"] .resize-handle').boundingBox();
  await page.mouse.move(libraryGrip.x + libraryGrip.width / 2, libraryGrip.y + 3); await page.mouse.down(); await page.mouse.move(libraryGrip.x + libraryGrip.width / 2, libraryGrip.y + 223, { steps: 10 }); await page.mouse.up();
  await row(child).dragTo(row(folder));
  await waitForAsync(page, async ([id, folder]) => (await aegis.host.get('/library')).boards.find(b => b.id === id)?.parent === folder, [child, folder]); check('drag-to-move files a board into a folder');
  // All projects exposes other projects again, and a loose folder scopes to its outermost ancestor.
  await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.locator('.library-home[open]').waitFor();
  assert.ok(await row(otherProject).count()); assert.ok(await row(copyProject).count());
  await page.locator(`.home-tile[data-into="${looseFolder}"]`).click();
  assert.equal(await page.locator('.tree-row.project').count(), 0); assert.ok(await row(looseFolder).count()); assert.equal(await row(project).count(), 0);
  await page.keyboard.press('Escape'); await page.waitForFunction(id => !document.querySelector(`.tree-row[data-node="${id}"]`), looseFolder); assert.ok(await row(project).count()); assert.equal(await row(looseFolder).count(), 0);
  check('Home All projects shows everything, loose-folder Home scopes to that folder, and closing restores the board project');
  // Drag a panel across columns and verify the saved layout after reload.
  const head = page.locator('[data-panel="layers"] .phead'), box = await head.boundingBox();
  const layoutBeforeDrag = await page.evaluate(() => localStorage.getItem('aegis:panels'));
  await page.mouse.move(box.x + 35, box.y + 15); await page.mouse.down(); await page.mouse.move(1320, 180, { steps: 20 });
  assert.ok(await page.locator('#side .panel-slot').count()); assert.ok(await page.locator('#sideRight .panel-slot').count());
  assert.equal(await page.locator('.panel-slot.on').count(), 1);
  assert.equal(await page.locator('body > [data-panel="layers"].panel-lifted').count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('aegis:panels')), layoutBeforeDrag);
  await page.screenshot({ path: out('library-panel-slots.png') });
  await page.mouse.up();
  assert.equal(await page.locator('.panel-slot, .panel-lifted').count(), 0);
  await page.waitForFunction(() => document.querySelector('#sideRight [data-panel="layers"]'));
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  assert.ok(await page.locator('#sideRight [data-panel="layers"]').isVisible());
  const rightRow = page.locator('#sideRight .layer-row').first(), rightMore = rightRow.locator('.row-more');
  assert.ok(await rightRow.evaluate(row => row.querySelector('.name').getBoundingClientRect().width / row.getBoundingClientRect().width >= .6));
  await rightMore.focus(); await rightMore.press('Enter'); await uiMenu('Rename').waitFor(); await page.keyboard.press('Escape');
  assert.equal(await rightMore.evaluate(el => document.activeElement === el), true);
  check('right sidebar keeps wide names and the same keyboard row menu with focus return');

  await page.screenshot({ path: out('library-panels-right.png') });
  // A cancelled drag restores the original DOM order and saved columns.
  const orderBeforeCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('aegis:panels')).columns);
  const rightHead = await page.locator('#sideRight [data-panel="layers"] .phead').boundingBox();
  await page.mouse.move(rightHead.x + 35, rightHead.y + 15); await page.mouse.down(); await page.mouse.move(130, 280, { steps: 12 });
  assert.ok(await page.locator('.panel-slot').count()); await page.keyboard.press('Escape'); await page.mouse.up();
  assert.equal(await page.locator('.panel-slot, .panel-lifted').count(), 0);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('aegis:panels')).columns), orderBeforeCancel);
  assert.ok(await page.locator('#sideRight [data-panel="layers"]').count());
  await page.mouse.move(rightHead.x + 35, rightHead.y + 15); await page.mouse.down(); await page.mouse.move(130, 280, { steps: 12 });
  assert.ok(await page.locator('.panel-slot').count());
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
  await page.mouse.up();
  assert.equal(await page.locator('.panel-slot, .panel-lifted').count(), 0);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('aegis:panels')).columns), orderBeforeCancel);
  // Touch header gestures must not start desktop rearrangement. The library stays pinned.
  for (const [id, pointerType] of [['layers', 'touch'], ['library', 'mouse']]) {
    await page.locator(`[data-panel="${id}"] .phead`).evaluate((el, pointerType) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType, pointerId: 41, button: 0, clientX: r.left + 35, clientY: r.top + 15 }));
      window.dispatchEvent(new PointerEvent('pointermove', { pointerType, pointerId: 41, clientX: 700, clientY: 400 }));
    }, pointerType);
    assert.equal(await page.locator('.panel-slot, .panel-lifted').count(), 0);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 41 })));
  }
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('aegis:panels')).columns), orderBeforeCancel);
  assert.equal(await page.locator('#side > .pbox').first().getAttribute('data-panel'), 'library');
  check('panel lift shows selectable slots on both sides, Escape and pointer cancellation restore order, touch skips dragging and Library stays pinned');
  await page.mouse.move(page.viewportSize().width - 24, 20); await page.locator('#settingsBtn').click(); await page.locator('#settings-tab-panels').click(); await page.locator('[data-panel-visibility="layers"]').uncheck(); await page.locator('#closeSettings').click();
  assert.equal(await page.locator('[data-panel="layers"]').isVisible(), false);
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  assert.equal(await page.locator('[data-panel="layers"]').isVisible(), false);
  await page.mouse.move(page.viewportSize().width - 24, 20); await page.locator('#settingsBtn').click(); await page.locator('#settings-tab-panels').click(); await page.locator('[data-reset-panels]').click(); await page.locator('#closeSettings').click();
  assert.ok(await page.locator('#side [data-panel="layers"]').isVisible());
  await page.screenshot({ path: out('library-panels-reset.png') }); check('panel drag between sides, persisted order and visibility, Settings reset');
} catch (e) {
  console.error(e); console.error('PAGE ERRORS', errors); if (page) await page.screenshot({ path: out('library-fail.png') }); process.exitCode = 1;
} finally { await browser?.close(); host.kill(); vite?.kill(); }
