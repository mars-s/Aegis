import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import type {} from '../../../app/src/platform/test-facade.js';

export async function withApplication(implementation: 'legacy' | 'react', run: (page: Page) => Promise<void>): Promise<void> {
  const root = fileURLToPath(new URL('../../../', import.meta.url)), token = `scene-${process.pid}`;
  const env = { ...process.env, AEGIS_UI_IMPL: implementation, AEGIS_TEST_FACADE: '1', AEGIS_FAKE_MODEL: '1', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-scene-app-')), AEGIS_VITE_CACHE: mkdtempSync(join(tmpdir(), 'aegis-scene-cache-')) };
  const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: join(root, 'agent'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  const port = Number(process.env.AEGIS_PORT_OFFSET ?? 4400) + 1;
  let web: ChildProcess | null = null, browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  function ready(child: ChildProcess, pattern: RegExp): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(output.slice(-4000) || 'Startup timed out')), 20000);
      const receive = (chunk: Buffer): void => { output += chunk.toString(); const match = pattern.exec(output); if (match?.[1]) { clearTimeout(timer); resolve(match[1]); } };
      child.stdout?.on('data', receive); child.stderr?.on('data', receive);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Startup exited ${code}: ${output.slice(-4000)}`)); });
    });
  }
  try {
    const hostPort = await ready(host, /"port":(\d+)/);
    web = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: join(root, 'app'), env, stdio: ['ignore', 'pipe', 'pipe'] });
    await ready(web, /Local:.*:(\d+)/);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 992 }, reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', 'dark'); });
    await page.goto(`http://127.0.0.1:${port}/?port=${hostPort}&token=${token}`);
    await page.bringToFront();
    await page.waitForFunction(() => window.aegis?.canvas.board);
    await run(page);
    if (errors.length) throw new Error(errors.join('\n'));
  } finally { await browser?.close(); web?.kill('SIGTERM'); host.kill('SIGTERM'); }
}
