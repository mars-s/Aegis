import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'library-smoke-' + process.pid;
const data = mkdtempSync(join(tmpdir(), 'aegis-library-'));
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
let vite, browser, page;
const errors = [], checks = [];
const check = s => { checks.push(s); console.log('PASS', s); };
const ready = proc => new Promise((resolve, reject) => {
  let out = ''; const timeout = setTimeout(() => reject(new Error('Server startup timed out: ' + out)), 20000);
  proc.stdout.on('data', d => { out += d; const found = /"port":(\d+)/.exec(out) ?? /Local:.*:(5185)/.exec(out); if (found) { clearTimeout(timeout); resolve(found[1]); } });
  proc.stderr.on('data', d => { out += d; }); proc.on('exit', code => { clearTimeout(timeout); reject(new Error('Server exited ' + code + ': ' + out)); });
});
try {
  const port = await ready(host);
  vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5185', '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' }); await ready(vite);
  browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' }); await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  page.on('pageerror', e => errors.push(e.message));
  const api = async (path, body) => { const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); const j = await r.json(); assert.ok(r.ok, JSON.stringify(j)); return j; };
  const uiMenu = title => page.locator('.ctx-menu:not([hidden])').getByRole('menuitem', { name: title, exact: true });
  const row = id => page.locator(`.tree-row[data-node="${id}"], .tree-row[data-board="${id}"]`);
  const read = () => api('/library');
  const board = () => page.evaluate(() => aegis.canvas.board.id);
  const waitBoard = id => page.waitForFunction(id => aegis.canvas.board.id === id, id);
  const rename = async (id, name, cancel = false) => {
    await row(id).click({ button: 'right' }); await uiMenu('Rename').click();
    const field = row(id).locator('.name'); await field.fill(name); await field.press(cancel ? 'Escape' : 'Enter');
    await page.waitForFunction(() => !document.querySelector('.tree-row [contenteditable="plaintext-only"]'));
  };
  await page.goto(`http://127.0.0.1:5185/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.locator('#toast').evaluate(el => { el.hidden = true; });
  const original = await board();
  await page.locator('[data-add="project"]').click();
  await page.waitForFunction(() => document.querySelector('.tree-row.project'));
  let lib = await read(), project = lib.nodes.find(n => n.kind === 'project').id;
  await rename(project, 'Research');
  await page.locator('[data-add="folder"]').click();
  await page.waitForFunction(() => document.querySelector('.tree-row.folder'));
  lib = await read(); const folder = lib.nodes.find(n => n.kind === 'folder').id;
  await rename(folder, 'Interviews'); await rename(folder, 'Cancelled rename', true);
  assert.equal((await read()).nodes.find(n => n.id === folder).name, 'Interviews'); check('project and folder creation, rename, and Escape cancellation');
  await page.locator('[data-add="board"]').click();
  await page.waitForFunction(id => aegis.canvas.board.id !== id, original);
  const parent = await board(); assert.equal((await read()).boards.find(b => b.id === parent).parent, folder);
  await rename(parent, 'Session notes');
  await row(parent).locator('.name').dblclick(); await row(parent).locator('.name').fill('Interview board'); await row(parent).locator('.name').press('Enter');
  await page.waitForFunction(() => document.getElementById('boardName').textContent === 'Interview board'); check('scoped board creation and double-click rename');
  // Frameworks add editable content and links in place.
  await page.locator('[data-tool="templates"]').click();
  assert.equal(await page.locator('.template-menu-heading').allTextContents().then(a => a.join('|')), 'Add to this board|Start a new board');
  await uiMenu('Opportunity map').click();
  await page.waitForFunction(() => aegis.canvas.board.cards.length >= 9);
  await page.waitForFunction(async () => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.length >= 9);
  assert.equal((await api(`/boards/${parent}`)).links.length, 6); check('in-place framework saves its editable notes and six connectors');
  await page.locator('[data-tool="canvas"]').click(); await page.locator('#stage').click({ position: { x: 1050, y: 750 } });
  await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'canvas'));
  const child = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'canvas').props.board);
  assert.equal((await api(`/boards/${child}`)).parent, parent);
  await page.evaluate(() => { const c = aegis.canvas.board.cards.find(c => c.type === 'canvas'); aegis.canvas.frameIds([c.id], 1); });
  await page.waitForTimeout(700);
  await page.locator('.canvas-preview').dblclick(); await waitBoard(child);
  assert.equal(await page.locator('#boardCrumbs button').last().textContent(), 'Interview board');
  await page.locator('[data-tool="note"]').click(); await page.locator('#stage').click({ position: { x: 700, y: 400 } });
  await page.locator('.card.note [contenteditable]').fill('Child board evidence'); await page.keyboard.press('Escape');
  await page.waitForFunction(async () => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.some(c => c.text === 'Child board evidence'));
  await page.locator('#boardCrumbs button').last().click(); await waitBoard(parent);
  await page.evaluate(() => aegis.canvas.frameIds(aegis.canvas.board.cards.filter(c => c.type === 'canvas').map(c => c.id), 1));
  await page.waitForTimeout(700);
  await page.waitForFunction(() => document.querySelectorAll('.canvas-preview svg rect').length > 0);
  await page.screenshot({ path: out('library-canvas.png') }); check('Canvas placement, double-click navigation, child persistence, parent breadcrumb and live mini preview');
  // The Home view drills down, with geometry previews and Escape to return.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator(`.home-tile[data-into="${project}"]`).click();
  await page.locator(`.home-tile[data-into="${folder}"]`).click();
  await page.waitForFunction(() => document.querySelectorAll('.home-preview svg rect').length > 0);
  await page.screenshot({ path: out('library-home.png') });
  assert.ok((await page.locator('.library-home nav').textContent()).includes('Research'));
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  assert.equal(await page.locator('.home-heading h1').textContent(), 'Research');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.library-home').evaluate(el => el.open), false);
  await row(parent).click(); check('full-window Home, project/folder navigation, counts, board previews, breadcrumbs, Back and Escape');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('.library-home[open]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.home-preview svg rect').length > 0);
  await page.screenshot({ path: out('library-home-dark.png') }); await page.keyboard.press('Escape'); await page.emulateMedia({ colorScheme: 'light' });

  // Recursive duplication through the UI, including a child board.
  await row(project).click({ button: 'right' }); await uiMenu('Duplicate').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.tree-row.project .name')].some(n => n.textContent === 'Research copy'));
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
  await page.waitForFunction(async id => !(await aegis.host.get(`/boards/${id}`)).parent, child);
  assert.equal((await api(`/boards/${parent}`)).cards.some(c => c.type === 'canvas'), false); check('Move to submenu detaches a nested board and removes its old canvas card');
  // Drag the detached board back into a folder.
  await row(child).dragTo(row(folder));
  await page.waitForFunction(async ([id, folder]) => (await aegis.host.get('/library')).boards.find(b => b.id === id)?.parent === folder, [child, folder]); check('drag-to-move files a board into a folder');
  // Drag a panel across columns and verify the saved layout after reload.
  const head = page.locator('[data-panel="layers"] .phead'), box = await head.boundingBox();
  await page.mouse.move(box.x + 35, box.y + 15); await page.mouse.down(); await page.mouse.move(1320, 180, { steps: 20 }); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#sideRight [data-panel="layers"]'));
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  assert.ok(await page.locator('#sideRight [data-panel="layers"]').isVisible());
  await page.screenshot({ path: out('library-panels-right.png') });
  await page.locator('#settingsBtn').click(); await page.locator('#settings-tab-panels').click(); await page.locator('[data-panel-visibility="layers"]').uncheck(); await page.locator('#closeSettings').click();
  assert.equal(await page.locator('[data-panel="layers"]').isVisible(), false);
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  assert.equal(await page.locator('[data-panel="layers"]').isVisible(), false);
  await page.locator('#settingsBtn').click(); await page.locator('#settings-tab-panels').click(); await page.locator('[data-reset-panels]').click(); await page.locator('#closeSettings').click();
  assert.ok(await page.locator('#side [data-panel="layers"]').isVisible());
  await page.screenshot({ path: out('library-panels-reset.png') }); check('panel drag between sides, persisted order and visibility, Settings reset');
  // Template collections keep their notes together when dragged.
  await page.locator('[data-tool="templates"]').click(); await uiMenu('Affinity map').click();
  await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'template-group'));
  const groupId = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'template-group').id);
  await page.evaluate(id => { aegis.canvas.select([id]); aegis.canvas.frameIds([id], 1); }, groupId); await page.waitForTimeout(600);
  const beforeGroup = await api(`/boards/${child}`), groupData = beforeGroup.cards.find(c => c.id === groupId), noteData = beforeGroup.cards.find(c => c.parent === groupId);
  const groupBox = await page.locator(`.card[data-id="${groupId}"]`).boundingBox();
  await page.mouse.move(groupBox.x + groupBox.width - 18, groupBox.y + groupBox.height - 12); await page.mouse.down(); await page.mouse.move(groupBox.x + groupBox.width + 42, groupBox.y + groupBox.height + 28, { steps: 12 }); await page.mouse.up();
  await page.waitForFunction(async id => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.find(c => c.id === id).x !== aegis.canvas.board.cards.find(c => c.id === id).x || !aegis.canvas.busy(), groupId);
  await page.waitForTimeout(350);
  const afterGroup = await api(`/boards/${child}`), movedGroup = afterGroup.cards.find(c => c.id === groupId), movedNote = afterGroup.cards.find(c => c.id === noteData.id);
  assert.notEqual(movedGroup.x, groupData.x); assert.equal(movedGroup.x - groupData.x, movedNote.x - noteData.x); assert.equal(movedNote.parent, groupId);
  await page.screenshot({ path: out('library-template-groups.png') }); check('template groups move with their contained notes');
  // Folder copies also work, and a folder can live at the top level.
  await row(folder).click({ button: 'right' }); await uiMenu('Duplicate').click();
  await page.waitForFunction(async () => (await aegis.host.get('/library')).nodes.some(n => n.name === 'Interviews copy'));
  const folderCopy = (await read()).nodes.find(n => n.name === 'Interviews copy').id;
  await row(folderCopy).click({ button: 'right' }); await uiMenu('Move to…').click(); await uiMenu('All projects (top level)').click();
  await page.waitForFunction(async id => (await aegis.host.get('/library')).nodes.find(n => n.id === id).parent === null, folderCopy);
  check('recursive folder copy and Move to top level');
  // New-board starters create and open another board.
  await page.locator('[data-tool="templates"]').click(); await uiMenu('App plan').click();
  await page.waitForFunction(() => aegis.canvas.board.name === 'App plan');
  const starter = await board(); assert.equal((await api(`/boards/${starter}`)).cards.filter(c => c.type === 'todo').length, 1); check('new-board starter opens and saves a separate board');
  // Delete a non-empty project and verify all copied boards are gone.
  page.once('dialog', dialog => dialog.dismiss());
  await row(copyProject).click({ button: 'right' }); await uiMenu('Delete').click();
  assert.ok((await read()).nodes.some(n => n.id === copyProject)); check('cancelling deletion leaves the project intact');
  page.on('dialog', dialog => dialog.accept());
  await row(copyProject).click({ button: 'right' }); await uiMenu('Delete').click();
  await page.waitForFunction(async id => !(await aegis.host.get('/library')).nodes.some(n => n.id === id), copyProject);
  assert.equal((await read()).boards.some(b => b.id === copyParent || b.id === copyChild), false); check('confirmed non-empty project deletion removes its nested boards');
  // Delete the open board, then all remaining boards through their HTTP action.
  await row(starter).click({ button: 'right' }); await uiMenu('Delete').click(); await page.waitForFunction(id => aegis.canvas.board.id !== id, starter);
  for (const b of (await read()).boards) await api(`/boards/${b.id}/delete`, {});
  lib = await read(); assert.equal(lib.boards.length, 1);
  await waitBoard(lib.boards[0].id);
  assert.equal((await api(`/boards/${lib.boards[0].id}`)).cards.length, 0); check('deleting the open board switches safely, and deleting the last board creates a fresh board');
  assert.deepEqual(errors, []);
  writeFileSync(out('library-smoke-results.json'), JSON.stringify({ data, checks, errors }, null, 2));
  console.log('DATA', data, '\nALL', checks.length, 'CHECKS PASSED');
} catch (e) {
  console.error(e); console.error('PAGE ERRORS', errors); if (page) await page.screenshot({ path: out('library-fail.png') }); process.exitCode = 1;
} finally { await browser?.close(); host.kill(); vite?.kill(); }
