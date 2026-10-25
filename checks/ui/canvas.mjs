import { choose } from './dropdown.mjs';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const offset = Number(process.env.AEGIS_PORT_OFFSET || 0), repo = new URL('../..', import.meta.url).pathname;
const token = `canvas-${process.pid}`, reproduce = process.argv.includes('--reproduce');
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-canvas-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
const ready = (proc, pattern) => new Promise((resolve, reject) => { let output = ''; const timer = setTimeout(() => reject(new Error(output || 'Startup timed out')), 20000); proc.stdout.on('data', d => { output += d; const m = pattern.exec(output); if (m) { clearTimeout(timer); resolve(m[1]); } }); proc.stderr.on('data', d => output += d); proc.on('exit', () => { clearTimeout(timer); reject(new Error(output)); }); });
let web, browser, page;
const errors = [], results = [];
const verify = (name, value) => { results.push({ name, value }); console.log(`${value ? 'PASS' : reproduce ? 'REPRODUCED' : 'FAIL'} ${name}`); if (!reproduce) assert.ok(value, name); };
try {
  const port = await ready(host, /"port":(\d+)/);
  web = spawn('npx', ['vite', '--port', String(5190 + offset), '--strictPort'], { cwd: repo + '/app' }); await ready(web, /Local:.*:(\d+)/);
  browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
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
  verify('toolbar centre within 1 px and 10 px clear of rotation handle', await page.evaluate(() => { const b = document.querySelector('#selectionBar').getBoundingClientRect(), c = document.querySelector('[data-id="canvasnote"].card').getBoundingClientRect(), r = document.querySelector('.rotation-handle').getBoundingClientRect(); return Math.abs(b.left + b.width / 2 - c.left - c.width / 2) <= 1 && Math.abs(r.top - b.bottom - 10) <= 1; }));
  await page.getByLabel('Colour', { exact: true }).click(); await settle();
  verify('colour swatches have equal width and height', await page.locator('.selection-colours button').evaluateAll(nodes => nodes.every(el => { const s = getComputedStyle(el, '::before'); return s.width === s.height && s.flexShrink === '0'; })));
  await page.screenshot({ path: out(`canvas-swatch-circles-${Date.now()}.png`) });
  await page.keyboard.press('Escape');
  if (!reproduce) {
    await page.getByLabel('More selection controls', { exact: true }).click();
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
    await page.locator('#settingsBtn').click();
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
  await page.locator('#boardName').click(); await settle();
  verify('layers expose a direct delete action', await page.locator('.layer-row[data-id="canvasnote"] [aria-label^="Delete"]').count() === 1);
  if (!reproduce) {
    const removeLayer = page.locator('.layer-row[data-id="canvasnote"] [aria-label^="Delete"]');
    page.once('dialog', d => d.dismiss()); await removeLayer.click(); verify('cancelling layer deletion preserves it', await page.evaluate(() => aegis.canvas.board.cards.some(c => c.id === 'canvasnote')));
    page.once('dialog', d => d.accept()); await removeLayer.click(); await settle(); verify('confirmed layer deletion removes the card', await page.evaluate(() => !aegis.canvas.board.cards.some(c => c.id === 'canvasnote')));
    await apply([{ op: 'create', type: 'note', newId: 'lateredit', text: 'Keep this later edit', x: -500, y: 0 }]);
    await page.locator('.layer-undo button').click(); await settle(); verify('layer Undo restores the card and preserves later edits', await page.evaluate(() => ['canvasnote', 'lateredit'].every(id => aegis.canvas.board.cards.some(c => c.id === id)) && aegis.canvas.board.links.some(l => l.id === 'canvaslink' && l.a === 'canvasnote' && l.b === 'canvastodo')));
  }
  const parent = await page.evaluate(() => aegis.canvas.board.id);
  await page.evaluate(() => { document.activeElement?.blur(); aegis.canvas.select([]); }); await settle();
  const tool = page.locator('[data-tool="canvas"]'); if (!await tool.isVisible()) await page.locator('#toolsFold').click(); await tool.click(); await page.locator('#stage').click({ position: { x: 1300, y: 780 } });
  await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'canvas'));
  verify('canvas door has an accessible open button', await page.locator('.canvas-card button[aria-label^="Open"]').count() === 1);
  if (reproduce) { await page.screenshot({ path: out(`canvas-reproduction-${Date.now()}.png`) }); }
  else {
    const child = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'canvas').props.board);
    await page.locator('.canvas-card button[aria-label^="Open"]').click(); await page.waitForFunction(id => aegis.canvas.board.id === id, child); verify('canvas door opens its own board', true);
    await page.locator('#boardCrumbs button').last().click(); await page.waitForFunction(id => aegis.canvas.board.id === id, parent);
  }
  const project = await api('/library', { op: 'create', kind: 'project', name: 'Delete test project' }); await settle();
  await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.locator('.library-home[open]').waitFor(); await page.keyboard.press('Escape');
  const row = page.locator(`.tree-row[data-node="${project.created}"]`); await row.click({ button: 'right' });
  page.once('dialog', d => d.accept()); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click(); await settle();
  verify('side bar deletion offers Undo', await page.locator('[data-library-undo]').isVisible().catch(() => false));
  if (!reproduce) { await page.locator('[data-library-undo]').click(); await row.waitFor(); verify('Undo restores the deleted project', (await api('/library')).nodes.some(n => n.id === project.created)); }
  if (!reproduce) {
    for (const kind of ['folder', 'board']) {
      const name = `Undo ${kind}`;
      const created = kind === 'board' ? await api('/boards', { name }) : await api('/library', { op: 'create', kind, name });
      const id = created.id || created.created, row = page.locator(`.tree-row[data-${kind === 'board' ? 'board' : 'node'}="${id}"]`); await row.waitFor();
      if (kind === 'board') { await row.click(); await page.waitForFunction(id => aegis.canvas.board.id === id, id); }
      page.once('dialog', d => d.accept()); await row.getByRole('button', { name: `Delete ${name}`, exact: true }).click(); await row.waitFor({ state: 'detached' });
      if (kind === 'board') { await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board); await page.locator('[data-library-undo]').waitFor(); }
      await page.locator('[data-library-undo]').click(); await row.waitFor();
      verify(`${kind} delete Undo restores it${kind === 'board' ? ' across reload' : ''}`, true);
    }
    const folder = await api('/library', { op: 'create', kind: 'folder', name: 'Nested delete', parent: project.created });
    const nested = await api('/boards', { name: 'Nested board', parent: folder.created }); await settle();
    const projectRow = page.locator(`.tree-row[data-node="${project.created}"]`);
    page.once('dialog', d => d.accept()); await projectRow.getByRole('button', { name: 'Delete Delete test project', exact: true }).click();
    for (let attempt = 0; attempt < 150 && (await api('/library')).boards.some(b => b.id === nested.id); attempt++) await page.waitForTimeout(100);
    verify('confirmed project deletion removes its folder and boards after Undo expires', !(await api('/library')).nodes.some(n => [project.created, folder.created].includes(n.id)));
    await page.locator(`.tree-row[data-board="${parent}"]`).click(); await page.waitForFunction(id => aegis.canvas.board.id === id, parent);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1586, height: 992 }, { width: 390, height: 844 }]) {
      if (viewport.width === 390) await page.locator('#closeSide').click();
      await page.setViewportSize(viewport);
      await page.evaluate(width => { aegis.canvas.select(['canvasnote']); aegis.canvas.setView(width === 390 ? { x: 60, y: 180, z: .85 } : { x: 430, y: 240, z: 1 }); }, viewport.width); await settle();
      await page.screenshot({ path: out(`canvas-polish-${viewport.width}-${Date.now()}.png`) });
    }
  }
  writeFileSync(out(`canvas-${reproduce ? 'reproduction' : 'results'}-${Date.now()}.json`), JSON.stringify({ results, errors }, null, 2));
  verify('no browser errors', errors.length === 0);
} catch (e) { console.error(e); if (page) await page.screenshot({ path: out(`canvas-fail-${Date.now()}.png`) }); process.exitCode = 1; }
finally { await browser?.close(); host.kill(); web?.kill(); }
