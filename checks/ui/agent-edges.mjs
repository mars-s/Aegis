// PM5: real pointer recovery targets and viewport-safe menus after a long conversation.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';

const offset = Number(process.env.AEGIS_PORT_OFFSET || 0), vitePort = 5209 + offset;
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'edges-' + process.pid;
const stamp = Date.now(), errors = [], observations = {};
let host, vite, browser, page;
const ready = (child, pattern) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Server did not start')), 20000);
  child.stdout.on('data', data => { const match = pattern.exec(String(data)); if (match) { clearTimeout(timer); resolve(match[1]); } });
  child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
});
const centreClick = async locator => {
  const box = await locator.boundingBox(); assert.ok(box, 'pointer target has bounds');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const inside = async locator => {
  const box = await locator.boundingBox(), viewport = page.viewportSize();
  assert.ok(box && box.x >= 8 && box.y >= 8 && box.x + box.width <= viewport.width - 8 && box.y + box.height <= viewport.height - 8, `menu stays inside viewport: ${JSON.stringify(box)}`);
  return box;
};
// PM6.5: inspect the heading at a real wheel or keyboard scroll position.
const stickyProvider = async menu => {
  const state = await menu.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const group = [...el.querySelectorAll('[role=group]')].find(group => { const r = group.getBoundingClientRect(); return r.top <= rect.top + 8 && r.bottom > rect.top + (group.querySelector('.aegis-model-group')?.offsetHeight ?? 0) + 1; });
    const heading = group?.querySelector('.aegis-model-group');
    if (!heading) return { ok: false, scrollTop: el.scrollTop, groups: [...el.querySelectorAll('[role=group]')].map(group => ({ label: group.getAttribute('aria-label'), top: group.getBoundingClientRect().top, bottom: group.getBoundingClientRect().bottom })), top: rect.top };
    const box = heading.getBoundingClientRect(), style = getComputedStyle(heading);
    return { ok: style.position === 'sticky' && style.backgroundColor === getComputedStyle(el).backgroundColor && box.top >= rect.top && box.top <= rect.top + 8 && heading.contains(document.elementFromPoint(box.x + 12, box.y + box.height / 2)), position: style.position, background: style.backgroundColor, menuBackground: getComputedStyle(el).backgroundColor, top: box.top, menuTop: rect.top, hit: document.elementFromPoint(box.x + 12, box.y + box.height / 2)?.outerHTML.slice(0, 180) };
  });
  assert.ok(state.ok, 'current provider stays visible on an opaque heading above scrolling choices: ' + JSON.stringify(state));
};

