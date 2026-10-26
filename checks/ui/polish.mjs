import { checkChrome } from './chrome.mjs';
import { checkRefineSettings } from './refine-settings.mjs';
import { SHORTCUTS, shortcutText, shortcutTitle } from '../../app/src/lib/shortcuts.js';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const webPort = 5196 + Number(process.env.AEGIS_PORT_OFFSET || 0), token = 'polish-' + process.pid;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
  cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-polish-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', d => { const match = /"port":(\d+)/.exec(String(d)); if (match) resolve(match[1]); });
  host.on('exit', code => reject(Error('Host exited: ' + code)));
});
const vite = spawn('npx', ['vite', '--port', String(webPort), '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' });
await new Promise((resolve, reject) => { vite.stdout.on('data', d => { if (/Local/.test(String(d))) resolve(); }); vite.on('exit', code => reject(Error('Vite exited: ' + code))); });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 992 }, reducedMotion: 'reduce' });
await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
const errors = [], requests = [], capture = Date.now();
page.on('pageerror', error => errors.push(error.message));
page.on('request', r => { if (r.method() === 'POST' && /\/agents(?:$|\/)/.test(new URL(r.url()).pathname)) requests.push({ path: new URL(r.url()).pathname, data: r.postDataJSON() }); });
const saved = async () => {
  await page.waitForFunction(async () => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).rev === aegis.canvas.board.rev);
  return page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`));
};
const agents = () => page.evaluate(() => aegis.host.get(`/agents?board=${aegis.canvas.board.id}`));
const shot = name => page.screenshot({ path: out(`fix1-${capture}-${name}.png`) });
const assertChat = async (id, text) => {
  await page.waitForFunction(({ id, text }) => [...document.querySelectorAll(`.agent-window[data-agent-id="${id}"] .island-turn.user .turn-text`)].at(-1)?.textContent === text, { id, text });
  const window = page.locator(`.agent-window[data-agent-id="${id}"]`);
  assert.equal(await window.locator('.island-turn.user .turn-text').last().textContent(), text);
  assert.equal((await window.locator('.agent-window-title').textContent()).replace(/^Agent \d+/, 'Agent'), `Agent · ${text.split('\n')[0].slice(0, 42)}`);
  await page.keyboard.press('Meta+k');
  await page.waitForFunction(text => [...document.querySelectorAll('#composer .island-turn.user .turn-text')].at(-1)?.textContent === text, text);
  assert.equal(await page.locator('#composer .island-turn.user .turn-text').last().textContent(), text);
  assert.doesNotMatch(await page.locator('#composer .island-turns').textContent(), /Work on the selected cards|Current board summary/);
};

try {
  await page.goto(`http://127.0.0.1:${webPort}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board && document.getElementById('model').options.length);
  await checkChrome(browser, page.url());
  await checkRefineSettings(browser, page.url());
  // Round 3 discovery: welcome cannot spend the invitation or any of its delay.
  const firstUse = await browser.newPage({ viewport: { width: 1440, height: 992 }, reducedMotion: 'reduce' });
  const freshUrl = `http://127.0.0.1:${webPort}/?port=${port}&token=${token}`;
  await firstUse.goto(freshUrl); await firstUse.waitForFunction(() => window.aegis?.canvas?.board);
  const invitation = firstUse.locator('.agent-first-hint');
  await firstUse.getByRole('dialog', { name: 'Welcome to Aegis', exact: true }).waitFor();
  await firstUse.waitForTimeout(9500);
  assert.equal(await invitation.isVisible(), false, 'welcome keeps the invitation hidden beyond its old expiry');
  assert.equal(await firstUse.evaluate(() => localStorage.getItem('aegis:orb-hint-seen')), null, 'welcome cannot mark the invitation seen');
  await firstUse.screenshot({ path: out(`r3-nav-${capture}-welcome-1440.png`) });
  await firstUse.getByRole('button', { name: 'Skip', exact: true }).click();
  await firstUse.waitForTimeout(800);
  assert.equal(await invitation.isVisible(), false, 'the 1.2 second delay starts after Skip');
  await firstUse.locator('.agent-first-hint.visible').waitFor();
  assert.equal(await firstUse.evaluate(() => localStorage.getItem('aegis:orb-hint-seen')), null, 'showing the invitation is not enough to mark it seen');
  assert.equal(await invitation.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await firstUse.screenshot({ path: out(`r3-nav-${capture}-hint-after-skip-1440.png`) });
  await firstUse.keyboard.press('Meta+Shift+k');
  await firstUse.getByRole('dialog', { name: 'Quick capture', exact: true }).waitFor();
  assert.equal(await invitation.isVisible(), false, 'a later modal interrupts the visible invitation');
  await firstUse.waitForTimeout(8500);
  assert.equal(await firstUse.evaluate(() => localStorage.getItem('aegis:orb-hint-seen')), null, 'time spent in a modal is not an opportunity to read the invitation');
  await firstUse.keyboard.press('Escape'); await firstUse.locator('.agent-first-hint.visible').waitFor();
  await firstUse.waitForFunction(() => document.querySelector('.agent-first-hint').hidden, null, { timeout: 10000 });
  assert.equal(await firstUse.evaluate(() => localStorage.getItem('aegis:orb-hint-seen')), '1');
  await firstUse.reload(); await firstUse.waitForTimeout(1600);
  assert.equal(await invitation.isVisible(), false, 'expired invitation never appears again');
  await firstUse.close();
  const keyboardUse = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await keyboardUse.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  await keyboardUse.goto(freshUrl); await keyboardUse.waitForFunction(() => window.aegis?.canvas?.board);
  await keyboardUse.locator('.agent-first-hint.visible').waitFor();
  const star = await keyboardUse.locator('#askPill .orb-mark').boundingBox(), orbRect = await keyboardUse.locator('#askPill').boundingBox();
  assert.ok(star.y >= orbRect.y && star.y + star.height <= orbRect.y + orbRect.height, 'phone star stays inside the orb beside its hint');
  await keyboardUse.screenshot({ path: out(`r2-hint-${capture}-phone-390.png`) });
  await keyboardUse.keyboard.press('Meta+k');
  await keyboardUse.waitForFunction(() => document.querySelector('.agent-first-hint').hidden);
  assert.equal(await keyboardUse.locator('#prompt').evaluate(el => document.activeElement === el), true);
  await keyboardUse.reload(); await keyboardUse.waitForTimeout(1600);
  assert.equal(await keyboardUse.locator('.agent-first-hint').isVisible(), false);
  await keyboardUse.close();
  const tourUse = await browser.newPage({ viewport: { width: 1586, height: 992 } });
  await tourUse.goto(freshUrl); await tourUse.waitForFunction(() => window.aegis?.canvas?.board);
  await tourUse.getByRole('button', { name: 'Start tour', exact: true }).click();
  for (let step = 1; step < 6; step++) await tourUse.keyboard.press('ArrowRight');
  await tourUse.waitForTimeout(1400);
  assert.equal(await tourUse.locator('.agent-first-hint').isVisible(), false);
  assert.equal(await tourUse.evaluate(() => localStorage.getItem('aegis:orb-hint-seen')), null, 'the tour demonstrating Ask is not use or dismissal');
  await tourUse.getByRole('button', { name: 'Skip', exact: true }).click();
  await tourUse.locator('.agent-first-hint.visible').waitFor();
  await tourUse.waitForTimeout(180);
  await tourUse.screenshot({ path: out(`r3-nav-${capture}-hint-after-tour-1586.png`) });
  await tourUse.keyboard.press('Meta+k');
  assert.equal(await tourUse.evaluate(() => localStorage.getItem('aegis:orb-hint-seen')), '1');
  await tourUse.close();
  console.log('PASS welcome and later modals cannot spend the hint; Skip starts its 1.2s delay; eight visible seconds or Cmd+K marks it seen; reduced motion and phone work; reload remembers');
  const prompt = page.locator('#prompt'), captureDialog = page.getByRole('dialog', { name: 'Quick capture', exact: true });
  const renderedShortcuts = await page.locator('[data-shortcut]').evaluateAll(nodes => nodes.map(el => ({ id: el.dataset.shortcut, format: el.dataset.shortcutFormat || 'display', text: el.textContent })));
  for (const item of renderedShortcuts) assert.equal(item.text, shortcutText(item.id, item.format), item.id);
  assert.ok(renderedShortcuts.length > 15);
  assert.equal(SHORTCUTS.justBoard.mac, '⌘\\');
  const hints = await page.locator('.editing-hints').textContent();
  assert.match(hints, /⌘K Ask/); assert.match(hints, /⇧⌘K Quick capture/); assert.doesNotMatch(hints, /⌘K Capture/);
  assert.equal(await page.locator('#quickCapture').getAttribute('title'), shortcutTitle('quickCapture'));
  assert.match(await page.locator('[data-panel="keys"] .keys').textContent(), /⌘K \/ Ctrl\+KAsk/);
  assert.match(await page.locator('[data-panel="keys"] .keys').textContent(), /⇧⌘K \/ Shift\+Ctrl\+KQuick capture/);
  for (const mod of ['Meta', 'Control']) {
    await page.keyboard.press(`${mod}+k`);
    assert.equal(await prompt.evaluate(el => document.activeElement === el), true);
    assert.equal(await captureDialog.isVisible(), false);
    await prompt.fill('A draft kept while capturing');
    await page.keyboard.press(`${mod}+Shift+k`);
    assert.equal(await captureDialog.isVisible(), true);
    assert.equal(await page.getByLabel('Capture idea', { exact: true }).evaluate(el => document.activeElement === el), true);
    assert.equal(await prompt.inputValue(), 'A draft kept while capturing');
    await page.getByLabel('Capture idea', { exact: true }).fill(`${mod} captured idea`);
    await page.getByLabel('Capture idea', { exact: true }).press('Enter');
    assert.equal((await saved()).tray[0].text, `${mod} captured idea`);
    assert.equal(await prompt.inputValue(), 'A draft kept while capturing');
    await prompt.fill(''); await prompt.press('Escape');
  }
  assert.equal((await saved()).tray.length, 2);
  assert.equal(requests.length, 0);
  await page.mouse.move(1400, 20); await page.locator('#quickCapture').click(); assert.equal(await captureDialog.isVisible(), true); await page.keyboard.press('Escape');
  console.log('PASS Cmd/Ctrl+K opens Ask, Shift+Cmd/Ctrl+K captures once, drafts survive, hints/panel/Idea labels match');

  await page.evaluate(() => { window.notesEvents = 0; document.getElementById('composer').addEventListener('add-as-notes', () => window.notesEvents++); });
  await page.keyboard.press('Meta+k'); await prompt.fill('Grid first idea\nGrid second idea'); await prompt.press('Escape');
  await page.mouse.move(24, 480); await page.locator('#toolsFold').click();
  const gridNotes = page.locator('#toolsPopover').getByRole('button', { name: 'Add as notes', exact: true });
  assert.equal(await gridNotes.isVisible(), true); assert.ok((await gridNotes.boundingBox()).height >= 44);
  await shot('more-tools-1440');
  await page.setViewportSize({ width: 1586, height: 992 });
  await page.waitForFunction(() => document.getElementById('toolsPopover').hidden);
  if (!(await gridNotes.isVisible())) { await page.mouse.move(24, 480); await page.locator('#toolsFold').click(); }
  await shot('more-tools-1586');
  await gridNotes.press('Enter');
  let board = await saved();
  assert.deepEqual(board.cards.map(c => c.text).sort(), ['Grid first idea', 'Grid second idea']);
  assert.equal(await prompt.inputValue(), ''); assert.equal(await page.locator('#toolsPopover').isVisible(), false);
  await page.keyboard.press('Meta+k'); await prompt.fill('Menu idea'); await page.locator('#orbMenuButton').click();
  const menuNotes = page.locator('#orbMenu').getByRole('menuitem', { name: /^Add as notes/ });
  assert.ok((await menuNotes.boundingBox()).height >= 44); await shot('notes-options-1586'); await menuNotes.press('Enter');
  board = await saved(); assert.ok(board.cards.some(c => c.text === 'Menu idea'));
  assert.equal(await page.evaluate(() => window.notesEvents), 2); assert.equal(requests.length, 0);
  await page.keyboard.press('Meta+k'); await prompt.fill('Keyboard idea'); await prompt.press('Meta+Enter');
  board = await saved(); assert.ok(board.cards.some(c => c.text === 'Keyboard idea'));
  console.log('PASS More tools and orb options dispatch add-as-notes, save typed notes, clear the draft and start zero agents; Cmd+Return still works');

  // Round 3 shortcuts: panels do not change meaning when a window is selected.
  const order = () => page.evaluate(() => aegis.canvas.board.cards.map(c => c.id));
  for (const mod of ['Meta', 'Control']) {
    for (const selected of [false, true]) {
      await page.evaluate(selected => { aegis.canvas.select(selected ? [aegis.canvas.board.cards[1].id] : []); document.getElementById('stage').focus(); }, selected);
      const before = await order();
      for (const [key, side] of [[']', 'Right'], ['[', '']]) {
        if (await page.locator(`#side${side}`).evaluate(el => el.classList.contains('open'))) await page.keyboard.press(`${mod}+${key}`);
        await page.keyboard.press(`${mod}+${key}`);
        assert.equal(await page.locator(`#side${side}`).evaluate(el => el.classList.contains('open')), true, `${mod}+${key}, selected=${selected}`);
        assert.deepEqual(await order(), before, 'panel shortcut never restacks');
        assert.equal(await page.evaluate(() => aegis.canvas.selection().length), Number(selected));
        await page.keyboard.press(`${mod}+${key}`);
      }
    }
    const before = await order(), id = before[1];
    await page.evaluate(id => { aegis.canvas.select([id]); document.getElementById('stage').focus(); }, id);
    await page.keyboard.press(`${mod}+Alt+]`); await saved();
    const forward = [...before]; [forward[1], forward[2]] = [forward[2], forward[1]];
    assert.deepEqual(await order(), forward, 'Option/Alt+right bracket moves one step forward');
    await page.keyboard.press(`${mod}+Alt+[`); await saved(); assert.deepEqual(await order(), before);
    await page.keyboard.press(`${mod}+Alt+Shift+]`); await saved(); assert.equal((await order()).at(-1), id);
    await page.keyboard.press(`${mod}+Alt+Shift+[`); await saved(); assert.equal((await order())[0], id);
    assert.equal(await page.locator('#sideRight').evaluate(el => el.classList.contains('open')), false, 'restacking leaves agent activity closed');
  }
  await page.evaluate(() => document.getElementById('stage').dispatchEvent(new CustomEvent('layercontext', { detail: { x: 700, y: 300, ids: aegis.canvas.selection() } })));
  for (const [label, key] of [['Bring forward', 'stackForward'], ['Send backward', 'stackBack'], ['Bring to front', 'stackToFront'], ['Send to back', 'stackToBack']]) {
    assert.equal(await page.getByRole('menuitem', { name: label, exact: true }).locator('kbd').textContent(), shortcutText(key));
  }
  await shot('r3-nav-restack-menu-1586'); await page.keyboard.press('Escape');
  console.log('PASS Cmd/Ctrl+brackets always open the same panels with or without selection; Option/Alt+brackets restack one step, Shift sends front/back; menus show shared keys');

  const selectedIds = board.cards.slice(0, 2).map(c => c.id);
  await page.evaluate(ids => aegis.canvas.select(ids), selectedIds);
  await page.keyboard.press('Meta+k'); const brief = 'Tidy just these ideas\nKeep all my words'; await prompt.fill(brief); await prompt.press('Enter');
  await page.waitForFunction(async () => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).some(a => !a.running && a.turns.length === 2));
  const [{ id }] = await agents();
  assert.equal(requests[0].data.brief, brief); assert.deepEqual(requests[0].data.selectedIds, selectedIds);
  await assertChat(id, brief); await shot('selected-conversation-1586');
  const follow = 'Keep these headings'; await prompt.fill(follow); await prompt.press('Enter');
  await page.waitForFunction(async id => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).find(a => a.id === id)?.turns.length === 4, id);
  assert.equal(requests[1].path, `/agents/${id}/message`); assert.equal(requests[1].data.content, follow); assert.deepEqual(requests[1].data.selectedIds, selectedIds);
  await assertChat(id, follow); await prompt.press('Escape');
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  await assertChat(id, follow); await prompt.press('Escape');
  const legacy = 'Saved request';
  const [{ id: oldId }] = await page.evaluate(({ brief, selectedIds }) => aegis.host.post('/agents', {
    boardId: aegis.canvas.board.id, brief: `${brief}\n\n(Work on the selected cards: ${selectedIds.join(', ')}.)`, model: { provider: 'fake', modelId: 'fake' },
  }), { brief: legacy, selectedIds });
  await page.waitForFunction(async id => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).find(a => a.id === id)?.turns.length === 2, oldId);
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  await assertChat(oldId, legacy); await shot('legacy-conversation-1440'); await prompt.press('Escape');
  console.log('PASS selection IDs travel separately on spawn/follow-up; windows, titles and island show only typed text; reload and legacy saved suffixes are clean');

  await page.setViewportSize({ width: 390, height: 844 });
  const hub = page.locator('#mobileHub');
  await hub.getByRole('button', { name: 'Add', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: shortcutTitle('quickCapture'), exact: true }).isVisible(), true);
  await shot('phone-add-390'); await page.getByLabel('Close sheet', { exact: true }).click();
  await hub.getByRole('button', { name: 'Agents', exact: true }).click();
  await prompt.fill('Touch menu idea'); await page.locator('#orbMenuButton').click(); await shot('phone-notes-options-390');
  const beforePhoneNotes = requests.length;
  await page.locator('#orbMenu').getByRole('menuitem', { name: /^Add as notes/ }).click();
  assert.ok((await saved()).cards.some(c => c.text === 'Touch menu idea')); assert.equal(requests.length, beforePhoneNotes);
  await page.getByLabel('Close sheet', { exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 992 });
  await page.mouse.move(1400, 20); await page.locator('#settingsBtn').click(); await page.getByRole('tab', { name: 'About', exact: true }).click();
  await page.getByRole('button', { name: 'Replay welcome and tour', exact: true }).click();
  await page.getByRole('button', { name: 'Start tour', exact: true }).click(); await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('.tour-card p').textContent(), /Shift\+Cmd\+K/); assert.match(await page.locator('.tour-card p').textContent(), /Shift\+Ctrl\+K/);
  await page.keyboard.press('Meta+Shift+k'); assert.equal(await captureDialog.isVisible(), false, 'capture cannot steal the onboarding modal');
  await page.keyboard.press('Control+k'); assert.equal(await prompt.evaluate(el => document.activeElement === el), false, 'Ask cannot steal the onboarding modal');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const tourIds = new Set();
  for (let step = 1; step <= 7; step++) {
    const shortcuts = await page.locator('.tour-card [data-shortcut]').evaluateAll(nodes => nodes.map(el => ({ id: el.dataset.shortcut, text: el.textContent, format: el.dataset.shortcutFormat })));
    for (const item of shortcuts) { assert.equal(item.text, shortcutText(item.id, item.format)); tourIds.add(item.id); }
    if (step < 7) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  assert.deepEqual([...tourIds].sort(), ['ask', 'leftSidebar', 'quickCapture', 'rightSidebar', 'stackBack', 'stackForward']);
  console.log('PASS every tour shortcut and all rendered hints/list shortcuts equal the shared shortcut map');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  // Round 2 history: a real request spans two board batches and all four change types.
  const original = await saved();
  const movedId = original.cards[0].id, removedId = original.cards[1].id;
  const commands = [
    ['board_apply', { commands: [{ op: 'move', id: movedId, x: 400, y: 100 }, { op: 'create', type: 'note', newId: 'historynew', text: 'Next task', x: 800, y: 400 }] }],
    ['board_apply', { commands: [{ op: 'update', id: movedId, set: { text: 'Review plan' } }, { op: 'delete', id: removedId }, { op: 'board_set', set: { bg: '#111111' } }] }],
  ];
  const [{ id: historyAgent }] = await page.evaluate(commands => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS ' + JSON.stringify(commands) }), commands);
  await page.waitForFunction(async id => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).find(a => a.id === id)?.history[0]?.canUndo, historyAgent);
  await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.text === 'Review plan'));
  await page.locator('#stage').focus(); await page.keyboard.press('a');
  const requestRow = page.locator(`#agentList [data-id="${historyAgent}"]`);
  for (const name of ['Review plan', 'Next task', original.cards[1].text.split('\n')[0]]) assert.ok((await requestRow.textContent()).includes(name));
  for (const word of ['Created', 'Moved', 'Edited', 'Deleted']) assert.ok((await requestRow.textContent()).includes(word));
  await shot('r2-history-all-changes-1440');
  await requestRow.getByRole('button', { name: 'Show', exact: true }).click();
  await page.locator('#closeAgents').click();
  const historyWindow = page.locator(`.agent-window[data-agent-id="${historyAgent}"]`);
  assert.equal(await historyWindow.locator('.agent-window-toggle').getAttribute('aria-expanded'), 'true');
  await page.screenshot({ path: out(`r2-history-${capture}-expanded-1440.png`) });
  await historyWindow.getByRole('button', { name: /^Undo request:/ }).click();
  await page.waitForFunction(({ cards, bg }) => JSON.stringify(aegis.canvas.board.cards) === JSON.stringify(cards) && aegis.canvas.board.bg === bg, { cards: original.cards, bg: original.bg });
  const restored = await saved(); assert.deepEqual(restored.cards, original.cards); assert.deepEqual(restored.links, original.links); assert.equal(restored.bg, original.bg);
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.waitForFunction(id => document.querySelector(`.agent-window[data-agent-id="${id}"] .agent-history`)?.textContent.includes('Undone'), historyAgent);
  console.log('PASS durable timelines name created, moved, edited and deleted windows across batches; window Undo restores cards, links and background; Undone survives reload');
  assert.deepEqual(errors, []);
  console.log('PASS phone Add label, touch Add as notes and onboarding shortcuts match behaviour; open dialogs retain focus; no page errors');
} catch (error) {
  console.error(error); console.error('page errors', errors); process.exitCode = 1; await shot('failure');
} finally { await browser.close(); host.kill(); vite.kill(); }
