// The shipped bundle, not the dev server: production CSS minification once dropped `translate: none` from the
// island composer's override, shifting its contents half their width left of the island. Chromium and WebKit.
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const playwright = process.env.PLAYWRIGHT ? await import(process.env.PLAYWRIGHT) : await import('playwright');
const webkit = playwright.webkit ?? playwright.default?.webkit;
const build = spawnSync('npm', ['run', 'build'], { cwd: repo + '/app', encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `prod-${process.pid}`;
// The host serves the built UI from AEGIS_UI, exactly as the native window loads it.
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
  cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-prod-')), AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); });
  host.on('exit', code => reject(Error(`Host exited ${code}`)));
});
const engines = [['chromium', chromium], ...(webkit ? [['webkit', webkit]] : [])];
const measure = page => page.evaluate(() => {
  const r = el => el.getBoundingClientRect();
  const island = r(document.getElementById('agentIsland')), composer = r(document.getElementById('composer')), prompt = r(document.getElementById('prompt')), send = r(document.getElementById('send'));
  return { island, composer, prompt, send, translate: getComputedStyle(document.getElementById('composer')).translate };
});
try {
  for (const [name, engine] of engines) {
    const browser = await engine.launch();
    try {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 760, height: 800 }]) {
        const page = await browser.newPage({ viewport });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); });
        await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
        await page.waitForFunction(() => window.aegis?.canvas?.board);
        for (const side of [false, true]) {
          if (side) { await page.keyboard.press('Meta+['); await page.waitForTimeout(400); }
          await page.keyboard.press('Meta+k');
          await page.locator('#composer.open').waitFor();
          await page.waitForTimeout(450);
          const m = await measure(page), label = `${name} ${viewport.width}px${side ? ' with side bar' : ''}`;
          await page.screenshot({ path: out(`prod-composer-${name}-${viewport.width}-${side ? 'side' : 'plain'}-${Date.now()}.png`) });
          assert.ok(['none', '0px'].includes(m.translate), `${label}: composer is translated by ${m.translate}`);
          for (const [part, box] of [['composer', m.composer], ['prompt', m.prompt], ['send', m.send]]) {
            assert.ok(box.left >= m.island.left - 1 && box.right <= m.island.right + 1, `${label}: ${part} [${Math.round(box.left)}, ${Math.round(box.right)}] leaves the island [${Math.round(m.island.left)}, ${Math.round(m.island.right)}]`);
          }
          await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
      console.log(`PASS ${name}: the built composer stays inside its island`);
    } finally { await browser.close(); }
  }
} finally { host.kill(); }
