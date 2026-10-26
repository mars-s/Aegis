// The shipped CSS must move real pixels in both engines, not just declare a loop.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { out } from './out.mjs';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }
for (const name of ['chromium', 'webkit']) {
  const token = `orb-capture-${name}-${process.pid}`;
  const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
    cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync('/tmp/aegis-orb-capture-'), AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_TPS: '300', AEGIS_FAKE_DELAY_MS: '1200' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); });
    host.once('exit', code => reject(Error(`Host exited ${code}`)));
  });
  const browser = await playwright[name].launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:model', 'fake|fake'); });
    await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
    await page.waitForFunction(() => window.aegis?.canvas?.board);
    await page.mouse.move(1100, 300); await page.waitForTimeout(350);
    await page.locator('#toast').waitFor({ state: 'hidden' });
    const layer = page.locator('#askPill .orb-colours');
    const sample = () => layer.evaluate(el => ({ transform: getComputedStyle(el).transform, background: getComputedStyle(el).backgroundImage, duration: parseFloat(getComputedStyle(el).animationDuration), animations: el.getAnimations().filter(a => a.playState === 'running').length }));
    const idle = await sample(); await page.waitForTimeout(380); const later = await sample();
    check(idle.animations > 0 && idle.transform !== later.transform, `${name}: production orb moves at idle`);
    check(idle.background.includes('conic-gradient'), `${name}: the rotating layer has visible highlights`);
    await page.screenshot({ path: out(`orb-idle-${name}.png`), animations: 'allow' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: out(`orb-idle-mid-${name}.png`), animations: 'allow' });

    await page.keyboard.press('Meta+Shift+k');
    const dialog = page.getByRole('dialog', { name: 'Quick capture', exact: true }), input = page.getByLabel('Capture idea', { exact: true });
    check(await input.evaluate(el => document.activeElement === el), `${name}: keyboard capture focuses immediately`);
    check(await dialog.evaluate(el => getComputedStyle(el).animationName === 'none'), `${name}: keyboard entry has no entrance animation`);
    check(await page.locator('.capture-add').isDisabled(), `${name}: empty capture cannot submit`);
    await input.fill('A place for the next idea'); await input.press('Shift+Enter'); await input.press('a');
    check((await input.inputValue()).includes('\n'), `${name}: Shift Return inserts a new line`);
    await input.fill('A place for the next idea\nhttps://example.com/research\n- Read the paper\n- [x] Save the source\nA second thought');
    check((await page.locator('#capturePreview').textContent()).includes('2 notes, 1 link card, 1 checklist'), `${name}: mixed parsing preview`);
    await page.screenshot({ path: out(`quick-capture-${name}.png`), animations: 'allow' });
    await input.press('Enter');
    check(!await dialog.isVisible(), `${name}: Return captures and closes`);
    await page.waitForFunction(() => document.querySelectorAll('.tray-item.capture-highlight').length === 4);
    check(await page.evaluate(() => document.activeElement.id === 'stage'), `${name}: capture keeps focus on the canvas`);
    check(await page.locator('.tray-item.capture-highlight').first().isVisible(), `${name}: saved items are revealed and highlighted`);
    await page.screenshot({ path: out(`quick-capture-tray-${name}.png`), animations: 'allow' });
    await page.getByRole('button', { name: 'Put on board', exact: true }).click();
    const cards = await page.evaluate(() => aegis.canvas.board.cards);
    check(cards.length === 4 && cards.filter(c => c.type === 'note').length === 2 && cards.find(c => c.type === 'link').url === 'https://example.com/research', `${name}: notes and URL become real canvas cards`);
    check(cards.find(c => c.type === 'todo').items.length === 2 && cards.find(c => c.type === 'todo').items[1].done, `${name}: checklist items retain their checked state`);
    await page.waitForFunction(() => document.querySelectorAll('.card.glow').length === 4);
    check(await page.locator('.capture-confirmation').isVisible(), `${name}: captured confirmation and canvas glow`);
    check(await page.evaluate(() => aegis.canvas.view.z >= .6), `${name}: capture frames readable cards after removing the backdrop`);
    await page.screenshot({ path: out(`quick-capture-confirmed-${name}.png`), animations: 'allow' });
    await page.waitForFunction(async () => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.length === 4);
    await page.keyboard.press('Meta+Shift+k'); await input.fill('Undo this capture'); await input.press('Enter');
    await page.locator('.capture-confirmation [data-undo]').click();
    check(await page.evaluate(() => !aegis.canvas.board.tray.some(c => c.text === 'Undo this capture') && aegis.canvas.board.cards.length === 4), `${name}: capture Undo preserves unrelated work`);

    await page.keyboard.press('Meta+k'); await page.getByLabel('Message', { exact: true }).fill('Keep this draft');
    await page.keyboard.press('Meta+Shift+k'); await input.fill('Dismiss this'); await page.keyboard.press('Escape');
    check(await page.getByLabel('Message', { exact: true }).inputValue() === 'Keep this draft', `${name}: Escape preserves the composer draft`);
    await page.getByLabel('Message', { exact: true }).fill(''); await page.keyboard.press('Escape');
    await page.mouse.move(1400, 20); await page.locator('#quickCapture').click();
    check(await dialog.getAttribute('data-entry') === 'pointer', `${name}: Idea button uses pointer entry`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+Shift+k');
    await input.fill('FAKE ' + JSON.stringify([{ op: 'create', type: 'note', text: 'Sent from capture', x: 420, y: 180 }]));
    await input.press('Meta+Enter');
    await page.locator('#askPill.working').waitFor();
    const thinking = await sample();
    check(thinking.duration < idle.duration && thinking.animations > 0, `${name}: running agent has a faster real loop`);
    await page.screenshot({ path: out(`orb-thinking-${name}.png`), animations: 'allow' });
    await page.keyboard.press('Meta+k');
    check(await page.locator('.island-stop').isVisible(), `${name}: running composer has a Stop control`);
    await page.screenshot({ path: out(`orb-thinking-composer-${name}.png`), animations: 'allow' });
    await page.keyboard.press('Escape');
    await page.locator('#agentIsland[data-state="done"]').waitFor({ timeout: 20000 });
    check(await page.locator('#agentIsland .orb-mark.resolved').count() > 0, `${name}: completion resolves the mark`);
    check(await page.evaluate(() => aegis.canvas.board.cards.some(c => c.text === 'Sent from capture')), `${name}: Cmd Return sends capture through the agent`);
    check((await page.locator('#orbStatus').textContent()).includes('Created 1 window'), `${name}: completion names the result`);
    check(await page.locator('.island-result-undo').isVisible(), `${name}: completion offers Undo`);
    await page.locator('#askPill').click();
    check(await page.locator('.card.glow').count() > 0, `${name}: clicking the result highlights its work`);
    await page.screenshot({ path: out(`orb-result-${name}.png`), animations: 'allow' });
    await page.locator('.island-result-undo').click();
    await page.waitForFunction(() => !aegis.canvas.board.cards.some(c => c.text === 'Sent from capture'));
    check(await page.evaluate(() => aegis.canvas.board.cards.length === 4), `${name}: result Undo reverses only that request`);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const el = document.querySelector('.agent-window'), p = JSON.parse(localStorage.getItem(`aegis:agent-window:${el.dataset.agentId}`));
      aegis.canvas.setView({ x: 500 - p.x * .5, y: 180 - p.y * .5, z: .5 });
    });
    const badge = page.locator('.agent-window.agent-badge'); await badge.waitFor();
    check(Math.round((await badge.boundingBox()).width) === 44, `${name}: below 65% an agent is a usable badge`);
    await badge.locator('.agent-window-toggle').click();
    const window = page.locator('.agent-window:not(.collapsed)');
    check(Math.round((await window.boundingBox()).width) === 340, `${name}: conversation opens at 340 screen pixels at 50% zoom`);
    check(await window.locator('.agent-follow input').evaluate(el => getComputedStyle(el).fontSize === '14px'), `${name}: follow-up text stays 14px`);
    await page.screenshot({ path: out(`agent-unscaled-${name}.png`), animations: 'allow' });
    await window.locator('.agent-follow input').press('Escape');
    await page.evaluate(async () => {
      const a = (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`))[0];
      await aegis.host.post(`/agents/${a.id}/message`, { content: 'FAKEREPLY ' + 'Keep the source beside the working result.\n\n'.repeat(60) });
    });
    await page.waitForFunction(async () => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`))[0].running);
    await page.waitForFunction(async () => !(await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`))[0].running, null, { timeout: 20000 });
    await page.waitForFunction(() => !document.getElementById('askPill').classList.contains('working'));
    await page.evaluate(() => aegis.canvas.select(aegis.canvas.board.cards.map(c => c.id)));
    await page.keyboard.press('Meta+k');
    check((await page.locator('#composer .island-turns').textContent()).includes('FAKE'), `${name}: sent capture is in the conversation`);
    const turns = page.locator('#composer .island-turns');
    check((await turns.boundingBox()).height <= 280, `${name}: conversation history is capped at 280px`);
    const clearance = await page.evaluate(() => {
      const top = document.getElementById('agentIsland').getBoundingClientRect().top;
      return [...document.querySelectorAll('.card')].every(el => el.getBoundingClientRect().bottom <= top - 23);
    });
    check(clearance, `${name}: selected work has a 24px gap above the island`);
    await turns.evaluate(el => { el.scrollTop = 32; });
    await page.keyboard.press('Escape'); await page.keyboard.press('Meta+k');
    check(await turns.evaluate(el => Math.abs(el.scrollTop - 32) < 2), `${name}: reopening preserves the history scroll position`);
    await page.screenshot({ path: out(`island-clearance-${name}.png`), animations: 'allow' });
    await page.keyboard.press('Escape');

    for (const mode of ['os', 'app']) {
      if (mode === 'os') await page.emulateMedia({ reducedMotion: 'reduce' });
      else { await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.evaluate(() => document.body.classList.add('motion-off')); }
      check(await layer.evaluate(el => getComputedStyle(el).animationName === 'none'), `${name}: ${mode} motion preference freezes the orb`);
      await page.locator('#quickCapture').dispatchEvent('click', { detail: 1 });
      check(await dialog.evaluate(el => getComputedStyle(el).animationName === 'none'), `${name}: ${mode} motion preference keeps capture instant`);
      await page.keyboard.press('Escape');
    }
    await page.evaluate(() => document.body.classList.remove('motion-off'));
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    check(await layer.evaluate(el => getComputedStyle(el).animationPlayState === 'paused'), `${name}: hidden windows pause the loop`);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Meta+Shift+k');
    const box = await dialog.boundingBox();
    check(box.x >= 0 && box.x + box.width <= 390, `${name}: capture fits the phone viewport`);
    await page.screenshot({ path: out(`quick-capture-phone-${name}.png`), animations: 'allow' });
    check(errors.length === 0, `${name}: no browser exceptions: ${errors.join(', ')}`);
    writeFileSync(out(`orb-motion-${name}.json`), JSON.stringify({ idle, later, thinking }, null, 2));
    console.log(`PASS ${name}: production orb, capture parsing, confirmation, agent routing and motion preferences`);
  } finally { await browser.close(); host.kill(); }
}
console.log(`PASS ${assertions} orb and capture assertions across Chromium and WebKit`);
