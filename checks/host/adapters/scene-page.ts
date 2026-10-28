import { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import type {} from './scene-entry.tsx';
const root = fileURLToPath(new URL('../../../', import.meta.url));
let server: ViteDevServer | undefined, browser: Browser | undefined;
let starting: Promise<void> | undefined;
async function start(): Promise<void> {
  server = await createServer({ root, configFile: false, ...(process.env.AEGIS_VITE_CACHE ? { cacheDir: process.env.AEGIS_VITE_CACHE } : {}),
    plugins: [{ name: 'host-scene-entry', configureServer(current) {
      current.middlewares.use('/__host_scene__', (_request, response) => {
        response.setHeader('content-type', 'text/html');
        response.end('<!doctype html><html><head><meta charset="utf-8"><title>Host scene checks</title></head><body><script type="module" src="/checks/host/adapters/scene-entry.tsx"></script></body></html>');
      });
    } }],
    server: { host: '127.0.0.1', port: 4940, strictPort: false, fs: { allow: [root] } } });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string' || address.port > 4959) throw new Error('Host scene fixture escaped its assigned listener block');
  browser = await chromium.launch({ headless: true });
}
export async function withScenePage<T>(run: (page: Page) => Promise<T>): Promise<T> {
  starting ??= start(); await starting;
  const address = server?.httpServer?.address();
  if (!browser || !address || typeof address === 'string') throw new Error('Missing host scene fixture');
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${address.port}/__host_scene__`);
    await page.waitForFunction(() => window.hostScene !== undefined);
    return await run(page);
  } finally { await page.close(); }
}
after(async () => { await browser?.close(); await server?.close(); });
