// Exercise the first minute and retrieval against the UI shipped in the native app.
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = 'first-minute-' + process.pid, data = mkdtempSync(join(tmpdir(), 'aegis-first-minute-'));
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
const port = await new Promise((resolve, reject) => {
  let output = ''; host.stdout.on('data', d => { output += d; const m = /"port":(\d+)/.exec(output); if (m) resolve(m[1]); });
  host.stderr.on('data', d => process.stderr.write(d)); host.on('exit', code => reject(Error('Host exited ' + code)));
});
const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const engines = [['chromium', chromium], ['webkit', playwright.webkit ?? playwright.default.webkit]];
const url = `http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`;
const checks = [], metrics = [];
const check = label => { checks.push(label); console.log('PASS', label); };
let browser, page;
const api = async (path, body) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.ok(r.ok); return r.json();
};
try {
  for (const [engineName, engine] of engines) {
    browser = await engine.launch();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1586, height: 992 }]) {
      const board = await api('/boards', { name: `First minute ${engineName} ${viewport.width}` });
      page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      const errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(id => { if (window.top !== window) return; localStorage.setItem('aegis:board', id); localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); }, board.id);
      await page.route('**/agents', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        const payload = route.request().postDataJSON(); requests.push(payload);
        // The original composer request is recorded, then scripted work replaces model inference.
        await route.continue({ postData: JSON.stringify({ ...payload, brief: 'FAKE ' + JSON.stringify(demoBatch) }) });
      });
      await page.goto(url); await page.waitForFunction(() => window.aegis?.canvas?.board);
      await page.locator('#empty').waitFor({ state: 'visible' });
      assert.deepEqual(await page.locator('.empty-actions button').allTextContents(), ['Plan my week', 'Explore a CSV', 'Start a document']);
      await page.screenshot({ path: out(`first-minute-empty-${engineName}-${viewport.width}.png`) });
      const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Explore a CSV', exact: true }).click();
      await (await chooser).setFiles({ name: 'fictional-sample.csv', mimeType: 'text/csv', buffer: Buffer.from('Day,Focus hours\nMonday,3\nTuesday,4\nWednesday,2\n') });
      await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'dataset'));
      assert.equal(await page.locator('#empty').isVisible(), false);
      assert.equal((await api(`/boards/${board.id}`)).cards[0].props.rows, 3);
      check(`${engineName} ${viewport.width}: CSV action imports through the picker and removes the empty state`);
      await page.evaluate(() => aegis.apply([{ op: 'delete', ids: aegis.canvas.board.cards.map(c => c.id) }]));
      await page.locator('#empty').waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Start a document', exact: true }).click();
      await page.locator('.docs-panel .tiptap').waitFor();
      await page.locator('.docs-panel .tiptap').fill('My first document.');
      await page.waitForFunction(() => document.querySelector('.docs-panel [data-saved]')?.textContent === 'Saved');
      await page.screenshot({ path: out(`first-minute-document-${engineName}-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Close document', exact: true }).click();
      await page.locator('.docs-panel').waitFor({ state: 'detached' });
      assert.ok((await api(`/boards/${board.id}`)).cards.some(c => c.props?.body?.includes('My first document.')));
      check(`${engineName} ${viewport.width}: document action creates, opens and saves a real document`);
      await page.evaluate(() => aegis.apply([{ op: 'delete', ids: aegis.canvas.board.cards.map(c => c.id) }]));
      await page.getByRole('button', { name: 'Plan my week', exact: true }).click();
      await page.waitForFunction(() => aegis.canvas.board.cards.length === 9);
      assert.match(requests[0].brief, /Help me plan my week/); assert.equal(requests[0].boardId, board.id);
      await page.waitForFunction(async () => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).every(a => !a.running));
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.querySelectorAll('.agent-window .agent-close').forEach(button => button.click()));
      await page.evaluate(() => { aegis.canvas.select([]); aegis.canvas.fit(); });
      await page.waitForFunction(() => document.querySelectorAll('.card').length === 9);
      await page.screenshot({ path: out(`first-minute-demo-${engineName}-${viewport.width}.png`) });
      check(`${engineName} ${viewport.width}: weekly intent follows the composer submit path and fake agent delivers demo-batch`);
      // A bookmarked working view survives a trip to 5%, cluster focus and a single return.
      const working = await page.evaluate(() => { const view = { x: 260, y: 160, z: .8 }; aegis.canvas.setView(view); return view; });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => aegis.canvas.setView({ x: innerWidth / 2 - 40, y: innerHeight / 2 - 30, z: .05 }));
      await page.locator('.overview-cluster:not([hidden])').first().waitFor();
      assert.match(await page.locator('.overview-cluster').first().textContent(), /9 windows/);
      assert.ok(await page.locator('.overview-cluster strong').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 14));
      await page.mouse.move(viewport.width / 2, 700);
      await page.screenshot({ path: out(`first-minute-overview-${engineName}-${viewport.width}.png`) });
      await page.locator('.overview-cluster').first().click();
      await page.waitForFunction(() => aegis.canvas.view.z >= .2);
      await page.getByRole('button', { name: 'Back to where you were', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => ({ ...aegis.canvas.view })), working);
      check(`${engineName} ${viewport.width}: idle 5% overview has readable names, counts, cluster framing and an exact return`);
      await page.locator('#stage').focus(); await page.keyboard.press('?');
      await page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true }).waitFor();
      assert.ok(await page.locator('.shortcuts-sheet dt').count() > 35);
      await page.screenshot({ path: out(`first-minute-shortcuts-${engineName}-${viewport.width}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#stage').evaluate(el => el === document.activeElement), true);
      await page.mouse.move(viewport.width - 30, 20); await page.locator('#settingsBtn').click(); await page.getByRole('tab', { name: 'About', exact: true }).click();
      await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
      await page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true }).waitFor(); await page.keyboard.press('Escape');
      check(`${engineName} ${viewport.width}: full shortcut sheet opens from ? and Settings, Escape restores focus`);
      // Replay runs the real task. The scripted provider supplies the result windows.
      await page.locator('#settingsBtn').click(); await page.getByRole('tab', { name: 'About', exact: true }).click();
      await page.getByRole('button', { name: 'Replay welcome and tour', exact: true }).click();
      await page.getByLabel('Your first thought').fill('Make space for reading this week.');
      await page.screenshot({ path: out(`first-minute-onboard-1-${engineName}-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Add thought', exact: true }).click();
      assert.match(await page.locator('.tour-progress').textContent(), /2 of 3/);
      assert.ok(await page.evaluate(() => aegis.canvas.board.cards.some(c => c.type === 'note' && c.text === 'Make space for reading this week.')));
      await page.screenshot({ path: out(`first-minute-onboard-2-${engineName}-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Ask for a plan', exact: true }).click();
      assert.match(await page.locator('.tour-progress').textContent(), /3 of 3/);
      await page.getByRole('button', { name: 'See my plan', exact: true }).waitFor();
      assert.match(requests.at(-1).brief, /Make space for reading this week/);
      await page.screenshot({ path: out(`first-minute-onboard-3-${engineName}-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'See my plan', exact: true }).click();
      assert.equal(await page.locator('.onboarding').isVisible(), false);
      check(`${engineName} ${viewport.width}: three-step task saves a thought, asks through the composer and frames the real result`);
      await page.evaluate(async () => {
        const board = await aegis.host.post('/boards', { name: 'Named clusters' }); aegis.canvas.setBoard(board);
        aegis.apply([
          { op: 'create', type: 'title', newId: 'discover', text: 'Discover', x: 0, y: 0 },
          { op: 'create', type: 'doc', newId: 'insights', text: 'Interview notes', x: 0, y: 100 },
          { op: 'create', type: 'title', newId: 'decide', text: 'Decide', x: 8000, y: 0 },
          { op: 'create', type: 'note', newId: 'decision', text: 'What comes next', x: 8000, y: 100 },
          { op: 'create', type: 'coll', newId: 'privategroup', text: 'Private', x: 2000, y: 0, props: { hidden: true, kids: ['privatework'] } },
          { op: 'create', type: 'note', newId: 'privatework', text: 'Hidden work', x: 2000, y: 100, parent: 'privategroup' },
        ]);
        aegis.canvas.setView({ x: 420, y: 320, z: .05 });
      });
      await page.waitForFunction(() => document.querySelectorAll('.overview-cluster:not([hidden])').length === 2);
      const cluster = page.getByRole('button', { name: 'Frame Discover, 1 window', exact: true });
      assert.equal(await page.getByRole('button', { name: 'Frame Decide, 1 window', exact: true }).count(), 1);
      assert.equal(await page.locator('.overview-cluster').filter({ hasText: 'Private' }).count(), 0);
      await page.screenshot({ path: out(`first-minute-clusters-${engineName}-${viewport.width}.png`) });
      await cluster.focus(); await page.keyboard.press('Enter');
      assert.ok(await page.evaluate(() => aegis.canvas.view.z >= .2));
      check(`${engineName} ${viewport.width}: named clusters count their own windows, hide private descendants and frame with Enter`);

      assert.deepEqual(errors, []); await page.close();
    }
    await browser.close(); browser = null;
  }
  // Two hundred persisted boards, without generating two hundred agent runs.
  const original = await api('/boards');
  const seed = await api(`/boards/${original.find(b => b.cards === 19).id}`);
  for (let i = 0; i < 200; i++) writeFileSync(join(data, 'boards', `fixture${i}.json`), JSON.stringify({ ...seed, id: `fixture${i}`, name: ['Weekly plans', 'Field notes', 'Studio research', 'Product decisions'][i % 4] + ` ${String(i + 1).padStart(3, '0')}`, cards: seed.cards.slice(0, 9).map((c, j) => ({ ...c, color: j === 0 ? ['blue', 'purple', 'green', 'orange'][i % 4] : c.color })), editedAt: Date.now() - i * 86400000 }));
  browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1586, height: 992 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => { if (window.top !== window) return; localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); });
  await page.goto(url); await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.locator('#boardName').click();
  let reads = 0; page.on('request', r => { if (r.method() === 'GET' && /\/boards\/[^/]+$/.test(new URL(r.url()).pathname)) reads++; });
  const start = Date.now(); await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('.home-preview svg').first().waitFor();
  const elapsed = Date.now() - start;
  assert.equal(await page.getByRole('searchbox', { name: 'Search library' }).evaluate(el => el === document.activeElement), true);
  assert.ok(await page.locator('.home-tile[data-open]').count() >= 200);
  assert.ok(reads < 40, `opening fetched ${reads} full boards`); assert.ok(elapsed < 3500, `opening took ${elapsed} ms`);
  assert.ok(await page.locator('.home-preview svg text').count() > 0);
  await page.screenshot({ path: out('first-minute-library-1586.png') });
  await page.getByRole('searchbox', { name: 'Search library' }).fill('Studio research 003');
  assert.equal(await page.locator('.home-tile[data-open]').count(), 1);
  assert.match(await page.locator('.home-subtitle').textContent(), /Make room for deep work/);
  assert.match(await page.locator('.home-tile time').textContent(), /Edited/);
  await page.getByRole('searchbox', { name: 'Search library' }).fill('Make room for deep work');
  assert.ok(await page.locator('.home-tile[data-open]').count() >= 200, 'content title is searchable before previews load');
  await page.getByRole('searchbox', { name: 'Search library' }).fill('no-such-board');
  assert.equal(await page.locator('.home-tile').count(), 0); assert.match(await page.locator('.home-empty').textContent(), /No matches/);
  await page.getByRole('searchbox', { name: 'Search library' }).fill('');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  assert.deepEqual(await page.getByRole('menu', { name: 'New in library', exact: true }).getByRole('menuitem').allTextContents(), ['Board', 'Folder', 'Project']);
  await page.screenshot({ path: out('first-minute-library-new-1586.png') });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.library-home').evaluate(el => el.open), true, 'Escape closes New before closing Library');
  metrics.push({ boards: 200, openMs: elapsed, fullBoardReads: reads });
  check('Library: 200 boards, immediate search focus, lazy previews, content search, edited time, no matches and one New menu');
  await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: out('first-minute-library-1440.png') });
  const newItem = async (kind, name) => {
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('menu', { name: 'New in library', exact: true }).getByRole('menuitem', { name: kind, exact: true }).click();
    if (kind !== 'Board') {
      const field = page.locator('.home-tile strong[contenteditable="plaintext-only"]');
      await field.fill(name); await field.press('Enter');
      await page.waitForFunction(() => !document.querySelector('.home-tile strong[contenteditable="plaintext-only"]'));
    }
  };
  await newItem('Project', 'A new studio');
  const project = (await api('/library')).nodes.find(n => n.name === 'A new studio'); assert.ok(project);
  await page.locator(`.home-tile[data-into="${project.id}"]`).click();
  await newItem('Folder', 'Next steps');
  const folder = (await api('/library')).nodes.find(n => n.name === 'Next steps'); assert.equal(folder.parent, project.id);
  await page.locator(`.home-tile[data-into="${folder.id}"]`).click();
  await newItem('Board');
  await page.waitForFunction(() => !document.querySelector('.library-home').open && aegis.canvas.board.name === 'Untitled');
  const newBoardId = await page.evaluate(() => aegis.canvas.board.id);
  assert.equal((await api('/library')).boards.find(b => b.id === newBoardId).parent, folder.id);
  check('Library New creates and names projects and folders, and opens a new board in its folder');
  await page.close(); await browser.close(); browser = null;
  writeFileSync(out('first-minute-results.json'), JSON.stringify({ checks, metrics, data }, null, 2));
  console.log('ALL', checks.length, 'CHECKS PASSED', JSON.stringify(metrics));
} catch (error) {
  console.error(error); if (page && !page.isClosed()) await page.screenshot({ path: out('first-minute-fail.png') }); process.exitCode = 1;
} finally { await browser?.close(); host.kill(); }
