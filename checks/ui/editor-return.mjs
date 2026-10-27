// Real host and shipped bundle in both engines. Every run uses disposable board data.
import { chromium, webkit } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `editor-return-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: {
  ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-editor-return-')), AEGIS_UI: repo + '/app/dist',
  AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1',
}, stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', bytes => { const match = /"port":(\d+)/.exec(String(bytes)); if (match) resolve(match[1]); });
  host.once('exit', code => reject(Error(`Host exited ${code}`)));
});
const evidence = [];
const fixtures = [
  { op: 'create', type: 'doc', newId: 'returndoc', text: 'A clear idea', x: 100, y: 150, props: { body: 'Write, then return to the board.' } },
  { op: 'create', type: 'object', kind: 'sheet', newId: 'returnsheet', text: 'Sleep log', x: 100, y: 250, data: { columns: [{ label: 'Night', kind: 'text' }], rows: [{ cells: ['Monday'] }] } },
  { op: 'create', type: 'deck', newId: 'returndeck', text: 'A clear idea', x: 100, y: 200, props: { current: 0, slides: [{ id: 'opening', layout: 'title', title: 'A clear idea', sub: 'Room to think' }] } },
  { op: 'create', type: 'deck', newId: 'wavedeck', text: 'Sleep deck', x: 700, y: 200, props: { current: 0, slides: [{ id: 'sleep', layout: 'title', title: 'A calmer week', background: 'sci-fi-wave' }] } },
  { op: 'create', type: 'note', newId: 'returnnote', text: 'Canvas context', x: 600, y: 600 },
  { op: 'create', type: 'note', newId: 'reference', text: 'Reference', x: 4000, y: 2000 },
];
try {
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(12000);
    try {
      await page.addInitScript(() => {
        localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1');
        localStorage.setItem('aegis:theme', 'dark'); localStorage.setItem('aegis:follow', 'off');
      });
      await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
      await page.waitForFunction(() => window.aegis?.canvas?.board);
      // Each engine gets a separate board, created through the real board API.
      if (engineName === 'webkit') {
        await page.evaluate(async () => {
          const board = await aegis.host.post('/boards', { name: 'WebKit return checks' });
          localStorage.setItem('aegis:board', board.id);
        });
        await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
      }
      await page.evaluate(commands => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify(commands), model: { provider: 'fake', modelId: 'fake' } }), fixtures);
      await page.waitForFunction(() => aegis.canvas.board.cards.length === 6);
      await page.waitForFunction(async () => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).every(a => !a.running));
      const originalBoardId = await page.evaluate(() => aegis.canvas.board.id);
      const snapshot = () => page.evaluate(() => ({ view: { ...aegis.canvas.view }, selection: aegis.canvas.selection() }));
      const shot = async name => { await page.waitForTimeout(200); const path = out(`${engineName}-editor-return-${name}.png`); await page.screenshot({ path }); evidence.push({ engine: engineName, name, path }); };
      const prepare = async (id, multiple = true) => {
        await page.evaluate(({ id, multiple }) => {
          aegis.canvas.setView({ x: 130, y: 70, z: .8 }); aegis.canvas.select(multiple ? [id, 'returnnote'] : [id]);
          document.getElementById('stage').focus({ preventScroll: true });
        }, { id, multiple });
        await page.waitForTimeout(40); return snapshot();
      };
      const open = async (id, keyboard = false) => {
        await page.evaluate(({ id, keyboard }) => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, keyboard, viaKey: keyboard } })), { id, keyboard });
        await page.locator('.side-editor.is-open').waitFor();
      };
      const waitReturn = async (before, source) => {
        await page.waitForFunction(({ before, source }) => {
          const view = aegis.canvas.view;
          return ['x', 'y', 'z'].every(key => view[key] === before.view[key])
            && (!source || document.activeElement?.closest('.card')?.dataset.id === source);
        }, { before, source });
        assert.deepEqual((await snapshot()).selection, before.selection);
        assert.deepEqual((await snapshot()).view, before.view);
      };
      // The same shell must restore all three editors after pan, Fit or reference framing.
      for (const [id, action] of [['returndoc', 'pan'], ['returnsheet', 'fit'], ['returndeck', 'reference']]) {
        const before = await prepare(id);
        await open(id); await page.waitForTimeout(420);
        const expand = page.getByRole('button', { name: 'Full width', exact: true });
        assert.equal(await expand.getAttribute('aria-pressed'), 'false');
        assert.match(await expand.getAttribute('aria-keyshortcuts'), /Control\+Shift\+F/);
        assert.equal(await expand.locator('svg[aria-hidden=true]').count(), 1);
        assert.ok((await expand.locator('kbd').textContent()).includes('F'));
        await expand.click();
        assert.equal(await page.getByRole('button', { name: 'Side panel', exact: true }).getAttribute('aria-pressed'), 'true');
        if (id === 'returndoc') { await shot('document-wide'); await page.getByLabel('Document title', { exact: true }).focus(); }
        await page.keyboard.press('Control+Shift+f');
        assert.equal(await expand.getAttribute('aria-pressed'), 'false', 'shortcut restores side mode from editor content');
        if (action === 'pan') {
          await page.mouse.move(120, 720); await page.mouse.wheel(150, 220); await page.waitForTimeout(60);
          await shot('document-side');
        } else if (action === 'fit') {
          await page.evaluate(() => aegis.canvas.fit()); await page.waitForTimeout(450);
        } else {
          await page.evaluate(() => aegis.canvas.frameIds(['reference'], 1)); await page.waitForTimeout(450);
        }
        await page.evaluate(() => aegis.canvas.select(['reference']));
        const moved = await snapshot(); assert.notDeepEqual(moved.view, before.view);
        await page.locator('.side-editor [data-close]').click();
        await page.waitForTimeout(60);
        const during = await snapshot();
        assert.notDeepEqual(during.view, before.view, 'camera return moves over time');
        assert.ok(Math.abs(during.view.x - before.view.x) < Math.abs(moved.view.x - before.view.x), 'ease-out approaches the bookmark');
        await waitReturn(before, id);
        await page.locator('.side-editor').waitFor({ state: 'detached' });
        if (id === 'returndoc') await shot('restored-board');
      }
      console.log(`PASS ${engineName}: camera and selection return after pan, Fit and reference framing; stateful width controls and shortcut`);

      // Keyboard opens frame context too. Back and Escape restore the original view.
      let before = await prepare('returndoc', false);
      await page.keyboard.press('Enter'); await page.locator('.docs-panel').waitFor();
      await page.waitForTimeout(450); assert.notDeepEqual((await snapshot()).view, before.view);
      await page.getByRole('button', { name: 'Back to board', exact: false }).click(); await waitReturn(before, 'returndoc');
      await page.locator('.side-editor').waitFor({ state: 'detached' });
      before = await prepare('returndeck', false); await page.keyboard.press('Enter'); await page.locator('.deck-panel').waitFor();
      await page.waitForTimeout(450); assert.notDeepEqual((await snapshot()).view, before.view);
      await page.keyboard.press('Escape'); await waitReturn(before, 'returndeck');

      // Replacing editors retains the first canvas view and does not start a return between them.
      before = await prepare('returnsheet'); await open('returnsheet'); await page.waitForTimeout(420);
      await open('returndoc', true); await page.waitForTimeout(60);
      assert.notDeepEqual((await snapshot()).view, before.view);
      assert.equal(await page.locator('.side-editor').count(), 1);
      await page.keyboard.press('Escape'); await waitReturn(before, 'returndoc');

      // A real wheel gesture must take over from a return without a late focus jump.
      before = await prepare('returnsheet'); await open('returnsheet'); await page.waitForTimeout(420);
      await page.locator('.side-editor [data-close]').click();
      await page.mouse.move(120, 730); await page.mouse.wheel(40, 180); await page.waitForTimeout(50);
      const interrupted = await snapshot(); await page.waitForTimeout(300);
      assert.deepEqual((await snapshot()).view, interrupted.view, 'return stays interrupted');
      assert.notDeepEqual(interrupted.view, before.view);

      // Both motion settings restore in the close event, with no camera frames afterwards.
      for (const mode of ['reduced', 'off']) {
        if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
        else await page.evaluate(() => { localStorage.setItem('aegis:motion', 'off'); document.body.classList.add('motion-off'); });
        before = await prepare('returndeck'); await open('returndeck');
        await page.evaluate(() => { aegis.canvas.setView({ x: -900, y: 400, z: .4 }); document.querySelector('.side-editor [data-close]').click(); });
        assert.deepEqual((await snapshot()).view, before.view, `${mode} restores synchronously`);
        await waitReturn(before, 'returndeck'); await page.locator('.side-editor').waitFor({ state: 'detached' });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => { localStorage.setItem('aegis:motion', 'on'); document.body.classList.remove('motion-off'); });
      }
      // Resizing keeps the original world centre, rather than anchoring to the old top-left.
      before = await prepare('returnsheet'); await open('returnsheet'); await page.setViewportSize({ width: 1280, height: 900 });
      await page.keyboard.press('Escape');
      await waitReturn({ ...before, view: { ...before.view, x: before.view.x - 80, y: before.view.y - 50 } }, 'returnsheet');
      await page.setViewportSize({ width: 1440, height: 1000 });

      // A new selection in the close event takes priority over deferred source focus.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await prepare('returnsheet'); await open('returnsheet');
      await page.evaluate(() => {
        document.querySelector('.side-editor [data-close]').click();
        aegis.canvas.select(['reference']); aegis.canvas.frameIds(['reference'], 1, false, true);
        document.getElementById('stage').focus();
      });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'stage', 'the source cannot steal focus after a new selection');
      assert.deepEqual((await snapshot()).selection, ['reference']);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      console.log(`PASS ${engineName}: keyboard, Back, replacement, interruption, reduced motion, Motion off and resize`);

      // Typography is the default through the real agent tool. Wave selection persists and presents.
      await prepare('returndeck'); await open('returndeck', true);
      const titleSlide = page.locator('.deck-stage .deck-slide').first();
      assert.equal(await titleSlide.locator('.deck-ridge').count(), 0);
      await shot('deck-typography');
      await page.getByRole('button', { name: 'Slide background', exact: true }).click();
      const wave = page.getByRole('menuitemradio', { name: 'Sci-fi wave', exact: true });
      assert.equal(await wave.evaluate(el => !!el.closest('.aegis-surface')), true, 'background menu uses shared UI');
      await wave.click();
      await page.waitForFunction(async () => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.find(c => c.id === 'returndeck').props.slides[0].background === 'sci-fi-wave');
      assert.equal(await titleSlide.locator('.deck-ridge').count(), 9);
      await page.waitForFunction(() => document.querySelector('.deck-panel [data-saved]').textContent === 'Saved');
      await shot('deck-wave');
      await page.getByRole('button', { name: 'Present', exact: true }).click();
      assert.equal(await page.locator('.deck-present .deck-ridge').count(), 9);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await open('returndeck', true); assert.equal(await titleSlide.locator('.deck-ridge').count(), 9);
      await page.getByRole('button', { name: 'New slide', exact: true }).click();
      assert.equal(await page.locator('.deck-stage .deck-slide').last().locator('.deck-ridge').count(), 0);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await open('wavedeck', true); assert.equal(await page.locator('.deck-stage .deck-ridge').count(), 9);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      // Restore models an older saved deck, which has no explicit background field.
      await page.evaluate(() => new Promise(resolve => {
        const cards = structuredClone(aegis.canvas.board.cards);
        cards.push({ ...cards.find(c => c.id === 'wavedeck'), id: 'legacydeck', props: { slides: [{ id: 'legacy', layout: 'title', title: 'Saved sleep deck' }], current: 0 } });
        aegisCtx.apply([{ op: 'restore', cards, links: aegis.canvas.board.links }], resolve);
      }));
      await open('legacydeck', true); assert.equal(await page.locator('.deck-stage .deck-ridge').count(), 9);
      await page.getByRole('textbox', { name: 'Slide 1 title', exact: true }).fill('Saved sleep report');
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await open('legacydeck', true); assert.equal(await page.locator('.deck-stage .deck-ridge').count(), 9);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      console.log(`PASS ${engineName}: agent defaults, named background menu, wave persistence, new slides, Present and legacy decks`);

      // Deletion prunes stale selected ids. A board switch must never replay the old bookmark.
      before = await prepare('returnsheet'); await open('returnsheet', true);
      await page.evaluate(() => new Promise(resolve => aegisCtx.apply([{ op: 'delete', ids: ['returnsheet'] }], resolve)));
      await page.locator('.side-editor').waitFor({ state: 'detached' });
      await waitReturn({ ...before, selection: ['returnnote'] }, null);
      await prepare('returndoc'); await open('returndoc'); await page.waitForTimeout(420);
      const other = await page.evaluate(async () => {
        const board = await aegis.host.post('/boards', { name: 'Another board' });
        board.view = { x: 333, y: 222, z: .7 }; aegis.canvas.setBoard(board); return board;
      });
      await page.locator('.side-editor').waitFor({ state: 'detached' }); await page.waitForTimeout(350);
      assert.deepEqual((await snapshot()).view, other.view);
      assert.deepEqual((await snapshot()).selection, []);
      assert.notEqual(other.id, originalBoardId);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engineName}: deleted sources and board changes leave valid selection and camera; no browser errors`);
    } catch (error) {
      await page.screenshot({ path: out(`${engineName}-editor-return-failure.png`) }); throw error;
    } finally { await browser.close(); }
  }
  writeFileSync(out('editor-return-captures.json'), JSON.stringify(evidence, null, 2));
} finally { host.kill(); }
