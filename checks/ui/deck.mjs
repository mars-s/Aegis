import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, appendFileSync, cpSync, symlinkSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const PORT_OFFSET = Number(process.env.AEGIS_PORT_OFFSET || 0); // separate worktrees can run checks at once
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = `deck-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-deck-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise((resolve, reject) => { host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); }); host.once('exit', reject); });
const ui = mkdtempSync(join(tmpdir(), 'aegis-deck-ui-'));
for (const file of ['src', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'svelte.config.js', 'public']) if (existsSync(repo + '/app/' + file)) cpSync(repo + '/app/' + file, join(ui, file), { recursive: true });
symlinkSync(repo + '/app/node_modules', join(ui, 'node_modules'), 'dir');
// The frozen sources use the worktree's installed fonts through this symlink.
writeFileSync(join(ui, 'vite.deck.config.ts'), `import { mergeConfig } from 'vite'; import base from './vite.config'; export default mergeConfig(base, { server: { fs: { allow: ${JSON.stringify([ui, repo + '/app/node_modules'])} } } });`);
const vite = spawn('npx', ['vite', '--config', 'vite.deck.config.ts', '--port', String(5192 + PORT_OFFSET), '--strictPort'], { cwd: ui, stdio: 'pipe' });
vite.stderr.on('data', d => appendFileSync(out('deck-vite.txt'), d));
const ready = new Promise((resolve, reject) => { vite.stdout.on('data', d => { if (/Local/.test(String(d))) resolve(); }); vite.once('exit', code => reject(new Error('Vite exited ' + code))); });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, colorScheme: 'dark' });
await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
const errors = []; page.on('pageerror', e => errors.push(e.stack));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const board = () => page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`));
const saved = () => page.waitForFunction(() => document.querySelector('.deck-panel [data-saved]')?.textContent === 'Saved', null, { timeout: 15000 });
const selected = index => page.waitForFunction(i => document.querySelector(`.deck-film-item[data-i="${i}"]`)?.getAttribute('aria-selected') === 'true', index);
const slides = [
  { id: 's1', layout: 'title', title: 'A calmer, sharper me', sub: 'What twelve weeks of sleep data says about my best days', body: '' },
  { id: 's2', layout: 'chart', title: 'Hours slept per night, by week', sub: 'Dashed line: my 7 hour target', body: '', chart: { values: [6.8, 6.9, 7, 6.6, 7.1, 7, 7.2, 5.4, 7.3, 7.4, 7.2, 7.5], target: 7, label: 'Fictional weekly sleep averages' } },
  { id: 's3', layout: 'three', title: 'What helps', sub: 'My best focus days had all three', body: 'In bed by 11\nNo late coffee\nSame wake time' },
  { id: 's4', layout: 'text', title: 'The next four weeks', sub: 'Small changes to try', body: 'In bed by 11 pm on weeknights.\nNo caffeine after 2 pm.\nSame wake time on weekends.' },
];
const batch = [{ op: 'create', type: 'deck', newId: 'decktest', text: 'Sleep deck', x: 100, y: 100, props: { slides, current: 0 }, ref: 'deck' }, { op: 'focus', ids: ['$deck'] }];
try {
  await ready;
  await page.goto(`http://localhost:${5192 + PORT_OFFSET}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board, null, { timeout: 15000 });
  const run = await page.evaluate(brief => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief, model: { provider: 'fake', modelId: 'fake' } }), 'FAKE ' + JSON.stringify(batch));
  assert.ok(run[0]?.id);
  await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.id === 'decktest'), null, { timeout: 20000 });
  await page.evaluate(() => { aegis.canvas.select(['decktest']); aegis.canvas.setView({ x: 420, y: 90, z: 1 }); });
  const card = page.locator('.card[data-id=decktest]');
  await card.waitFor();
  assert.equal(await card.locator('.deck-title-strip').textContent(), 'Sleep deck · SlidesOpen');
  assert.equal(await card.locator('.deck-thumb').count(), 3);
  assert.equal(await card.locator('img').count(), 0);
  await page.screenshot({ path: out('deck-canvas.png') });
  // Pan and zoom must reuse the same deck DOM.
  assert.ok(await card.evaluate(async el => { const content = el.firstElementChild; aegis.canvas.setView({ x: 400, y: 100, z: .95 }); await new Promise(requestAnimationFrame); return el.isConnected && el.firstElementChild === content; }));
  console.log('PASS fake agent creates a deck, canvas shows the strip and three thumbnails, camera changes reuse its DOM');

  await card.focus(); await page.keyboard.press('Enter');
  const panel = page.locator('.deck-panel.is-open'); await panel.waitFor();
  assert.equal(await panel.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  assert.equal(await page.locator('body.editor-open').count(), 1);
  assert.equal(await panel.locator('.deck-slide-wrap').count(), 4);
  const stage = panel.locator('.deck-stage');
  await stage.hover(); await page.mouse.wheel(0, 465); await selected(1);
  await page.getByRole('tab', { name: 'Go to slide 3', exact: true }).click(); await selected(2);
  assert.ok(await stage.evaluate(el => el.scrollTop > 500));
  await page.getByRole('tab', { name: 'Go to slide 2', exact: true }).click(); await selected(1);
  assert.equal(await panel.locator('.deck-slide-wrap[data-i="1"] .deck-chart .line').evaluate(el => getComputedStyle(el).strokeWidth), '1.4px');
  assert.equal(await panel.locator('.deck-slide-wrap[data-i="1"] .deck-chart .target').count(), 1);
  const chartTitle = page.getByRole('textbox', { name: 'Slide 2 title', exact: true });
  await chartTitle.fill('A steadier sleep routine');
  await page.getByRole('textbox', { name: 'Slide 2 subtitle', exact: true }).fill('Fictional data, with a 7 hour target');
  await saved();
  let stored = (await board()).cards.find(c => c.id === 'decktest');
  assert.equal(stored.props.slides[1].title, 'A steadier sleep routine');
  assert.equal(stored.props.slides[1].sub, 'Fictional data, with a 7 hour target');
  assert.equal(stored.props.current, 1);
  await page.screenshot({ path: out('deck-editor.png') });
  console.log('PASS Enter opens instantly, stage scrolling and thumbnails agree, plaintext title and subtitle save to the host');

  await page.getByRole('button', { name: 'Add slide', exact: true }).click();
  assert.equal(await panel.locator('.deck-slide-wrap').count(), 5);
  await page.getByRole('textbox', { name: 'Slide 5 title', exact: true }).fill('Keep the routine');
  await saved(); stored = (await board()).cards.find(c => c.id === 'decktest');
  const added = stored.props.slides[4].id;
  assert.equal(stored.props.current, 4); assert.equal(stored.props.slides[4].title, 'Keep the routine');
  await page.getByRole('tab', { name: 'Go to slide 5', exact: true }).focus();
  await page.keyboard.press('Alt+ArrowUp'); await saved();
  stored = (await board()).cards.find(c => c.id === 'decktest'); assert.equal(stored.props.slides[3].id, added);
  await page.keyboard.press('Alt+ArrowDown'); await saved();
  stored = (await board()).cards.find(c => c.id === 'decktest'); assert.equal(stored.props.slides[4].id, added);
  await page.keyboard.press('Delete'); await saved();
  stored = (await board()).cards.find(c => c.id === 'decktest'); assert.equal(stored.props.slides.length, 4); assert.ok(!stored.props.slides.some(s => s.id === added));
  await page.getByRole('button', { name: 'Full width', exact: true }).click(); assert.equal(await page.locator('body.editor-wide').count(), 1);
  await page.getByRole('button', { name: 'Full width', exact: true }).click();
  await page.keyboard.press('Escape'); assert.equal(await panel.count(), 0);
  assert.equal(await page.locator('body.editor-open').count(), 0);
  console.log('PASS add, Alt+Up/Down reorder, Delete, full width and Escape persist through board commands');

  await card.dblclick(); await panel.waitFor();
  assert.equal(await panel.evaluate(el => getComputedStyle(el).transitionDuration), '0.26s');
  await page.keyboard.press('Escape');
  await card.click({ button: 'right' });
  await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Open deck', exact: true }).focus();
  await page.keyboard.press('Enter'); await panel.waitFor();
  assert.equal(await page.locator('.ctx-menu:not([hidden])').count(), 0);
  assert.equal(await panel.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.keyboard.press('Escape');
  await page.locator('#stage').click({ position: { x: 1350, y: 450 } });
  await page.evaluate(() => { document.body.classList.add('motion-off'); document.body.dispatchEvent(new CustomEvent('aegis:open-card', { bubbles: true, detail: { id: 'decktest', viaKey: false } })); });
  await panel.waitFor();
  assert.equal(await panel.evaluate(el => getComputedStyle(el).transform), 'none');
  assert.equal(await panel.evaluate(el => getComputedStyle(el).transitionProperty), 'opacity');
  // The app's Motion off setting (settings.css) zeroes every transition, so the panel cuts in rather than fades.
  assert.equal(await panel.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.body.classList.remove('motion-off'));
  await page.locator('#stage').click({ position: { x: 1350, y: 450 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: 'decktest' } })));
  await panel.waitFor(); assert.equal(await panel.evaluate(el => getComputedStyle(el).transform), 'none');
  assert.equal(await panel.evaluate(el => getComputedStyle(el).transitionDuration), '0.16s');
  await page.keyboard.press('Escape'); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  stored = (await board()).cards.find(c => c.id === 'decktest'); assert.equal(stored.props.slides[1].title, 'A steadier sleep routine');
  console.log('PASS double-click, Open deck menu, bubbling open event, both reduced-motion settings and reload persistence');

  await page.keyboard.press('b');
  await page.locator('#stage').click({ position: { x: 1200, y: 250 } }); await panel.waitFor();
  assert.equal(await panel.locator('.deck-slide-wrap').count(), 1);
  await page.getByRole('button', { name: 'Delete slide 1', exact: true }).click(); await saved();
  assert.equal(await panel.locator('.deck-slide-wrap').count(), 0);
  await page.getByRole('button', { name: 'Add slide', exact: true }).click();
  await page.getByRole('textbox', { name: 'Slide 1 title', exact: true }).fill('Saved on close');
  await page.keyboard.press('Escape');
  await page.waitForFunction(async () => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.some(c => c.type === 'deck' && c.props?.slides?.[0]?.title === 'Saved on close'));
  console.log('PASS B tool places a starter deck, every slide can be deleted, Add slide recovers and closing flushes pending edits');
  assert.deepEqual(errors, []); console.log('PASS no browser errors');
} catch (error) { await page.screenshot({ path: out('deck-fail.png') }); console.error(error); console.error(errors); process.exitCode = 1; }
finally { await browser.close(); host.kill(); vite.kill(); }
