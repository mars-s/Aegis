// PM6 finding 1: hold a real working snapshot until completion events reach the UI.
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const offset = Number(process.env.AEGIS_PORT_OFFSET || 0);
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const token = `race-${process.pid}`, capture = Date.now();
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
  cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-race-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_DELAY_MS: '1000' }, stdio: ['ignore', 'pipe', 'pipe'],
});
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', d => { const match = /"port":(\d+)/.exec(String(d)); if (match) resolve(match[1]); });
  host.on('exit', code => reject(Error(`Host exited ${code}`)));
});
const vite = spawn('npx', ['vite', '--port', String(5200 + offset), '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' });
await new Promise((resolve, reject) => { vite.stdout.on('data', d => { if (/Local/.test(String(d))) resolve(); }); vite.on('exit', reject); });
const browser = await chromium.launch(), evidence = [], errors = [];
let page, release;
try {
  for (const legacy of [false, true]) {
    const board = await (await fetch(`http://127.0.0.1:${port}/boards`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ name: legacy ? 'Legacy reply race' : 'Revisioned reply race' }) })).json();
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ legacy, boardId }) => {
      localStorage.setItem('aegis:onboarded', '1');
      localStorage.setItem('aegis:model', 'fake|fake');
      localStorage.setItem('aegis:board', boardId);
      const NativeEventSource = window.EventSource;
      window.__agentRace = { events: [], deliver: null };
      window.EventSource = class extends NativeEventSource {
        set onmessage(handler) {
          const deliver = event => {
            const data = JSON.parse(event.data);
            if (legacy && data.type === 'agent') delete data.revision;
            if (data.type === 'agent') window.__agentRace.events.push(data);
            handler(new MessageEvent('message', { data: JSON.stringify(data) }));
          };
          window.__agentRace.deliver = data => deliver({ data: JSON.stringify(data) });
          super.onmessage = deliver;
        }
      };
    }, { legacy, boardId: board.id });
    await page.goto(`http://127.0.0.1:${5200 + offset}/?port=${port}&token=${token}`);
    await page.waitForFunction(() => window.aegis?.canvas?.board && document.querySelector('#model option[value="fake|fake"]'));
    let hold;
    const held = new Promise(resolve => { hold = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/agents?*', async route => {
      const response = await route.fetch();
      const snapshots = await response.json();
      if (legacy) for (const agent of snapshots) delete agent.revision;
      if (!snapshots.some(agent => agent.running)) return route.fulfill({ response, json: snapshots });
      hold(snapshots);
      await gate;
      await route.fulfill({ response, json: snapshots });
    });
    await page.keyboard.press('Meta+k');
    await page.locator('#prompt').fill('Help me think through a quieter week.');
    await page.locator('#prompt').press('Enter');
    const snapshots = await held, stale = snapshots.find(agent => agent.running);
    assert.ok(stale, 'the intercepted GET contains a real working snapshot');
    assert.equal(stale.text, '');
    const id = stale.id;
    await page.waitForFunction(id => window.__agentRace.events.some(agent => agent.id === id && !agent.running && agent.text && agent.history.some(request => request.finished)), id);
    const completed = await page.evaluate(id => window.__agentRace.events.findLast(agent => agent.id === id), id);
    assert.equal(completed.running, false);
    const responseArrived = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/agents');
    release(); await (await responseArrived).finished();
    await page.waitForFunction(() => !document.getElementById('send').disabled);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const state = await page.evaluate(id => ({
      working: document.getElementById('askPill').classList.contains('working'),
      island: document.getElementById('agentIsland').dataset.state,
      count: document.getElementById('status').textContent,
      answer: document.querySelector(`.agent-window[data-agent-id="${id}"] .agent-window-answer`).textContent,
      history: document.querySelector(`.agent-window[data-agent-id="${id}"] .agent-history`).textContent,
    }), id);
    evidence.push({ legacy, snapshots, completed, afterDelayedGet: state });
    await page.screenshot({ path: out(`race-${capture}-${legacy ? 'legacy' : 'revision'}-delayed-get.png`) });
    assert.equal(state.working, false, 'a delayed working GET must not overwrite completion');
    assert.notEqual(state.island, 'running');
    assert.equal(state.count, '');
    assert.ok(state.answer.includes(completed.text), 'the spatial conversation retains the completed reply');
    assert.match(state.history, /No board changes/);
    assert.equal(await page.locator('#runStrip').isVisible(), false);
    await page.keyboard.press('Meta+k');
    assert.equal(await page.locator('#composer .island-turn.assistant p').last().textContent(), completed.text, 'opening the conversation shows the assistant turn without reload');
    if (!legacy) {
      assert.ok(completed.revision > stale.revision, 'completion has a newer host revision');
      // Exercise old and duplicate events through the same EventSource handler as real events.
      await page.evaluate(({ stale, completed }) => {
        window.__agentRace.deliver({ type: 'agent', ...stale });
        window.__agentRace.deliver({ type: 'agent', ...stale, revision: completed.revision });
      }, { stale, completed });
      assert.equal(await page.locator('#composer .island-turn.assistant p').last().textContent(), completed.text);
      assert.equal(await page.locator('#askPill').evaluate(el => el.classList.contains('working')), false);
    }
    for (const width of [1440, 1586, 390]) {
      await page.setViewportSize({ width, height: width === 1586 ? 992 : 1000 });
      await page.screenshot({ path: out(`race-${capture}-${legacy ? 'legacy' : 'revision'}-conversation-${width}.png`) });
    }
    console.log(`PASS ${legacy ? 'legacy' : 'revisioned'} delayed GET after completion preserves reply, history, idle count and island; conversation opens without reload`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: out(`race-${capture}-failure.png`) });
} finally {
  release?.();
  writeFileSync(out(`race-${capture}-evidence.json`), JSON.stringify({ evidence, errors }, null, 2));
  await browser.close(); host.kill(); vite.kill();
}
