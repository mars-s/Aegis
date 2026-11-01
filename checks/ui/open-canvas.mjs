// Fresh starts and provider connections against the shipped UI, using disposable CLI doubles.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, copyFile, chmod, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from './playwright.mjs';
import { out } from './out.mjs';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

async function hostFixture(fake) {
  const data = await mkdtemp(join(tmpdir(), 'aegis-open-canvas-'));
  const binary = join(data, 'claude'), token = `open-canvas-${process.pid}-${Number(fake)}`;
  await copyFile(new URL('../fixtures/claude.mjs', import.meta.url), binary); await chmod(binary, 0o700); await writeFile(binary + '.state', 'signed-out');
  // Start with an absent binary, then put the fixture at the configured path.
  const installed = binary + '.installed'; await copyFile(binary, installed); await rm(binary);
  const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_CLAUDE_BIN: binary, AEGIS_FAKE_MODEL: fake ? '1' : '' } });
  let diagnostics = '';
  host.stderr.on('data', bytes => { diagnostics += String(bytes); });
  const port = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`Host did not start: ${diagnostics}`)), 10000);
    host.once('error', error => { clearTimeout(timer); reject(error); });
    host.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited ${code}: ${diagnostics}`)); });
    host.stdout.on('data', bytes => { buffer += String(bytes); const match = /"aegis":"ready","port":(\d+)/.exec(buffer); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
  }).catch(async error => { host.kill(); await rm(data, { recursive: true, force: true }); throw error; });
  const api = async (path, value) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: value === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  return { data, binary, installed, api, url: `http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`,
    close: async () => { const ended = new Promise(resolve => host.once('exit', resolve)); host.kill(); const timer = setTimeout(() => host.kill('SIGKILL'), 3000); await ended; clearTimeout(timer); await rm(data, { recursive: true, force: true }); } };
}
const engines = [['chromium', chromium], ...(process.env.AEGIS_CHECK_WEBKIT ? [['webkit', webkit]] : [])];
for (const [name, engine] of engines) {
  let browser;
  try { browser = await engine.launch(); }
  catch (error) { if (name === 'webkit' && /executable|dependencies|not found/i.test(String(error))) { console.log('SKIP WebKit is unavailable'); continue; } throw error; }
  try {
    const host = await hostFixture(false);
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(host.url); await page.getByRole('button', { name: 'Connect AI', exact: true }).waitFor();
      for (const selector of ['nav#tools', '.onboarding', '#empty', '.empty-actions', '[data-panel="tools"]']) assert.equal(await page.locator(selector).count(), 0, selector);
      await page.mouse.move(720, 450);
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: out(`open-canvas-empty-${name}-${width}.png`) });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('button', { name: 'Connect AI', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'Connect AI', exact: true }); await panel.waitFor();
      assert.match(await panel.textContent(), /ChatGPT/); assert.match(await panel.textContent(), /Claude/);
      await panel.getByRole('button', { name: 'Copy install command', exact: true }).waitFor();
      assert.equal(await panel.locator('input').count(), 0);
      await page.screenshot({ path: out(`open-canvas-connect-missing-${name}.png`) });
      let signIns = 0;
      await page.route('**/auth/start', async route => { signIns++; assert.equal(route.request().postDataJSON().provider, 'openai'); await route.fulfill({ json: { ...(await host.api('/auth')), openai: { connected: false, state: 'pending', progress: 'Waiting for browser approval', link: null, error: null, prompt: null } } }); });
      await panel.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).click(); assert.equal(signIns, 1);
      await copyFile(host.installed, host.binary); await chmod(host.binary, 0o700);
      await panel.getByRole('button', { name: 'Check again', exact: true }).click();
      await panel.getByRole('button', { name: 'Copy claude command', exact: true }).waitFor();
      await page.screenshot({ path: out(`open-canvas-connect-signed-out-${name}.png`) });
      await writeFile(host.binary + '.state', 'ready');
      await panel.getByRole('button', { name: 'Check again', exact: true }).click();
      // Readiness closes the panel and opens the introduction in the normal chat.
      await page.locator('#composer.open .island-turn.assistant').filter({ hasText: 'workflow' }).first().waitFor();
      assert.equal((await host.api('/auth')).claude.state, 'ready');
      await page.screenshot({ path: out(`open-canvas-claude-greeting-${name}.png`) });
      await page.keyboard.press('Escape'); await page.mouse.move(1420, 20); await page.locator('#settingsBtn').click(); await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
      assert.match(await page.locator('#settings-accounts [data-provider="claude"]').textContent(), /Ready.*2.1.0/s);
      await page.screenshot({ path: out(`open-canvas-claude-ready-${name}.png`) });
      assert.deepEqual(errors, []); await page.close();
    } finally { await host.close(); }
    const fake = await hostFixture(true);
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await page.goto(fake.url);
      await page.locator('#composer.open .island-turn.assistant').filter({ hasText: 'Who are you' }).waitFor();
      await page.screenshot({ path: out(`open-canvas-fake-greeting-${name}.png`) });
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill('I am Avi, a designer. I study and build products. Help me focus and organise my work.');
      await page.getByRole('textbox', { name: 'Message', exact: true }).press('Enter');
      // The app drops the token from its address, so poll the host from here.
      for (let tries = 0; !String((await fake.api('/profile')).notes ?? '').includes('Avi'); tries++) { assert.ok(tries < 100, 'profile was not saved'); await new Promise(done => setTimeout(done, 100)); }
      assert.match((await fake.api('/profile')).notes, /designer/);
      await page.waitForFunction(() => localStorage.getItem('aegis:introduction-complete') === '1');
      const count = (await fake.api('/agents')).length; await page.reload(); await page.locator('#askPill').waitFor(); assert.equal((await fake.api('/agents')).length, count);
      await page.screenshot({ path: out(`open-canvas-profile-saved-${name}.png`) }); await page.close();
    } finally { await fake.close(); }
  } finally { await browser.close(); }
}
console.log('PASS open canvas, provider rows, ChatGPT start, Claude states, greeting and profile');
