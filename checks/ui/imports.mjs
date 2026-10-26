import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { assertSlideFits } from './deck-fit.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, appendFileSync, cpSync, symlinkSync, existsSync, writeFileSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const offset = Number(process.env.AEGIS_PORT_OFFSET || 0), vitePort = 5195 + offset;
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const token = `imports-${process.pid}`, stamp = Date.now(), built = process.env.AEGIS_IMPORTS_BUILT === '1';
const data = mkdtempSync(join(tmpdir(), 'aegis-imports-'));
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', ...(built ? { AEGIS_UI: repo + '/app/dist' } : {}) } });
host.stderr.on('data', d => appendFileSync(out(`imports-host-${stamp}.txt`), d));
let vite, browser, page;
const errors = [], workerRequests = [];
const fixture = name => ({ name, bytes: readFileSync(join(repo, 'checks/fixtures', name)).toString('base64') });
const cards = () => page.evaluate(() => aegis.canvas.board.cards);
const stored = () => page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`));
async function drop(names) {
  await page.evaluate(files => {
    const x = aegis.canvas.board.cards.length * 1000;
    aegis.canvas.setView({ x: 160 - x, y: 40, z: 1 });
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([Uint8Array.from(atob(file.bytes), c => c.charCodeAt(0))], file.name, { type: file.name.endsWith('.pdf') ? 'application/pdf' : '' }));
    document.getElementById('stage').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 160, clientY: 140 }));
  }, names.map(fixture));
}
async function waitCard(name) {
  await page.waitForFunction(name => aegis.canvas.board.cards.some(c => c.props?.import?.name === name), name, { timeout: 30000 });
  await page.waitForFunction(async name => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.some(c => c.props?.import?.name === name), name, { timeout: 15000 });
  return (await cards()).filter(c => c.props?.import?.name === name).at(-1);
}
async function verifyAsset(url, type, original) {
  assert.match(url, /^asset:[a-f0-9]{32}\.[a-z0-9]{3,4}$/);
  const base = await page.evaluate(() => aegis.host.base);
  const response = await fetch(`${base}/assets/${url.slice(6)}`);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), type);
  const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length > 100);
  if (original) assert.deepEqual(bytes, readFileSync(join(repo, 'checks/fixtures', original)));
}
async function screenshots(name, id) {
  for (const [width, height] of [[1440, 900], [1586, 992], [390, 844]]) {
    await page.setViewportSize({ width, height });
    if (id) await page.evaluate(id => { const card = aegis.canvas.board.cards.find(c => c.id === id); const z = Math.min(1, (innerWidth - 48) / card.w, (innerHeight - 180) / card.h); aegis.canvas.setView({ x: (innerWidth - card.w * z) / 2 - card.x * z, y: 76 - card.y * z, z }); aegis.canvas.select([id]); }, id);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); });
    await page.screenshot({ path: out(`imports-${built ? 'built-' : ''}${name}-${width}-${stamp}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
