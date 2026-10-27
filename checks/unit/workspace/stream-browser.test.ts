import { afterAll, beforeAll, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { chromium, webkit } from 'playwright';
import { BoardSchema } from '@aegis/domain';
import type {} from '../../../app/src/platform/test-facade.js';

declare global { interface Window { workspaceStreamBoardEvents: { readonly boardId: string; readonly rev: number }[] } }

const offset = Number(process.env.AEGIS_PORT_OFFSET ?? 4100);
const cache = mkdtempSync(join(tmpdir(), 'aegis-stream-vite-'));
const data = mkdtempSync(join(tmpdir(), 'aegis-stream-host-'));
const token = `stream-regression-${process.pid}`;
let server: ViteDevServer | undefined;
const host = spawn(process.execPath, ['dist/main.js'], {
  cwd: join(process.cwd(), 'agent'), env: { ...process.env, AEGIS_DATA: data, AEGIS_VITE_CACHE: cache, AEGIS_PORT: String(offset + 19), AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const base = `http://127.0.0.1:${offset + 19}`;
const ready = new Promise<void>((resolve, reject) => {
  host.once('error', reject);
  host.once('exit', code => { reject(new Error(`Stream host exited ${code}`)); });
  host.stdout.on('data', (chunk: Buffer) => { if (chunk.toString().includes('"aegis":"ready"')) resolve(); });
});
async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  expect(response.ok).toBe(true);
  const value: unknown = await response.json();
  return value;
}
beforeAll(async () => {
  await ready;
  const resolveApp = createRequire(join(process.cwd(), 'app/package.json'));
  // Match app resolution without changing its production or legacy configuration.
  server = await createServer({ resolve: { alias: [
    { find: /^react-dom\/client$/, replacement: resolveApp.resolve('react-dom/client') },
    { find: /^react-dom$/, replacement: resolveApp.resolve('react-dom') },
    { find: /^react$/, replacement: resolveApp.resolve('react') },
  ] }, root: process.cwd(), configFile: false, cacheDir: cache, server: { host: '127.0.0.1', port: offset + 18, strictPort: true }, define: { __AEGIS_VERSION__: JSON.stringify('test'), __AEGIS_TEST_FACADE__: 'true' }, optimizeDeps: { include: ['zod', 'react', 'react-dom/client'] } });
  await server.listen();
}, 30000);
afterAll(async () => {
  await server?.close();
  if (host.exitCode === null) { const exited = once(host, 'exit'); host.kill('SIGTERM'); await exited; }
  rmSync(data, { recursive: true, force: true }); rmSync(cache, { recursive: true, force: true });
});

test.each([['chromium', chromium], ['webkit', webkit]] as const)('delivers the first agent board event after reload in %s without another host update', async (_name, engine) => {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => { errors.push(error.message); });
    await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:board', new URLSearchParams(location.search).get('board') ?? ''); });
    for (let iteration = 0; iteration < 12; iteration++) {
      const board = BoardSchema.parse(await post('/boards', { name: 'First update after reload' }));
      const url = new URL(`http://127.0.0.1:${offset + 18}/checks/unit/workspace/stream-react.html`);
      url.search = new URLSearchParams({ port: String(offset + 19), token, board: board.id }).toString();
      await page.goto(url.href);
      await page.waitForFunction(() => window.aegis);
      const opened = page.waitForResponse(response => new URL(response.url()).pathname === '/events');
      await page.reload();
      await opened;
      await page.waitForFunction(() => window.aegis);
      await page.evaluate(async () => {
        const facade = window.aegis;
        if (!facade) throw new Error('Missing real workspace');
        await facade.flush();
        window.workspaceStreamBoardEvents = [];
        facade.workspace.events.subscribe(() => {
          const event = facade.workspace.events.getSnapshot();
          if (event?.type === 'board') window.workspaceStreamBoardEvents.push({ boardId: event.boardId, rev: event.rev });
        });
      });
      await post('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKE ' + JSON.stringify([
        { op: 'create', newId: 'streamdoc', type: 'doc', text: 'A clear idea', x: 100, y: 150, props: { body: 'Write, then return to the board.' } },
        { op: 'create', newId: 'streamsheet', type: 'object', kind: 'sheet', text: 'Sleep log', x: 100, y: 250, data: { columns: [{ label: 'Night', kind: 'text' }], rows: [{ cells: ['Monday'] }] } },
        { op: 'create', newId: 'streamdeck', type: 'deck', text: 'A clear idea', x: 100, y: 200, props: { current: 0, slides: [{ id: 'opening', layout: 'title', title: 'A clear idea', sub: 'Room to think' }] } },
        { op: 'create', newId: 'streamwave', type: 'deck', text: 'Sleep deck', x: 700, y: 200, props: { current: 0, slides: [{ id: 'sleep', layout: 'title', title: 'A calmer week', background: 'sci-fi-wave' }] } },
        { op: 'create', newId: 'streamnote', type: 'note', text: 'Canvas context', x: 600, y: 600 },
        { op: 'create', newId: 'streamreference', type: 'note', text: 'Reference', x: 4000, y: 2000 },
      ]) });
      await page.waitForFunction(() => window.workspaceStreamBoardEvents.some(event => event.rev === 1), undefined, { timeout: 3000 });
      expect(await page.evaluate(() => window.workspaceStreamBoardEvents)).toEqual([{ boardId: board.id, rev: 1 }]);
      const snapshot = BoardSchema.parse(await page.evaluate(() => window.aegis?.workspace.scene.snapshot()));
      expect(snapshot.cards.map(card => card.id)).toEqual(['streamdoc', 'streamsheet', 'streamdeck', 'streamwave', 'streamnote', 'streamreference']);
      expect(await page.evaluate(() => window.aegis?.workspace.connectionError.getSnapshot())).toBeNull();
    }
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 60000);
