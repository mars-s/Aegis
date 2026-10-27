import { assertCameraScale } from './static-geometry.mjs';
import { choose } from './dropdown.mjs';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
const offset = Number(process.env.AEGIS_PORT_OFFSET || 0), repo = new URL('../..', import.meta.url).pathname;
const token = `canvas-${process.pid}`, reproduce = process.argv.includes('--reproduce');
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-canvas-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
const ready = (proc, pattern) => new Promise((resolve, reject) => { let output = ''; const timer = setTimeout(() => reject(new Error(output || 'Startup timed out')), 20000); proc.stdout.on('data', d => { output += d; const m = pattern.exec(output); if (m) { clearTimeout(timer); resolve(m[1]); } }); proc.stderr.on('data', d => output += d); proc.on('exit', () => { clearTimeout(timer); reject(new Error(output)); }); });
let web, browser, page;
const errors = [], results = [];
const verify = (name, value) => { results.push({ name, value }); console.log(`${value ? 'PASS' : reproduce ? 'REPRODUCED' : 'FAIL'} ${name}`); if (!reproduce) assert.ok(value, name); };
try {
  const port = await ready(host, /"port":(\d+)/);
  web = spawn('npx', ['vite', '--port', String(5190 + offset), '--strictPort'], { cwd: repo + '/app' }); await ready(web, /Local:.*:(\d+)/);
  browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('dialog', d => { nativeDialogs.push(d.message()); d.dismiss(); });
  page.on('pageerror', e => errors.push(e.message)); await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  await page.goto(`http://127.0.0.1:${5190 + offset}/?port=${port}&token=${token}`); await page.waitForFunction(() => window.aegis?.canvas?.board);
  const api = (path, body) => page.evaluate(([path, body]) => body === undefined ? aegis.host.get(path) : aegis.host.post(path, body), [path, body]);
  const settle = () => page.waitForTimeout(180);
  const apply = async commands => { await page.evaluate(c => aegis.apply(c), commands); await settle(); };
  await apply([
    { op: 'create', newId: 'canvasnote', type: 'note', text: 'A thought', heading: 'Growing note', x: 0, y: 0, w: 240, h: 120 },
    { op: 'create', newId: 'canvastodo', type: 'todo', text: 'Checklist', x: 300, y: 0, w: 240, h: 120, items: [{ text: 'One task', done: false }] },
    { op: 'connect', newId: 'canvaslink', a: 'canvasnote', b: 'canvastodo', label: 'Next step' },
    { op: 'create', newId: 'canvasgroup', type: 'template-group', text: 'Research', x: 600, y: 0, w: 260, h: 250 },
    { op: 'create', newId: 'canvascoll', type: 'coll', text: 'Collection', x: 600, y: 300, w: 260, h: 180 },
  ]);
  await page.evaluate(() => { aegis.canvas.setView({ x: 430, y: 240, z: 1 }); aegis.canvas.select(['canvasnote']); }); await settle();
  verify('toolbar centre within 1 px and 8 px clear of rotation handle', await page.evaluate(() => { const b = document.querySelector('#selectionBar').getBoundingClientRect(), c = document.querySelector('[data-id="canvasnote"].card').getBoundingClientRect(), r = document.querySelector('.rotation-handle').getBoundingClientRect(); return Math.abs(b.left + b.width / 2 - c.left - c.width / 2) <= 1 && Math.abs(r.top - b.bottom - 8) <= 1; }));
  await page.getByLabel('Colour', { exact: true }).click(); await settle();
  verify('colour swatches have equal width and height', await page.locator('.selection-colours button').evaluateAll(nodes => nodes.every(el => { const s = getComputedStyle(el, '::before'); return s.width === s.height && s.flexShrink === '0'; })));
  await page.screenshot({ path: out(`canvas-swatch-circles-${Date.now()}.png`) });
  await page.keyboard.press('Escape');
  if (!reproduce) {
    await page.getByLabel('More selection controls', { exact: true }).click();
    await page.getByLabel('Format selection', { exact: true }).click();
    const field = page.getByLabel('Line height', { exact: true }); const initial = Number(await field.inputValue());
    await field.focus(); await field.press('ArrowUp'); await settle();
    verify('arrow keys edit numeric fields inside More', await page.evaluate(expected => Math.abs(aegis.canvas.board.cards.find(c => c.id === 'canvasnote').props?.lh - expected) < .001, initial + .05));
    await page.keyboard.press('Escape'); await apply([{ op: 'update', id: 'canvasnote', set: { props: { lh: null } } }]);
  }
  const note = page.locator('.card[data-id="canvasnote"] .body'); await note.focus(); await note.fill(Array.from({ length: 14 }, (_, i) => `Line ${i + 1}`).join('\n')); await settle();
  verify('note grows and saves its height while typing', await page.evaluate(async () => { const c = aegis.canvas.board.cards.find(c => c.id === 'canvasnote'); const saved = await aegis.host.get(`/boards/${aegis.canvas.board.id}`); return c.h > 250 && saved.cards.find(s => s.id === c.id)?.h > 120; }));
  await note.blur(); await settle();
  const todo = page.locator('.card[data-id="canvastodo"] .todo-item span'); await todo.focus(); await todo.fill(Array.from({ length: 14 }, (_, i) => `Task line ${i + 1}`).join('\n')); await settle();
  verify('checklist grows while editing an item', await page.evaluate(() => aegis.canvas.board.cards.find(c => c.id === 'canvastodo').h > 250)); await todo.blur(); await settle();
  verify('group outline is dashed on every side with no solid highlight', await page.locator('.card.template-group, .card.coll').evaluateAll(nodes => nodes.every(el => { const s = getComputedStyle(el); return ['Top', 'Right', 'Bottom', 'Left'].every(side => s[`border${side}Style`] === 'dashed') && s.boxShadow === 'none'; })));
  verify('no native selects outside documents and Ask composer', await page.locator('select').evaluateAll(nodes => nodes.every(el => el.closest('.side-editor, .docs-panel, .docview, .docs-bubble, .composer, #mobileHub') || ['model', 'count'].includes(el.id) && el.closest('[hidden], [inert]') !== null || ['model', 'count'].includes(el.id) && getComputedStyle(el).display === 'none')));
  if (!reproduce) {
    // A fixed height is persisted by the actual resize gesture.
    await apply([{ op: 'create', newId: 'fixednote', type: 'note', text: 'A fixed note', x: 0, y: 450, w: 240, h: 120 }]);
    await page.evaluate(() => { aegis.canvas.select(['fixednote']); aegis.canvas.setView({ x: 430, y: -150, z: 1 }); }); await settle();
    const grip = await page.locator('.selection-resize').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down(); await page.mouse.move(grip.x + 20, grip.y + 20, { steps: 6 }); await page.mouse.up(); await settle();
    const fixed = page.locator('.card[data-id="fixednote"] .body'); await fixed.focus();
    const height = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.id === 'fixednote').h);
    await fixed.fill(Array.from({ length: 20 }, (_, i) => `Fixed line ${i}`).join('\n')); await settle();
    verify('manual height stays fixed and scrolls with a bottom fade', await fixed.evaluate((el, height) => { const card = el.closest('.card'), s = getComputedStyle(el); return Math.abs(parseFloat(card.style.height) - height) < 1 && el.scrollHeight > el.clientHeight && s.overflowY === 'auto' && s.maskImage.includes('gradient'); }, height));
    await fixed.evaluate(el => el.scrollTop = 0); const viewBefore = await page.evaluate(() => ({ ...aegis.canvas.view })); await fixed.hover(); await page.mouse.wheel(0, 80); await settle();
    verify('scrolling a fixed note leaves the canvas still', await fixed.evaluate(el => el.scrollTop > 0) && JSON.stringify(viewBefore) === await page.evaluate(() => JSON.stringify(aegis.canvas.view)));
    await fixed.blur(); await apply([{ op: 'create', newId: 'fixedtodo', type: 'todo', text: 'Fixed checklist', x: 300, y: 450, w: 240, h: 120, props: { fixedHeight: true }, items: Array.from({ length: 12 }, (_, i) => ({ text: `Task ${i}`, done: false })) }]);
    verify('fixed checklists scroll inside their border', await page.locator('.card[data-id="fixedtodo"] .items').evaluate(el => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto' && getComputedStyle(el).maskImage.includes('gradient')));
    await page.mouse.move(1400, 20); await page.locator('#settingsBtn').click();
    const colour = page.getByRole('combobox', { name: 'Default note colour', exact: true });
    await colour.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('p');
    verify('dropdown type-ahead focuses a matching option', await page.evaluate(() => document.activeElement.dataset.label.toLowerCase().startsWith('p')));
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    verify('keyboard selection saves and restores trigger focus', await colour.evaluate(el => el.value === 'purple' && document.activeElement === el) && await page.evaluate(() => localStorage.getItem('aegis:note-colour') === 'purple'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await colour.click();
    verify('pointer dropdown opens over 140 ms', await page.locator('.aegis-value-menu:not([hidden])').evaluate(el => el.getAnimations().some(a => a.effect.getTiming().duration === 140)));
    verify('dropdown checks the current option', await page.locator('.aegis-value-menu:not([hidden]) [aria-selected=true]').evaluate(el => el.dataset.value === 'purple' && getComputedStyle(el.querySelector('svg')).visibility === 'visible'));
    await page.waitForTimeout(160);
    await page.screenshot({ path: out(`canvas-settings-dropdown-${Date.now()}.png`) });
    await page.keyboard.press('Escape'); await page.emulateMedia({ reducedMotion: 'reduce' });
    await colour.focus(); await page.keyboard.press('ArrowDown');
    verify('keyboard dropdown opens instantly', await page.locator('.aegis-value-menu:not([hidden])').evaluate(el => el.getAnimations().length === 0));
    await page.keyboard.press('Escape'); await page.locator('#closeSettings').click();
    await page.evaluate(() => { aegis.canvas.setView({ x: 430, y: 240, z: 1 }); aegis.canvas.select(['canvasnote']); }); await settle();
  }
  await page.getByLabel('More selection controls', { exact: true }).click();
    await page.getByLabel('Format selection', { exact: true }).click();
  const fonts = page.getByRole('button', { name: 'Fonts…', exact: true }); await fonts.click();
  const searchFonts = page.getByRole('textbox', { name: 'Search fonts', exact: true }); await searchFonts.fill('serif'); await searchFonts.press('ArrowDown');
  verify('font picker arrows reach a matching choice', await page.evaluate(() => document.activeElement.tagName === 'BUTTON' && document.activeElement.textContent.includes('serif')));
  await page.keyboard.press('Escape');
  verify('font picker Escape closes and restores its trigger', !await searchFonts.isVisible() && await fonts.evaluate(el => document.activeElement === el));
  await fonts.click(); await searchFonts.fill('System'); await searchFonts.press('ArrowDown'); await page.keyboard.press('Space'); await settle();
  verify('font menu Space commits the focused choice', await page.evaluate(() => aegis.canvas.board.cards.find(c => c.id === 'canvasnote').props.font === 'system-ui') && !await searchFonts.isVisible());

  await page.keyboard.press('Escape');
  await assertCameraScale(page, ['canvasnote', 'canvastodo']);
  const zoom = page.getByRole('button', { name: 'Zoom menu', exact: true });
  const zoomMenu = page.getByRole('menu', { name: 'Zoom', exact: true });
  await zoom.focus(); await zoom.press('ArrowDown');
  verify('zoom menu arrows move between actions', await page.getByRole('menuitem', { name: 'Zoom in', exact: true }).evaluate(el => document.activeElement === el));
  await page.keyboard.press('ArrowDown');
  verify('zoom arrow moves to Zoom out', await page.getByRole('menuitem', { name: 'Zoom out', exact: true }).evaluate(el => document.activeElement === el));
  await page.keyboard.press('Escape');
  verify('zoom Escape closes and restores trigger focus', !await zoomMenu.isVisible() && await zoom.evaluate(el => document.activeElement === el));
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await zoom.click();
  verify('action menus open with a 160 ms transform and opacity animation', await zoomMenu.evaluate(el => el.getAnimations().some(animation => animation.effect.getTiming().duration === 160 && animation.effect.getKeyframes().every(frame => 'transform' in frame && 'opacity' in frame))));
  await page.waitForTimeout(180); await page.screenshot({ path: out(`r2-zoom-menu-${Date.now()}.png`) });
  await page.locator('#boardName').click();
  verify('outside click closes the zoom menu with a 160 ms exit', await page.locator('.editing-zoom-menu').evaluate(el => el.getAttribute('aria-hidden') === 'true' && el.inert && el.getAnimations().some(a => a.effect.getTiming().duration === 160)));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await settle();
  // The outside click also opens Library and layers.
  await apply([{ op: 'update', id: 'canvasnote', set: { props: { layerName: 'A long research note with enough words to truncate in the sidebar' } } }]);
  const layer = page.locator('.layer-row[data-id="canvasnote"]'), rowMore = layer.locator('.row-more');
  const action = async name => { await rowMore.focus(); await rowMore.press('Enter'); await page.getByRole('menuitem', { name, exact: true }).click(); await settle(); };
  verify('layers expose a single 32px More button', await rowMore.count() === 1 && (await rowMore.boundingBox()).width === 32 && (await rowMore.boundingBox()).height === 32);
  verify('long layer names have at least 60% of the row, ellipsis and a full title', await layer.evaluate(el => { const name = el.querySelector('.name'); return name.getBoundingClientRect().width / el.getBoundingClientRect().width >= .6 && getComputedStyle(name).textOverflow === 'ellipsis' && name.scrollWidth > name.clientWidth && name.title === name.textContent; }));
  if (!reproduce) {
    await action('Hide'); verify('row menu Hide saves and removes the canvas card', await page.evaluate(() => aegis.canvas.board.cards.find(c => c.id === 'canvasnote').props.hidden && !document.querySelector('#world [data-id="canvasnote"]')));
    await action('Lock');
    verify('hidden and locked indicators stay muted after the name without squeezing it', await layer.evaluate(el => { const state = el.querySelector('.row-state'), name = el.querySelector('.name'); return state.querySelectorAll('svg').length === 2 && state.previousElementSibling === name && getComputedStyle(state).color !== getComputedStyle(el).color && name.getBoundingClientRect().width / el.getBoundingClientRect().width >= .6; }));
    await rowMore.click(); await page.screenshot({ path: out(`r2-layer-state-menu-1440-${Date.now()}.png`) }); await page.keyboard.press('Escape');
    await action('Show'); await action('Unlock');
    verify('row menu Show and Unlock save the opposite state', await page.evaluate(() => { const c = aegis.canvas.board.cards.find(c => c.id === 'canvasnote'); return !c.props.hidden && !c.props.locked; }));
    await action('Rename'); const name = layer.getByRole('textbox', { name: 'Window name', exact: true }); await name.fill('Renamed research note'); await name.press('Enter'); await settle();
    verify('row menu Rename saves its name', await page.evaluate(() => aegis.canvas.board.cards.find(c => c.id === 'canvasnote').props.layerName === 'Renamed research note'));
    await page.screenshot({ path: out(`r2-layer-menu-rows-${Date.now()}.png`) });
    await action('Delete'); await answer(false); verify('cancelling layer deletion preserves it', await page.evaluate(() => aegis.canvas.board.cards.some(c => c.id === 'canvasnote')));
    await action('Delete'); await answer(true); verify('confirmed layer deletion removes the card', await page.evaluate(() => !aegis.canvas.board.cards.some(c => c.id === 'canvasnote')));
    await apply([{ op: 'create', type: 'note', newId: 'lateredit', text: 'Keep this later edit', x: -500, y: 0 }]);
    await page.locator('.layer-undo button').click(); await settle(); verify('layer Undo restores the card and preserves later edits', await page.evaluate(() => ['canvasnote', 'lateredit'].every(id => aegis.canvas.board.cards.some(c => c.id === id)) && aegis.canvas.board.links.some(l => l.id === 'canvaslink' && l.a === 'canvasnote' && l.b === 'canvastodo')));
  }
  const parent = await page.evaluate(() => aegis.canvas.board.id);
  await page.evaluate(() => { document.activeElement?.blur(); aegis.canvas.select([]); }); await settle();
  const tool = page.locator('[data-tool="canvas"]'); if (!await tool.isVisible()) { await page.mouse.move(24, 480); await page.locator('#toolsFold').click(); } await tool.click(); await page.locator('#stage').click({ position: { x: 1300, y: 780 } });
  await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'canvas'));
  await page.locator('.canvas-card').hover();
  verify('canvas door has an accessible open button', await page.locator('.window-actions').getByRole('button', { name: 'Open canvas', exact: true }).count() === 1);
  if (reproduce) { await page.screenshot({ path: out(`canvas-reproduction-${Date.now()}.png`) }); }
  else {
    const child = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'canvas').props.board);
    await page.locator('.window-actions').getByRole('button', { name: 'Open canvas', exact: true }).click(); await page.waitForFunction(id => aegis.canvas.board.id === id, child); verify('canvas door opens its own board', true);
    await page.locator('#boardCrumbs button').last().click(); await page.waitForFunction(id => aegis.canvas.board.id === id, parent);
  }
  const project = await api('/library', { op: 'create', kind: 'project', name: 'Delete test project' }); await settle();
  await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.locator('.library-home[open]').waitFor(); await page.keyboard.press('Escape');
  const row = page.locator(`.tree-row[data-node="${project.created}"]`); await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click(); await answer(true); await settle();
  await page.locator('[data-library-undo]').waitFor({ state: 'visible' });
  verify('side bar deletion offers Undo', await page.locator('[data-library-undo]').isVisible().catch(() => false));
  if (!reproduce) { await page.locator('[data-library-undo]').click(); await row.waitFor(); verify('Undo restores the deleted project', (await api('/library')).nodes.some(n => n.id === project.created)); }
  if (!reproduce) {
    for (const kind of ['folder', 'board']) {
      const name = `Undo ${kind}`;
      const created = kind === 'board' ? await api('/boards', { name }) : await api('/library', { op: 'create', kind, name });
      const id = created.id || created.created, row = page.locator(`.tree-row[data-${kind === 'board' ? 'board' : 'node'}="${id}"]`); await row.waitFor();
      if (kind === 'board') { await row.click(); await page.waitForFunction(id => aegis.canvas.board.id === id, id); }
      await row.locator('.row-more').click(); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click(); await answer(true); await row.waitFor({ state: 'detached' });
      if (kind === 'board') { await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board); await page.locator('[data-library-undo]').waitFor(); }
      await page.locator('[data-library-undo]').click(); await row.waitFor();
      verify(`${kind} delete Undo restores it${kind === 'board' ? ' across reload' : ''}`, true);
    }
    const folder = await api('/library', { op: 'create', kind: 'folder', name: 'Nested delete', parent: project.created });
    const nested = await api('/boards', { name: 'Nested board', parent: folder.created }); await settle();
    const projectRow = page.locator(`.tree-row[data-node="${project.created}"]`);
    await projectRow.locator('.row-more').click(); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click(); await answer(true);
    for (let attempt = 0; attempt < 150 && (await api('/library')).boards.some(b => b.id === nested.id); attempt++) await page.waitForTimeout(100);
    verify('confirmed project deletion removes its folder and boards after Undo expires', !(await api('/library')).nodes.some(n => [project.created, folder.created].includes(n.id)));
    await page.locator(`.tree-row[data-board="${parent}"]`).click(); await page.waitForFunction(id => aegis.canvas.board.id === id, parent);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1586, height: 992 }, { width: 390, height: 844 }]) {
      if (viewport.width === 390) await page.locator('#closeSide').click();
      await page.setViewportSize(viewport);
      await page.evaluate(width => { aegis.canvas.select(['canvasnote']); aegis.canvas.setView(width === 390 ? { x: 60, y: 180, z: .85 } : { x: 430, y: 240, z: 1 }); }, viewport.width); await settle();
      await page.screenshot({ path: out(`canvas-polish-${viewport.width}-${Date.now()}.png`) });
      if (viewport.width === 390) await page.locator('#mobileHub [data-sheet="layers"]').click();
      const sidebarRow = page.locator('.layer-row[data-id="canvasnote"]');
      verify(`${viewport.width}px sidebar names keep at least 60% of the row`, await sidebarRow.evaluate(el => el.querySelector('.name').getBoundingClientRect().width / el.getBoundingClientRect().width >= .6));
      await sidebarRow.locator('.row-more').click();
      await page.screenshot({ path: out(`r2-sidebar-menu-${viewport.width}-${Date.now()}.png`) });
      await page.keyboard.press('Escape');
      if (viewport.width === 390) await page.getByLabel('Close sheet', { exact: true }).click();

    }
  }
  if (!reproduce) {
    await page.setViewportSize({ width: 1586, height: 992 });
    await apply([
      ...Array.from({ length: 40 }, (_, i) => ({ op: 'create', newId: `orientation${i}`, type: 'note', heading: `Research window ${i + 1}`, text: 'Overview fixture', x: 10000 + i % 8 * 1400, y: 10000 + Math.floor(i / 8) * 1200, w: 500 + i * 5, h: 300 + i * 3 })),
      { op: 'create', newId: 'orientationhidden', type: 'note', text: 'Hidden window', x: 10000, y: 10000, w: 5000, h: 5000, props: { hidden: true } },
      { op: 'create', newId: 'orientationoutside', type: 'note', text: 'Outside viewport', x: 50000, y: 50000, w: 5000, h: 5000 },
    ]);
    await page.locator('#boardName').focus(); await page.mouse.move(1000, 700);
    await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.setView({ x: -400, y: -400, z: .05 }); }); await settle();
    const orientation = page.locator('.canvas-orientation');
    verify('far zoom names are absent from an idle board', !await orientation.isVisible());
    await page.mouse.move(4, 450); await orientation.waitFor({ state: 'visible' });
    verify('pointer edge approach reveals only the largest 30 visible window names', await orientation.locator('span').evaluateAll(nodes => nodes.length > 0 && nodes.length <= 30 && nodes.every(el => /^orientation\d+$/.test(el.dataset.cardId) && Number(el.dataset.cardId.slice(11)) >= 10)));
    verify('orientation labels keep at least 11 px screen type with small pointer targets, and the overlay passes input through', await orientation.locator('span').evaluateAll(nodes => nodes.every(el => parseFloat(getComputedStyle(el).fontSize) >= 11 && getComputedStyle(el).pointerEvents === 'auto')) && await orientation.evaluate(el => getComputedStyle(el).pointerEvents === 'none'));
    await page.screenshot({ path: out(`r4-orientation-edge-${Date.now()}.png`) });
    const label = orientation.locator('span').first(), labelId = await label.getAttribute('data-card-id');
    await label.hover();
    const aid = orientation.locator('.orientation-aid'); await aid.waitFor({ state: 'visible' });
    verify('real label hover outlines its matching window with a blue hairline and leader', await aid.evaluate((el, id) => {
      const c = aegis.canvas.board.cards.find(c => c.id === id), v = aegis.canvas.view, r = el.querySelector('rect'), l = el.querySelector('line');
      return el.dataset.cardId === id && Math.abs(Number(r.getAttribute('x')) - (c.x * v.z + v.x)) < .1 && Math.abs(Number(r.getAttribute('y')) - (c.y * v.z + v.y)) < .1 && Math.abs(Number(r.getAttribute('width')) - c.w * v.z) < .1 && Math.abs(Number(r.getAttribute('height')) - c.h * v.z) < .1 && getComputedStyle(r).stroke === 'rgb(63, 141, 253)' && getComputedStyle(r).strokeWidth === '1px' && getComputedStyle(el).pointerEvents === 'none' && Math.hypot(Number(l.getAttribute('x2')) - Number(l.getAttribute('x1')), Number(l.getAttribute('y2')) - Number(l.getAttribute('y1'))) > 0;
    }, labelId));
    await page.screenshot({ path: out(`r5-orientation-hover-${Date.now()}.png`) });
    // PM5.3: keep the pointer parked over the clicked label while navigating.
    await label.click(); await page.keyboard.press('Tab');
    verify('Tab after a hovered label click moves the aid to the focused window without pointer movement', await orientation.evaluate(el => el.contains(document.activeElement) && document.activeElement.dataset.cardId === el.querySelector('.orientation-aid').dataset.cardId) && await page.evaluate(id => document.activeElement.dataset.cardId !== id, labelId));
    await page.screenshot({ path: out(`r6-orientation-tab-${Date.now()}.png`) });
    await page.keyboard.press('Shift+Tab');
    verify('Shift+Tab with the pointer parked keeps focusId equal to aidId', await orientation.evaluate(el => document.activeElement.dataset.cardId === el.querySelector('.orientation-aid').dataset.cardId) && await page.evaluate(id => document.activeElement.dataset.cardId === id, labelId));
    const labelBox = await label.boundingBox();
    await page.mouse.move(labelBox.x + labelBox.width / 2 - 2, labelBox.y + labelBox.height / 2);
    verify('pointer hover again after Shift+Tab keeps focusId equal to aidId', await orientation.evaluate(el => document.activeElement.dataset.cardId === el.querySelector('.orientation-aid').dataset.cardId));
    await page.keyboard.press('Tab');
    await page.mouse.move(labelBox.x + labelBox.width / 2 + 2, labelBox.y + labelBox.height / 2);
    verify('pointer movement over the parked label takes the aid back from keyboard focus', await aid.getAttribute('data-card-id') === labelId);
    verify('the more chip counts all unlabelled visible windows beyond the 30-name cap', await orientation.locator('.orientation-more').textContent() === `+${40 - await orientation.locator('span').count()} more`);
    await page.locator('#boardName').focus();
    await page.mouse.move(1000, 700); await orientation.waitFor({ state: 'hidden' });
    verify('orientation clears when the pointer leaves the edge', !await orientation.isVisible());
    await page.keyboard.press('Tab'); await page.locator('#stage').focus(); await orientation.waitFor({ state: 'visible' });
    verify('keyboard canvas focus reveals far zoom names', await orientation.locator('span').count() > 0 && await orientation.locator('span').count() <= 30);
    await orientation.locator('span').first().focus(); await page.keyboard.press('Tab');
    await aid.waitFor({ state: 'visible' });
    verify('Tab focuses a far zoom name and highlights the same window', await orientation.evaluate(el => el.contains(document.activeElement) && document.activeElement.dataset.cardId === el.querySelector('.orientation-aid').dataset.cardId));
    await page.screenshot({ path: out(`r5-orientation-focus-${Date.now()}.png`) });
    await page.locator('#boardName').focus(); await orientation.waitFor({ state: 'hidden' });
    await page.evaluate(() => aegis.canvas.setView({ x: -1400, y: -1400, z: .2 })); await settle(); await page.mouse.move(4, 450);
    verify('orientation stays hidden at working zoom', !await orientation.isVisible());
    // Exercise the crowded, canvas-drawn culling route as well as mounted windows.
    await apply(Array.from({ length: 401 }, (_, i) => ({ op: 'create', newId: `orientationcrowd${i}`, type: 'note', text: `Small window ${i}`, x: 10000 + i % 30 * 80, y: 10000 + Math.floor(i / 30) * 60, w: 40, h: 30 })));
    await page.evaluate(() => aegis.canvas.setView({ x: -400, y: -400, z: .05 })); await orientation.waitFor({ state: 'visible' });
    verify('crowded far view uses the same bounded labels without mounting all cards', await page.locator('#stage').evaluate(el => el.classList.contains('far')) && await orientation.locator('span').count() > 0 && await orientation.locator('span').count() <= 30 && (await page.evaluate(() => aegis.canvas.stats().mounted)) < 400);
    await page.screenshot({ path: out(`r4-orientation-crowded-${Date.now()}.png`) });
    await page.mouse.move(1000, 700); await orientation.waitFor({ state: 'hidden' });
    // PM5.6: fewer than 30 overlapping windows must also offer omitted names.
    await apply(Array.from({ length: 9 }, (_, i) => ({ op: 'create', newId: `supporting${i}`, type: 'note', heading: `Supporting window ${i + 1}`, text: 'Collision fixture', x: 100000 + i * 40, y: 100000 + i * 40, w: 600, h: 400 })));
    const more = orientation.locator('.orientation-more'), namesMenu = page.getByRole('menu', { name: 'More window names', exact: true });
    for (const width of [1440, 1586, 390]) {
      await page.setViewportSize({ width, height: 992 }); await page.locator('#boardName').focus(); await page.mouse.move(width - 100, 600);
      await page.evaluate(() => aegis.canvas.setView({ x: -4900, y: -4900, z: .05 })); await settle();
      verify(`${width}px omitted names and chip stay absent on the idle board`, !await orientation.isVisible() && !await more.isVisible() && !await namesMenu.isVisible());
      await page.mouse.move(width - 4, 450); await orientation.waitFor({ state: 'visible' });
      const labelled = await orientation.locator('span').evaluateAll(nodes => nodes.map(el => el.textContent));
      verify(`${width}px collisions offer every omitted name`, labelled.length > 0 && labelled.length < 9 && await more.textContent() === `+${9 - labelled.length} more`);
      const chipBox = await more.boundingBox();
      verify(`${width}px more chip is a reachable 44px target within the viewport`, chipBox.width >= 44 && chipBox.height >= 44 && chipBox.x >= 0 && chipBox.x + chipBox.width <= width && chipBox.y + chipBox.height <= 992);
      verify(`${width}px more chip sits beside the visible label cluster`, await more.evaluate(el => {
        const chip = el.getBoundingClientRect(), labels = [...el.parentElement.querySelectorAll('span')].map(label => label.getBoundingClientRect());
        const left = Math.min(...labels.map(r => r.left)), right = Math.max(...labels.map(r => r.right)), top = Math.min(...labels.map(r => r.top)), bottom = Math.max(...labels.map(r => r.bottom));
        return Math.max(0, left - chip.right, chip.left - right) <= 13 && Math.max(0, top - chip.bottom, chip.top - bottom) <= 13 && labels.every(r => chip.left >= r.right || chip.right <= r.left || chip.top >= r.bottom || chip.bottom <= r.top);
      }));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      if (width === 1586) {
        await orientation.locator('span').last().focus(); await page.keyboard.press('Tab');
        verify('Tab reaches the more chip after the displayed labels', await more.evaluate(el => el === document.activeElement));
        await page.keyboard.press('Enter');
      } else await more.click();
      await namesMenu.waitFor({ state: 'visible' });
      const omitted = Array.from({ length: 9 }, (_, i) => `Supporting window ${i + 1}`).filter(name => !labelled.includes(name));
      const choices = namesMenu.getByRole('menuitem');
      verify(`${width}px themed menu lists exactly the omitted windows`, JSON.stringify((await choices.allTextContents()).sort()) === JSON.stringify(omitted.sort()) && await namesMenu.evaluate(el => el.classList.contains('aegis-action-menu') && getComputedStyle(el).backgroundColor === 'rgb(36, 39, 43)'));
      const menuBox = await namesMenu.boundingBox();
      verify(`${width}px omitted-name menu stays within the screen`, menuBox.x >= 8 && menuBox.y >= 8 && menuBox.x + menuBox.width <= width - 7 && menuBox.y + menuBox.height <= 985);
      await page.waitForTimeout(180); await page.screenshot({ path: out(`r6-omitted-names-${width}-${Date.now()}.png`) });
      await page.keyboard.press('Escape');
      verify(`${width}px Escape closes the names menu and restores chip focus`, !await namesMenu.isVisible() && await more.evaluate(el => el === document.activeElement));
      if (width === 1586) {
        await page.keyboard.press('Enter'); await namesMenu.waitFor({ state: 'visible' });
        verify('keyboard opens the omitted-name menu instantly', await namesMenu.evaluate(el => el.getAnimations().length === 0));
        await page.keyboard.press('ArrowDown');
        const target = await page.evaluate(() => document.activeElement.textContent);
        verify('arrow keys move to another omitted name', target === await choices.nth(1).textContent());
        await page.keyboard.press('Enter');
        const after = await page.evaluate(() => ({ ...aegis.canvas.view })); await page.waitForTimeout(60);
        verify('keyboard name choice frames its window instantly', after.z > .2 && JSON.stringify(after) === await page.evaluate(() => JSON.stringify(aegis.canvas.view)) && await page.evaluate(name => { const c = aegis.canvas.board.cards.find(c => c.heading === name), v = aegis.canvas.view; return Math.abs((c.y + c.h / 2) * v.z + v.y - (aegis.canvas.availableArea.y + aegis.canvas.availableArea.h / 2)) < 1; }, target));
      } else {
        await more.click(); await namesMenu.waitFor({ state: 'visible' });
        const target = await choices.first().textContent();
        await choices.first().click();
        await page.waitForFunction(() => aegis.canvas.view.z > .05 && aegis.canvas.view.z < 1);
        verify(`${width}px pointer name choice starts a camera glide`, await page.evaluate(() => aegis.canvas.view.z > .05 && aegis.canvas.view.z < 1));
        await page.waitForTimeout(450);
        verify(`${width}px camera reaches the chosen window`, await page.evaluate(name => { const c = aegis.canvas.board.cards.find(c => c.heading === name), v = aegis.canvas.view; return v.z > .2 && c.x * v.z + v.x >= 0 && c.y * v.z + v.y >= 0 && (c.x + c.w) * v.z + v.x <= innerWidth && (c.y + c.h) * v.z + v.y <= innerHeight && Math.abs((c.y + c.h / 2) * v.z + v.y - (aegis.canvas.availableArea.y + aegis.canvas.availableArea.h / 2)) < 1; }, target));
      }
      verify(`${width}px framing dismisses far zoom controls`, !await orientation.isVisible() && !await namesMenu.isVisible());
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
  }
  writeFileSync(out(`canvas-${reproduce ? 'reproduction' : 'results'}-${Date.now()}.json`), JSON.stringify({ results, errors }, null, 2));
  verify('no browser errors', errors.length === 0);
} catch (e) { console.error(e); if (page) await page.screenshot({ path: out(`canvas-fail-${Date.now()}.png`) }); process.exitCode = 1; }
finally { await browser?.close(); host.kill(); web?.kill(); }