try {
  const port = await new Promise((resolve, reject) => { host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); }); host.once('exit', code => reject(new Error(`Host exited ${code}`))); });
  if (!built) {
    const ui = mkdtempSync(join(tmpdir(), 'aegis-imports-ui-'));
    for (const file of ['src', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'svelte.config.js', 'public']) if (existsSync(repo + '/app/' + file)) cpSync(repo + '/app/' + file, join(ui, file), { recursive: true });
    symlinkSync(repo + '/app/node_modules', join(ui, 'node_modules'), 'dir');
    // macOS resolves worker entries through /private/var while tmpdir() returns /var.
    writeFileSync(join(ui, 'vite.imports.config.ts'), `import { mergeConfig } from 'vite'; import base from './vite.config.ts'; export default mergeConfig(base, { server: { fs: { allow: ${JSON.stringify([ui, realpathSync(ui), repo + '/app/node_modules', realpathSync(repo + '/app/node_modules')])} } } });`);
    vite = spawn('npx', ['vite', '--config', 'vite.imports.config.ts', '--port', String(vitePort), '--strictPort'], { cwd: ui, stdio: 'pipe' });
    vite.stderr.on('data', d => appendFileSync(out(`imports-vite-${stamp}.txt`), d));
    await new Promise((resolve, reject) => { vite.stdout.on('data', d => { if (/Local/.test(String(d))) resolve(); }); vite.once('exit', code => reject(new Error(`Vite exited ${code}`))); });
  }
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  // Keep interception enabled before any input. Enabling it per wait can race keyboard.press.
  page.on('filechooser', () => {});
  await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  page.on('pageerror', error => errors.push(error.stack));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (/pdf[.-]worker/.test(response.url())) workerRequests.push({ url: response.url(), status: response.status(), type: response.headers()['content-type'] }); });
  // Match the app's worker and connection policy when checking the built host UI.
  if (built) await page.route('**/ui/index.html?*', async route => { const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:* ws://127.0.0.1:*; img-src 'self' data: blob: https: http://127.0.0.1:*; media-src 'self' blob: https: http://127.0.0.1:*; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src https://open.spotify.com" } }); });
  await page.goto(built ? `http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}` : `http://127.0.0.1:${vitePort}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board, null, { timeout: 20000 });
  await page.evaluate(() => {
    window.__importMotions = [];
    new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement && node.dataset.id) window.__importMotions.push({ id: node.dataset.id, durations: node.getAnimations().map(animation => animation.effect.getTiming().duration) }); }).observe(document.getElementById('world'), { childList: true });
  });
  assert.equal((await cards()).length, 0);
  assert.equal(await page.locator('#empty .empty-actions button').count(), 3);
  assert.equal(await page.locator('#empty .empty-mark').count(), 0);
  await screenshots('empty');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.empty-actions button').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.body.classList.add('motion-off'));
  assert.equal(await page.locator('.empty-actions button').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.evaluate(() => document.body.classList.remove('motion-off'));
  console.log('PASS quiet empty-board actions at 1440, 1586 and 390, with both reduced-motion settings');

  // WKWebView versions supported by the app can lack these newer JS built-ins.
  await page.evaluate(() => { delete Promise.withResolvers; delete Promise.try; delete Math.sumPrecise; delete Uint8Array.fromBase64; });
  await drop(['two-pages.pdf']);
  await page.locator('.import-progress').waitFor();
  let pdf = await waitCard('two-pages.pdf');
  await page.locator(`.card[data-id="${pdf.id}"]`).waitFor();
  assert.ok(await page.evaluate(id => window.__importMotions.some(motion => motion.id === id && motion.durations.includes(240)), pdf.id));
  assert.equal(pdf.type, 'doc'); assert.equal(pdf.props.pages.length, 2);
  assert.match(pdf.props.body, /# A quieter table/); assert.match(pdf.props.body, /Second page text/);
  assert.equal(pdf.props.doc.content.filter(node => node.type === 'image').length, 2);
  assert.equal(pdf.props.doc.content.filter(node => node.type === 'heading')[0].content[0].text, 'A quieter table');
  for (const picture of pdf.props.pages) await verifyAsset(picture.src, 'image/jpeg');
  await verifyAsset(pdf.props.import.original, 'application/pdf', 'two-pages.pdf');
  await screenshots('pdf', pdf.id);
  assert.ok(workerRequests.some(request => request.status === 200 && /javascript/.test(request.type)));
  assert.ok(await page.evaluate(() => typeof Promise.withResolvers === 'function' && typeof Math.sumPrecise === 'function'));
  await page.evaluate(id => aegis.canvas.select([id]), pdf.id);
  await page.locator(`.window-actions [data-window-action="${pdf.id}"]`).click();
  await page.locator('.docs-panel').waitFor();
  assert.equal(await page.locator('.docs-panel').evaluate(el => getComputedStyle(el).transitionDuration), '0.26s');
  assert.equal(await page.locator('.docs-panel img[data-asset-src]').count(), 2);
  await page.waitForFunction(() => [...document.querySelectorAll('.docs-panel img')].every(img => img.complete && img.naturalWidth > 0));
  await page.locator('.docs-panel img').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: out(`imports-${built ? 'built-' : ''}pdf-pages-1440-${stamp}.png`) });
  await page.locator('.docs-panel .tiptap').click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type('Editable import text.');
  await page.waitForFunction(() => document.querySelector('.docs-panel [data-saved]')?.textContent === 'Saved');
  pdf = (await stored()).cards.find(card => card.id === pdf.id);
  assert.ok(pdf.props.doc.content.filter(node => node.type === 'image').every(node => node.attrs.src.startsWith('asset:')));
  await page.getByRole('button', { name: 'Close document', exact: true }).click();
  assert.equal(await page.locator('.docs-panel').evaluate(el => getComputedStyle(el).transitionDuration), '0.2s');
  await page.locator('.docs-panel').waitFor({ state: 'detached' });
  console.log('PASS synthetic PDF drop extracts headings and editable text, saves both page images and the original, uses a real module worker, and retains stable image references after editing');

  await drop(['two-slides.pptx']);
  let pptx = await waitCard('two-slides.pptx');
  assert.equal(pptx.type, 'deck'); assert.equal(pptx.props.slides.length, 2);
  assert.equal(pptx.props.slides[0].title, 'First import slide'); assert.equal(pptx.props.slides[1].title, 'Second import slide');
  assert.equal(pptx.props.slides[0].body, 'First slide body stays editable.');
  assert.equal(pptx.props.slides[0].images.length, 2); assert.equal(pptx.props.slides[1].images.length, 1);
  for (const picture of pptx.props.slides[0].images) await verifyAsset(picture.src, 'image/png');
  await verifyAsset(pptx.props.import.original, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'two-slides.pptx');
  await screenshots('pptx', pptx.id);
  const pptxCard = page.locator(`.card[data-id="${pptx.id}"]`);
  for (const [w, h] of [[470, 352], [760, 292]]) {
    await page.evaluate(({ id, w, h }) => aegisCtx.apply([{ op: 'update', id, set: { w, h } }]), { id: pptx.id, w, h });
    await assertSlideFits(pptxCard.locator('.deck-main > .deck-fit'), { label: `Imported PPTX ${w} by ${h}`, pictures: 2 });
    await assertSlideFits(pptxCard.locator('.deck-thumb > .deck-fit').first(), { label: 'Imported PPTX thumbnail', pictures: 2 });
  }
  await page.evaluate(id => aegis.canvas.select([id]), pptx.id);
  await page.locator(`.window-actions [data-window-action="${pptx.id}"]`).click();
  await page.locator('.deck-panel').waitFor();
  assert.equal(await page.locator('.deck-panel .deck-slide-wrap').count(), 2);
  await assertSlideFits(page.locator('.deck-panel .deck-slide-wrap > .deck-fit').first(), { label: 'Imported PPTX editor', pictures: 2 });
  await assertSlideFits(page.locator('.deck-panel .deck-film-item > .deck-fit').first(), { label: 'Imported PPTX filmstrip', pictures: 2 });
  await page.getByRole('textbox', { name: 'Slide 1 title', exact: true }).fill('Edited import title');
  await page.waitForFunction(() => document.querySelector('.deck-panel [data-saved]')?.textContent === 'Saved');
  pptx = (await stored()).cards.find(card => card.id === pptx.id);
  assert.equal(pptx.props.slides[0].title, 'Edited import title'); assert.equal(pptx.props.slides[0].images.length, 2);
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page.locator('.deck-panel').waitFor({ state: 'detached' });
  console.log('PASS synthetic PPTX drop follows presentation relationship order, imports titles, bodies and pictures, and retains pictures after a slide edit');

  await drop(['two-previews.key']);
  const key = await waitCard('two-previews.key');
  assert.equal(key.type, 'deck'); assert.equal(key.props.slides.length, 2);
  assert.deepEqual(key.props.slides.map(slide => slide.images[0].alt), ['st-2.jpg', 'st-10.jpg']);
  assert.ok(key.props.slides.every(slide => slide.layout === 'image' && slide.imageOnly));
  for (const slide of key.props.slides) await verifyAsset(slide.images[0].src, 'image/jpeg');
  await verifyAsset(key.props.import.original, 'application/vnd.apple.keynote', 'two-previews.key');
  await screenshots('keynote', key.id);
  assert.match(await page.locator(`.card[data-id="${key.id}"] .deck-source`).getAttribute('href'), /\/assets\/.*\.key$/);
  // Detail links live in the detail tier; below it the card is a semantic summary.
  await page.evaluate(id => { const c = aegis.canvas.board.cards.find(c => c.id === id); aegis.canvas.setView({ x: 80 - c.x, y: 80 - c.y, z: 1 }); }, key.id);
  await page.waitForFunction(() => document.getElementById('stage').dataset.zoomTier === 'detail');
  const downloadEvent = page.waitForEvent('download');
  await page.locator(`.card[data-id="${key.id}"] .deck-source`).click();
  const originalDownload = await downloadEvent;
  assert.equal(originalDownload.suggestedFilename(), 'two-previews.key');
  assert.deepEqual(readFileSync(await originalDownload.path()), readFileSync(join(repo, 'checks/fixtures/two-previews.key')));
  console.log('PASS synthetic Keynote drop sorts previews numerically, prefers slide previews to QuickLook, and links the unchanged original file');

  // The More tools Import button and the existing Import images tool share the route.
  await page.evaluate(() => aegis.canvas.select([]));
  await page.mouse.move(24, 450); await page.locator('#toolsFold').click();
  assert.equal(await page.locator('#toolsPopover section').filter({ has: page.getByRole('heading', { name: 'Media', exact: true }) }).getByRole('button', { name: 'Import', exact: true }).count(), 1);
  const picked = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const picker = await picked; assert.match(await picker.element().getAttribute('accept'), /\.pdf.*\.pptx.*\.key/);
  await picker.setFiles(join(repo, 'checks/fixtures/quicklook.key')); await waitCard('quicklook.key');
  // A selected deck must not steal Enter from the focused import button.
  await page.evaluate(id => aegis.canvas.select([id]), key.id);
  await page.locator('#toolsFold').click();
  await page.locator('#toolsPopover [data-tool="import-image"]').focus();
  await page.mouse.move(700, 450); await page.waitForTimeout(1400);
  assert.equal(await page.locator('#toolsPopover [data-tool="import-image"]').evaluate(el => el === document.activeElement), true);
  const imagesPick = page.waitForEvent('filechooser'); await page.keyboard.press('Enter');
  const imagesPicker = await imagesPick; assert.match(await imagesPicker.element().getAttribute('accept'), /\.pdf/);
  await imagesPicker.setFiles(join(repo, 'checks/fixtures/two-slides.pptx'));
  await page.waitForFunction(() => aegis.canvas.board.cards.filter(c => c.props?.import?.name === 'two-slides.pptx').length === 2);
  const keyboardDeck = (await cards()).filter(card => card.props?.import?.name === 'two-slides.pptx').at(-1);
  await page.locator(`.card[data-id="${keyboardDeck.id}"]`).waitFor();
  assert.ok(await page.evaluate(id => window.__importMotions.some(motion => motion.id === id && !motion.durations.includes(240)), keyboardDeck.id));
  await page.evaluate(() => { document.activeElement?.blur(); aegis.canvas.select([]); });
  await page.mouse.move(24, 450);
  const mediaPick = page.waitForEvent('filechooser'); await page.locator('#tools [data-tool="media"]').click();
  const mediaPicker = await mediaPick; assert.match(await mediaPicker.element().getAttribute('accept'), /\.key/);
  await mediaPicker.setFiles(join(repo, 'checks/fixtures/quicklook.key'));
  await page.waitForFunction(() => aegis.canvas.board.cards.filter(c => c.props?.import?.name === 'quicklook.key').length === 2);
  console.log('PASS More tools Files > Import, keyboard activation of Import images and the media picker accept presentations and use the same importer, including QuickLook fallback');

  // I also opens the picker from a focused deck immediately after its import.
  const justImported = (await cards()).filter(card => card.props?.import?.name === 'quicklook.key').at(-1);
  await page.locator(`.card[data-id="${justImported.id}"]`).focus();
  assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), [justImported.id]);
  const selectedPick = page.waitForEvent('filechooser'); await page.keyboard.press('i');
  const selectedPicker = await selectedPick;
  assert.match(await selectedPicker.element().getAttribute('accept'), /\.pdf.*\.pptx.*\.key/);
  await selectedPicker.setFiles([]);
  assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), [justImported.id]);
  console.log('PASS I opens the import picker from a focused, selected deck just after import and preserves selection');

  await page.evaluate(() => { document.activeElement?.blur(); aegis.canvas.select([]); });
  await page.mouse.move(700, 450);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('tools')).pointerEvents === 'none');
  const shortcutPick = page.waitForEvent('filechooser'); await page.keyboard.press('i');
  await (await shortcutPick).setFiles([]);
  const programmaticPick = page.waitForEvent('filechooser');
  await page.locator('#tools [data-tool="import-image"]').evaluate(button => button.click());
  await (await programmaticPick).setFiles([]);
  assert.equal(await page.locator('#tools').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  console.log('PASS selected deck preserves native Enter on Import images; shortcut and programmatic import work while the rail is idle');

  // Exercise the directory-entry route used by Finder's package drops.
  const packageDrop = await page.evaluate(file => {
    const image = new File([Uint8Array.from(atob(file.bytes), c => c.charCodeAt(0))], 'st-1.jpg', { type: 'image/jpeg' });
    const directory = (name, children) => ({ name, isDirectory: true, isFile: false, createReader() { let read = false; return { readEntries(done) { done(read ? [] : children); read = true; } }; } });
    const root = directory('package-drop.key', [directory('Data', [{ name: 'st-1.jpg', isFile: true, isDirectory: false, file(done) { done(image); } }])]);
    const transfer = new DataTransfer(); transfer.items.add(new File([''], 'package-drop.key'));
    // Chromium returns fresh wrappers for items. Override the prototype for this
    // synchronous dispatch, then restore it before awaiting any import work.
    const originalEntry = DataTransferItem.prototype.webkitGetAsEntry;
    DataTransferItem.prototype.webkitGetAsEntry = function () { return this.getAsFile()?.name === 'package-drop.key' ? root : originalEntry.call(this); };
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 160, clientY: 140 });
    const directorySeen = transfer.items[0].webkitGetAsEntry()?.isDirectory;
    document.getElementById('stage').dispatchEvent(event);
    DataTransferItem.prototype.webkitGetAsEntry = originalEntry;
    return { directorySeen, cancelled: event.defaultPrevented };
  }, fixture('preview-first.jpg'));
  assert.deepEqual(packageDrop, { directorySeen: true, cancelled: true });
  const packagedKey = await waitCard('package-drop.key'); assert.equal(packagedKey.props.slides.length, 1);
  await verifyAsset(packagedKey.props.import.original, 'application/vnd.apple.keynote');
  console.log('PASS Keynote directory-entry drops repack the original package and import its preview');

  const count = (await cards()).length;
  for (const [name, message] of [['no-previews.key', /export it to PDF/], ['invalid.pdf', /could not be read/], ['oversized.pptx', /128 MB/]]) {
    await drop([name]); await page.getByRole('status').filter({ hasText: `Could not import ${name}.` }).waitFor();
    assert.match(await page.locator('#toast').textContent(), message);
    assert.equal((await cards()).length, count);
  }
  // Reject large files before parsing or upload, without shipping a 65 MB fixture.
  await page.evaluate(() => { const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(64 * 1024 * 1024 + 1)], 'too-big.pdf', { type: 'application/pdf' })); document.getElementById('stage').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })); });
  await page.getByRole('status').filter({ hasText: 'This file is over 64 MB' }).waitFor();
  assert.equal((await cards()).length, count);
  console.log('PASS missing previews, invalid PDF, expanded ZIP limits and 64 MB file limits report actionable errors without creating partial cards');

  // Mixed clipboard imports must be handled once, with default paste cancelled synchronously.
  const cancelled = await page.evaluate(file => {
    const transfer = new DataTransfer(); transfer.items.add(new File([Uint8Array.from(atob(file.bytes), c => c.charCodeAt(0))], file.name));
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }); document.getElementById('stage').dispatchEvent(event); return event.defaultPrevented;
  }, fixture('quicklook.key'));
  assert.equal(cancelled, true);
  await page.waitForFunction(expected => aegis.canvas.board.cards.length === expected, count + 1);
  await page.locator('.import-progress').waitFor({ state: 'detached' });

  // Switching boards while an upload is held keeps the result on the captured board.
  const firstBoard = await page.evaluate(() => aegis.canvas.board.id);
  let release, intercepted;
  const held = new Promise(resolve => { intercepted = resolve; });
  let heldOnce = false;
  await page.route('**/assets', async route => { if (route.request().method() !== 'POST' || heldOnce) return route.continue(); heldOnce = true; intercepted(); await new Promise(resolve => { release = resolve; }); await route.continue(); });
  await drop(['quicklook.key']); await held;
  const second = await page.evaluate(async () => { const next = await aegis.host.post('/boards', { name: 'Import destination isolation' }); const board = await aegis.host.get(`/boards/${next.id}`); aegis.canvas.setBoard(board); return next; });
  release();
  await page.waitForFunction(async id => (await aegis.host.get(`/boards/${id}`)).cards.filter(c => c.props?.import?.name === 'quicklook.key').length === 4, firstBoard);
  await page.unroute('**/assets');
  assert.equal((await cards()).length, 0);
  assert.equal((await page.evaluate(id => aegis.host.get(`/boards/${id}`), second.id)).cards.length, 0);
  console.log('PASS paste cancels the browser default once, and switching boards during conversion saves into the original board');

  // Imported canvas windows leave a short snapshot on pointer deletion.
  await drop(['quicklook.key']); const closing = await waitCard('quicklook.key');
  await page.locator(`.card[data-id="${closing.id}"]`).waitFor();
  await page.locator(`.card[data-id="${closing.id}"]`).click({ button: 'right', position: { x: 100, y: 180 } });
  await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.locator('.import-window-exit').waitFor();
  assert.ok(await page.locator('.import-window-exit').evaluate(el => el.getAnimations().some(a => a.effect.getTiming().duration === 200)));
  await page.locator('.import-window-exit').waitFor({ state: 'detached' });
  console.log('PASS imported window arrival and pointer close motion, instant keyboard import, and document editor open/close motion');

  // Toasts animate in and out, keyboard feedback and both reduced-motion paths cut instantly.
  await page.locator('.import-progress').waitFor({ state: 'detached' });
  await page.mouse.click(1100, 650);
  await page.evaluate(() => { const toast = document.getElementById('toast'); toast.hidden = true; });
  await page.waitForTimeout(210);
  await page.evaluate(() => aegisCtx.toast('Import motion check'));
  assert.ok(await page.locator('#toast').evaluate(el => el.getAnimations().some(a => a.effect.getTiming().duration === 200)));
  await page.waitForTimeout(210);
  await page.evaluate(() => document.getElementById('toast').hidden = true);
  await page.locator('#toast.toast-leaving').waitFor();
  await page.locator('#toast.toast-leaving').waitFor({ state: 'detached' });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.evaluate(() => aegisCtx.toast('Reduced motion'));
  assert.equal(await page.locator('#toast').evaluate(el => el.getAnimations().length), 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.keyboard.press('Escape'); await page.evaluate(() => aegisCtx.toast('Keyboard feedback'));
  assert.equal(await page.locator('#toast').evaluate(el => el.getAnimations().length), 0);
  await page.evaluate(() => document.body.classList.add('motion-off')); await page.evaluate(() => aegisCtx.toast('Motion off'));
  assert.equal(await page.locator('#toast').evaluate(el => el.getAnimations().length), 0);
  console.log('PASS toast enter and exit motion, keyboard feedback and both reduced-motion paths');

  const assets = readdirSync(join(data, 'assets')); assert.ok(assets.some(name => name.endsWith('.pdf')) && assets.some(name => name.endsWith('.pptx')) && assets.some(name => name.endsWith('.key')));
  writeFileSync(out(`imports-evidence-${stamp}.json`), JSON.stringify({ built, workerRequests, assets, board: await page.evaluate(id => aegis.host.get(`/boards/${id}`), firstBoard) }, null, 2));
  assert.deepEqual(errors, []);
  console.log(`PASS no browser errors, persisted cards and ${assets.length} assets verified${built ? ' in the built host UI under the packaged CSP' : ''}`);
} catch (error) {
  if (page) await page.screenshot({ path: out(`imports-fail-${stamp}.png`) }).catch(() => {});
  if (page) console.error('Last toast:', await page.locator('#toast').textContent().catch(() => 'unavailable'));
  if (page) console.error('Import progress:', await page.locator('.import-progress').allTextContents(), 'workers:', workerRequests);
  console.error(error); console.error(errors); process.exitCode = 1;
} finally { await browser?.close(); host.kill(); vite?.kill(); }
