import {createUiSnapshot,disposeUiSnapshot} from '../support/ui-snapshot.ts';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const PORT_OFFSET = Number(process.env.AEGIS_PORT_OFFSET || 0); // separate worktrees can run checks at once
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = `editors-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-editors-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise((resolve, reject) => { host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); }); host.once('exit', reject); });
const ui = createUiSnapshot(repo, 'aegis-editors-ui-');
// The snapshot retains the complete workspace dependency layout.
const vite = spawn('npx', ['vite', '--port', String(5191 + PORT_OFFSET), '--strictPort'], { cwd: ui, stdio: 'pipe' });
vite.stderr.on('data', d => appendFileSync(out('editors-vite.txt'), d));
const ready = new Promise((resolve, reject) => { vite.stdout.on('data', d => { if (/Local/.test(String(d))) resolve(); }); vite.once('exit', code => reject(new Error('Vite exited ' + code))); });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
const errors = []; page.on('pageerror', e => errors.push(e.stack));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const board = () => page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`));
const saved = () => page.waitForFunction(() => document.querySelector('.side-editor.is-open [data-saved]')?.textContent === 'Saved');
const openEvent = id => page.evaluate(id => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, keyboard: false }, bubbles: true })), id);
const stageBounds = () => page.locator('#stage').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
const batch = [
  { op: 'create', type: 'object', kind: 'sheet', text: 'Sleep log', newId: 'sheet001', x: 280, y: 140, data: {
    columns: Array.from({ length: 10 }, (_, c) => ({ label: c ? `Measure ${c}` : 'Night', kind: c ? 'number' : 'text' })),
    rows: Array.from({ length: 60 }, (_, r) => ({ cells: Array.from({ length: 10 }, (_, c) => c ? String(r + c) : `Night ${r + 1}`) })),
    note: 'Fictional test data',
  } },
  { op: 'create', type: 'doc', text: 'Sleep report', newId: 'doc00001', x: 280, y: 540, props: { body: '## Key findings\n\nA short report for the editor check.' } },
  { op: 'create', type: 'note', text: 'Leave this card alone', newId: 'note0001', x: 1000, y: 300 },
];
try {
  await ready;
  await page.goto(`http://localhost:${5191 + PORT_OFFSET}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board, null, { timeout: 15000 });
  const run = await page.evaluate(brief => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief, model: { provider: 'fake', modelId: 'fake' }, count: 1 }), 'FAKE ' + JSON.stringify(batch));
  assert.ok(run[0]?.id, JSON.stringify(run));
  await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.id === 'sheet001'), null, { timeout: 20000 });
  await page.evaluate(() => { aegis.canvas.setView({ x: 0, y: 0, z: 1 }); aegis.canvas.select(['sheet001']); document.activeElement?.blur(); });
  const stage = await stageBounds(), camera = await page.evaluate(() => ({ ...aegis.canvas.view }));
  await page.keyboard.press('Enter');
  await page.locator('.sheet-editor').waitFor();
  await page.waitForTimeout(450);
  assert.notDeepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), camera, 'Keyboard opens frame the editor context');
  assert.equal(await page.locator('.side-editor').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  const grid = page.locator('.sheet-scroll');
  const gridFocus = await grid.evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, ring: getComputedStyle(el).boxShadow }));
  assert.equal(gridFocus.outline, 'none'); assert.match(gridFocus.ring, /rgba\(255, 255, 255, 0\.16\)/);

  await page.keyboard.type('First night'); await page.keyboard.press('Enter'); await saved();
  assert.equal((await board()).cards.find(c => c.id === 'sheet001').data.rows[0].cells[0], 'First night');
  assert.equal(await page.getByLabel('Cell reference', { exact: true }).textContent(), 'A3');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await page.getByLabel('Cell value', { exact: true }).fill('42.5'); await page.keyboard.press('Tab'); await saved();
  assert.equal(await page.getByLabel('Cell reference', { exact: true }).textContent(), 'C3');
  assert.equal((await board()).cards.find(c => c.id === 'sheet001').data.rows[1].cells[1], '42.5');
  assert.equal(await grid.locator('[data-r="2"][data-c="1"]').evaluate(el => getComputedStyle(el).textAlign), 'right');
  await page.keyboard.type('Discard this'); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sheet-editor').count(), 1, 'Escape cancels cell editing before closing the shell');
  assert.equal((await board()).cards.find(c => c.id === 'sheet001').data.rows[1].cells[2], '3');
  await page.getByLabel('Selected cell value', { exact: true }).fill('64'); await page.getByLabel('Selected cell value', { exact: true }).press('Enter'); await saved();
  assert.equal((await board()).cards.find(c => c.id === 'sheet001').data.rows[1].cells[2], '64');
  console.log('PASS sheet Enter opener, typing, arrows, Return, Tab, value bar, Escape cancellation and host-confirmed cell saves');

  await page.getByRole('button', { name: 'Add row', exact: true }).click(); await saved();
  assert.equal((await board()).cards.find(c => c.id === 'sheet001').data.rows.length, 61);
  await grid.locator('[data-r="0"][data-c="0"]').dblclick();
  await page.getByLabel('Cell value', { exact: true }).fill('Evening'); await page.keyboard.press('Enter'); await saved();
  const sheet = (await board()).cards.find(c => c.id === 'sheet001');
  assert.equal(sheet.data.columns[0].label, 'Evening'); assert.equal(sheet.data.note, 'Fictional test data');
  console.log('PASS sheet structural changes use revise and preserve other fields');

  const stickyBefore = await grid.evaluate(el => ({ x: el.querySelector('tbody th').getBoundingClientRect().x, y: el.querySelector('thead th:nth-child(2)').getBoundingClientRect().y }));
  await grid.hover(); await page.mouse.wheel(550, 850);
  await page.waitForFunction(() => { const el = document.querySelector('.sheet-scroll'); return el.scrollLeft > 100 && el.scrollTop > 100; });
  const scroll = await grid.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop, stickyX: el.querySelector('tbody th').getBoundingClientRect().x, stickyY: el.querySelector('thead th:nth-child(2)').getBoundingClientRect().y, axes: [getComputedStyle(el).overflowX, getComputedStyle(el).overflowY] }));
  assert.ok(scroll.x > 100 && scroll.y > 100); assert.deepEqual(scroll.axes, ['auto', 'auto']);
  assert.equal(scroll.stickyX, stickyBefore.x); assert.equal(scroll.stickyY, stickyBefore.y);
  assert.deepEqual(await stageBounds(), stage);
  await page.screenshot({ path: out('editors-sheet.png') });
  console.log('PASS one sheet scroller handles both axes with sticky letters and row numbers');

  await openEvent('doc00001'); await page.locator('.docs-panel').waitFor();
  await page.locator('.docs-panel').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  assert.equal(await page.locator('.side-editor').count(), 1, 'Opening a document replaces the sheet');
  assert.equal(await page.locator('body.editor-open.docs-open').count(), 1);
  const titleFocus = await page.getByLabel('Document title', { exact: true }).evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, caret: getComputedStyle(el).caretColor }));
  assert.equal(titleFocus.outline, 'none'); assert.equal(titleFocus.caret, 'rgb(63, 141, 253)');
  const half = await page.locator('.docs-panel').boundingBox(); assert.equal(half.width, 788); assert.equal(half.y, 8);
  assert.deepEqual(await stageBounds(), stage, 'Opening documents does not reflow the stage');
  const type = await page.locator('.docs-prose').evaluate(el => { const css = getComputedStyle(el); return [css.fontSize, css.lineHeight, css.caretColor, css.fontFamily]; });
  assert.deepEqual(type.slice(0, 3), ['18px', '28px', 'rgb(63, 141, 253)']); assert.match(type[3], /Inter Variable/);
  await page.waitForTimeout(450);
  const source = await page.locator('.editor-context-source').boundingBox();
  assert.ok(source.x >= 24 && source.x + source.width <= half.x - 24, 'Pointer open frames a compact source with clearance beside the actual editor');
  await page.screenshot({ path: out('editors-document-half.png') });
  await page.getByRole('button', { name: 'Full width', exact: true }).click();
  assert.equal((await page.locator('.docs-panel').boundingBox()).width, 1584);
  assert.equal(await page.locator('body.editor-wide.docs-full').count(), 1);
  assert.deepEqual(await stageBounds(), stage);
  await page.screenshot({ path: out('editors-document-wide.png') });
  assert.equal(await page.locator('.docs-panel .docs-ribbon[role=toolbar]').count(), 1, 'Writing has one themed formatting ribbon');
  assert.equal(await page.locator('.side-editor-head .docs-title').count(), 1, 'The title is editable in the window strip');
  await page.getByLabel('Format document', { exact: true }).click();
  const toolbarFocus = await page.evaluate(async () => {
    const { currentDocument } = await import('/src/features/docs/editor.js');
    const editor = currentDocument().editor, text = editor.getText();
    editor.commands.selectAll();
    const font = document.querySelector('[aria-label="Font family"]');
    const size = document.querySelector('[aria-label="Font size"]');
    font.focus(); font.value = 'Georgia'; font.dispatchEvent(new Event('change', { bubbles: true }));
    size.focus();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { focus: document.activeElement.getAttribute('aria-label'), text, after: editor.getText() };
  });
  assert.equal(toolbarFocus.focus, 'Font size', 'Changing a toolbar field must not steal focus from the next field');
  await page.getByLabel('Font size', { exact: true }).fill('20'); await page.getByLabel('Font size', { exact: true }).press('Tab');
  await saved();
  assert.equal(await page.locator('.docs-prose').innerText(), toolbarFocus.text);
  assert.equal(toolbarFocus.after, toolbarFocus.text);
  console.log('PASS toolbar fields keep focus during rapid changes and preserve document text');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.docs-format').evaluate(el => el.open), false, 'Escape closes Format before the editor');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.side-editor').count(), 0); assert.equal(await page.locator('body.editor-open, body.editor-wide, body.docs-open, body.docs-full').count(), 0);
  console.log('PASS document Open event, half and full width, type, camera placement, no stage reflow and Escape close');

  await page.evaluate(() => aegis.canvas.setView({ x: 0, y: 0, z: 1 }));
  await page.locator('.card[data-id=sheet001] thead button').first().dblclick();
  assert.equal(await page.locator('.sheet-editor').count(), 0, 'Header sorting does not open the editor');
  await page.locator('.card[data-id=sheet001] tbody td').first().dblclick(); await page.locator('.sheet-editor').waitFor();
  await page.waitForTimeout(450); await page.keyboard.press('Escape');
  await page.evaluate(() => aegis.canvas.setView({ x: 0, y: 0, z: 1 }));
  await page.locator('.card[data-id=sheet001]').click({ button: 'right', position: { x: 20, y: 20 } });
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click(); await page.locator('.sheet-editor').waitFor();
  await page.waitForTimeout(450); await page.keyboard.press('Escape');
  await openEvent('note0001'); assert.equal(await page.locator('.side-editor').count(), 0);
  console.log('PASS sheet double-click and context menu, header sort preservation and ignored other card kinds');

  await page.emulateMedia({ reducedMotion: 'reduce' }); await openEvent('sheet001');
  const reduced = await page.locator('.sheet-editor').evaluate(el => ({ transform: getComputedStyle(el).transform, transition: getComputedStyle(el).transitionProperty }));
  assert.equal(reduced.transform, 'none'); assert.equal(reduced.transition, 'opacity'); await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.evaluate(() => document.body.classList.add('motion-off'));
  await openEvent('sheet001');
  assert.equal(await page.locator('.sheet-editor').evaluate(el => getComputedStyle(el).transitionProperty), 'opacity');
  await grid.locator('[data-r="0"][data-c="0"]').click(); await grid.press('Shift+Tab');
  assert.equal(await page.getByLabel('Selected cell value', { exact: true }).evaluate(el => el === document.activeElement), true, 'Tab can leave the grid');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  const persisted = (await board()).cards.find(c => c.id === 'sheet001'); assert.equal(persisted.data.rows[0].cells[0], 'First night'); assert.equal(persisted.data.columns[0].label, 'Evening');
  assert.deepEqual(errors, []);
  console.log('PASS reduced motion, Motion off, focus can leave, persisted sheet after reload and no browser errors');
} catch (error) { await page.screenshot({ path: out('editors-fail.png') }); console.error(error); console.error(errors); process.exitCode = 1; }
finally { await browser.close(); host.kill(); vite.kill(); disposeUiSnapshot(ui); }