try {
  host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-edges-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  host.stderr.on('data', data => process.stderr.write(data));
  const port = await ready(host, /"port":(\d+)/);
  vite = spawn('npx', ['vite', '--port', String(vitePort), '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' });
  await ready(vite, /Local/);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('aegis:introduction-complete', '1'); localStorage.setItem('aegis:model', 'fake|fake'); });
  await page.goto(`http://127.0.0.1:${vitePort}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board && document.getElementById('model').options.length);
  if (!process.env.AEGIS_EDGES_ONLY) {
    await page.locator('#askPill').click();
    const prompt = page.locator('#prompt');
    await prompt.click();
    await page.keyboard.insertText(Array.from({ length: 18 }, (_, i) => `Idea ${i + 1}: make space to read, write and review the work this week.`).join('\n'));
    await page.locator('#send').click();
    await page.waitForFunction(async () => { const agents = await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`); return agents.length && agents.every(a => !a.running); });
    await page.locator('#askPill').click();
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1586, height: 992 }]) {
      await page.setViewportSize(viewport);
      await page.locator('#orbMenuButton').click();
      await page.locator('#orbMenu').getByRole('menuitem', { name: 'Agent model', exact: false }).click();
      const menu = page.locator('#orbMenu');
      await page.waitForTimeout(200);
      observations[`model-${viewport.width}`] = await menu.boundingBox();
      await page.screenshot({ path: out(`r6-model-long-${viewport.width}-${stamp}.png`) });
      await inside(menu);
      assert.ok(await menu.evaluate(el => el.scrollHeight > el.clientHeight), 'long model menu has internal overflow');
      const box = await menu.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 360);
      await page.waitForFunction(() => document.getElementById('orbMenu').scrollTop > 0);
      await inside(menu);
      await stickyProvider(menu);
      await page.screenshot({ path: out(`r7-sticky-provider-${viewport.width}-${stamp}.png`) });
      // Keep the menu open while both the viewport and island change size.
      await page.setViewportSize({ width: viewport.width, height: 720 });
      await page.waitForTimeout(100); await inside(menu);
      await page.locator('#prompt').evaluate(el => { el.value = 'An additional thought.\n'.repeat(16); el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForTimeout(320); await inside(menu);
      await page.keyboard.press('Escape');
      await prompt.fill('');
      await page.setViewportSize(viewport);
    }
    console.log('PASS agent-edges: pointer opens long-conversation model menu inside 1440x1000 and 1586x992; wheel scroll, island growth and window resize stay contained');
    await page.keyboard.press('Escape');
    // Hide the conversation agent before the independent edge-cue fixtures.
    await page.locator('.agent-window:visible .agent-close').click();
  }
  // Exercise both public shared menu factories while their anchor moves through layout.
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.evaluate(async () => {
    const { createMenu } = await import('/src/lib/ui/menu.ts');
    const { createDropdown } = await import('/src/lib/ui/dropdown.ts');
    const root = document.createElement('div'); root.id = 'r6MenuFixture';
    Object.assign(root.style, { position: 'fixed', top: '10px', right: '10px', width: '260px', zIndex: '100' });
    const spacer = document.createElement('div'); spacer.id = 'r6MenuSpacer'; root.append(spacer);
    const action = document.createElement('button'); action.id = 'r6Action'; action.textContent = 'Shared actions'; action.style.height = '44px'; root.append(action);
    const popup = createMenu({ trigger: action, label: 'Shared actions fixture', items: Array.from({ length: 30 }, (_, i) => ({ title: `Action ${i + 1}`, run() {} })) });
    const picker = createDropdown({ label: 'Shared values fixture', options: Array.from({ length: 30 }, (_, i) => ({ value: i, label: `Value ${i + 1}`, group: i < 15 ? 'Provider A' : 'Provider B', groupDescription: 'Connected' })) });
    picker.id = 'r6Picker'; picker.style.width = '260px'; root.append(picker); document.body.append(root);
    window.__r6MenuFixture = { root, popup, picker };
  });
  for (const selector of ['#r6Action', '#r6Picker']) {
    await page.locator('#r6MenuSpacer').evaluate(el => { el.style.height = '0px'; });
    const trigger = page.locator(selector);
    await centreClick(trigger); await page.waitForTimeout(180);
    const id = await trigger.getAttribute('aria-controls'), menu = page.locator(`[id="${id}"]`);
    let anchor = await trigger.boundingBox(), box = await inside(menu);
    assert.ok(box.y >= anchor.y + anchor.height + 5, 'shared menu opens below when that side fits');
    if (selector === '#r6Picker') assert.ok(box.width >= 260, 'value menu retains its trigger width');
    // Only the ancestor changes size. ResizeObserver must reposition the open menu.
    await page.locator('#r6MenuSpacer').evaluate(el => { el.style.height = '350px'; });
    await page.waitForTimeout(100);
    anchor = await trigger.boundingBox(); box = await inside(menu);
    assert.ok(box.y + box.height <= anchor.y - 5, 'shared menu flips above a growing ancestor');
    assert.ok(await menu.evaluate(el => el.scrollHeight > el.clientHeight), 'height cap leaves the choices internally scrollable');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, 350);
    await page.waitForFunction(id => document.getElementById(id).scrollTop > 0, id);
    if (selector === '#r6Picker') {
      await stickyProvider(menu);
      await page.keyboard.press('End'); await stickyProvider(menu);
      assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Value 30');
      const activeBox = await page.locator(':focus').boundingBox(), headingBox = await menu.locator('[role=group]').last().locator('.aegis-model-group').boundingBox();
      assert.ok(activeBox.y >= headingBox.y + headingBox.height, 'keyboard choice stays below the sticky provider');
      await page.keyboard.press('Enter');
      assert.equal(await trigger.evaluate(el => el.value), '29');
      await centreClick(trigger);
    }
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.waitForTimeout(100);
    anchor = await trigger.boundingBox(); box = await inside(menu);
    assert.ok(box.y >= anchor.y + anchor.height + 5, 'window resize flips back below when it has more space');
    await page.setViewportSize({ width: 390, height: 720 }); await page.waitForTimeout(100); await inside(menu);
    await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1440, height: 720 });
  }
  await page.evaluate(() => { const { root, popup, picker } = window.__r6MenuFixture; popup.destroy(); picker.dropdown.destroy(); root.remove(); delete window.__r6MenuFixture; });
  console.log('PASS agent-edges: shared action and value menus flip both ways, cap and scroll; ancestor ResizeObserver and viewport resize reposition them at desktop and phone sizes');
  await page.setViewportSize({ width: 1586, height: 992 });
  const ids = [];
  const addAgents = async count => {
    const made = await page.evaluate(async count => {
      const ids = [];
      for (let i = 0; i < count; i++) {
        const [agent] = await aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify([{ op: 'create', type: 'note', text: `Edge note ${Date.now()}-${i}`, x: i * 420, y: 200 }]), model: { provider: 'fake', modelId: 'fake' } });
        ids.push(agent.id);
      }
      return ids;
    }, count);
    ids.push(...made);
    await page.waitForFunction(async ids => { const agents = await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`); return ids.every(id => document.querySelector(`.agent-window[data-agent-id="${id}"]`) && agents.some(a => a.id === id && !a.running)); }, made);
    await page.waitForFunction(ids => ids.every(id => { const window = document.querySelector(`.agent-window[data-agent-id="${id}"]`); return window && !window.classList.contains('running'); }), made);
    // Let card sizing and the final agent poll settle before deliberately leaving the work.
    await page.waitForTimeout(1100);
  };
  await addAgents(3);
  const panAway = async () => {
    if (await page.locator('#composer.open').isVisible()) await page.locator('#composer .island-collapse').click();
    await page.evaluate(() => aegis.canvas.setView({ x: 0, y: 0, z: 1 }));
    const viewport = page.viewportSize();
    await page.mouse.move(viewport.width / 2, viewport.height * .6); await page.mouse.wheel(-8000, 0);
    await page.waitForFunction(() => document.querySelectorAll('.agent-edge[data-agent-id]:not([hidden])').length > 0 || document.querySelector('.agent-edge-cluster:not([hidden])'));
    await page.waitForTimeout(100);
  };
  await panAway();
  const stableAgentWidths = await page.locator('.agent-window:not([hidden])').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().width));
  for (const z of [.3, .5, .75, 1, 2]) {
    await page.evaluate(z => aegis.canvas.setView({ x: 0, y: 0, z }), z);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await page.locator('.agent-window:not([hidden])').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().width)), stableAgentWidths, 'real agent chrome stays screen-sized at every camera scale');
    assert.equal(await page.locator('.agent-zoom-summary').count(), 0);
  }
  await panAway();
  const cues = await page.locator('.agent-edge[data-agent-id]:visible').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return { id: el.dataset.agentId, x: r.x, y: r.y, w: r.width, h: r.height, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-agent-id]')?.dataset.agentId }; }));
  observations.threeCues = cues;
  await page.screenshot({ path: out(`r6-three-edge-cues-${stamp}.png`) });
  assert.equal(cues.length, 3);
  for (const cue of cues) assert.equal(cue.hit, cue.id, 'each cue centre reaches its own agent');
  const ordered = [...cues].sort((a, b) => a.y - b.y);
  for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i].y - ordered[i - 1].y >= 48, 'edge cue centres have at least 48px spacing');
  for (const id of ids) {
    await panAway();
    await centreClick(page.locator(`.agent-edge[data-agent-id="${id}"]`));
    await page.waitForTimeout(550);
    const box = await page.locator(`.agent-window[data-agent-id="${id}"]`).boundingBox();
    assert.ok(box && Math.abs(box.x + box.width / 2 - 793) < 2 && Math.abs(box.y + box.height / 2 - 496) < 2, `pointer recovers agent ${id}, rather than its neighbour`);
  }
  for (const [side, dx, dy] of [['left', 8000, 0], ['top', 0, 8000], ['bottom', 0, -8000]]) {
    await page.evaluate(() => aegis.canvas.setView({ x: 0, y: 0, z: 1 }));
    await page.mouse.move(850, 700); await page.mouse.wheel(dx, dy); await page.waitForTimeout(100);
    const positions = await page.locator('.agent-edge[data-agent-id]:visible').evaluateAll((nodes, side) => nodes.map(el => {
      const cue = el.getBoundingClientRect(), win = document.querySelector(`.agent-window[data-agent-id="${el.dataset.agentId}"]`).getBoundingClientRect();
      const dx = win.x + win.width / 2 - innerWidth / 2, dy = win.y + win.height / 2 - innerHeight / 2;
      return { id: el.dataset.agentId, along: side === 'left' ? cue.y : cue.x, direction: side === 'left' ? dy / Math.abs(dx) : dx / Math.abs(dy), hit: document.elementFromPoint(cue.x + 22, cue.y + 22)?.closest('[data-agent-id]')?.dataset.agentId };
    }), side);
    assert.equal(positions.length, 3);
    positions.sort((a, b) => a.direction - b.direction);
    for (let i = 0; i < positions.length; i++) {
      assert.equal(positions[i].hit, positions[i].id, `a ${side} cue keeps its own pointer target`);
      if (i) assert.ok(positions[i].along - positions[i - 1].along >= 48, `${side} cues preserve direction order with 48px spacing`);
    }
  }
  console.log('PASS agent-edges: three off-screen agents have separate 44px targets spaced at least 48px; real centre clicks recover all three correctly');
  await page.evaluate(() => aegis.canvas.setView({ x: 0, y: 0, z: 1 }));
  await addAgents(3);
  // Each of the six chooser entries must recover its own spatial window.
  for (const id of ids) {
    await panAway();
    const cluster = page.locator('.agent-edge-cluster:visible');
    assert.equal(await cluster.count(), 1);
    assert.match(await cluster.getAttribute('aria-label'), /6 agents/);
    await centreClick(cluster);
    const menu = page.getByRole('menu', { name: /Off-screen agents/ });
    assert.equal(await menu.getByRole('menuitem').count(), 6);
    await inside(menu);
    await page.waitForTimeout(170);
    if (id === ids[0]) await page.screenshot({ path: out(`r6-six-agent-chooser-${stamp}.png`) });
    await centreClick(menu.locator(`[data-agent-id="${id}"]`));
    await page.waitForTimeout(550);
    const box = await page.locator(`.agent-window[data-agent-id="${id}"]`).boundingBox();
    assert.ok(box && Math.abs(box.x + box.width / 2 - 793) < 2, 'each counted chooser entry recovers its own agent');
  }
  await panAway();
  await page.locator('#stage').focus();
  let reachedCluster = false;
  for (let i = 0; i < 60 && !reachedCluster; i++) {
    await page.keyboard.press('Tab');
    reachedCluster = await page.evaluate(() => document.activeElement.matches('.agent-edge-cluster:not([hidden])'));
  }
  assert.equal(reachedCluster, true, 'Tab reaches the counted cue');
  await page.keyboard.press('Enter');
  const chooser = page.getByRole('menu', { name: /Off-screen agents/ });
  assert.equal(await chooser.getByRole('menuitem').first().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('End');
  const keyboardId = await page.evaluate(() => document.activeElement.dataset.agentId);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator(`.agent-window[data-agent-id="${keyboardId}"] .agent-window-toggle`).evaluate(el => el === document.activeElement), true, 'keyboard chooser recovery transfers focus to the spatial window');
  await panAway(); await centreClick(page.locator('.agent-edge-cluster:visible'));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.agent-edge-cluster:visible').evaluate(el => el === document.activeElement), true, 'Escape restores the counted cue');
  await page.setViewportSize({ width: 390, height: 844 });
  await panAway(); await centreClick(page.locator('.agent-edge-cluster:visible'));
  await page.waitForTimeout(180);
  await inside(page.getByRole('menu', { name: /Off-screen agents/ }));
  await page.screenshot({ path: out(`r6-six-agent-chooser-390-${stamp}.png`) });
  await page.keyboard.press('Escape');
  console.log('PASS agent-edges: six-agent counted chooser gives every agent a pointer target; Enter, End and Escape support keyboard recovery and focus');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error('FAIL agent-edges:', error.stack); process.exitCode = 1;
  await page?.screenshot({ path: out(`r6-agent-edges-fail-${stamp}.png`) }).catch(() => {});
} finally {
  writeFileSync(out(`r6-agent-edges-results-${stamp}.json`), JSON.stringify({ observations, errors }, null, 2));
  await browser?.close(); host?.kill(); vite?.kill();
}
