import { after } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import type {} from './scene-entry.tsx';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const appRequire = createRequire(new URL('../../../app/package.json', import.meta.url));
let server: ViteDevServer | undefined, browser: Browser | undefined;
let starting: Promise<void> | undefined;
async function start(): Promise<void> {
  server = await createServer({ root, configFile: false, ...(process.env.AEGIS_VITE_CACHE ? { cacheDir: process.env.AEGIS_VITE_CACHE } : {}),
    resolve: { alias: [
      { find: /^react-dom\/client$/, replacement: appRequire.resolve('react-dom/client') },
      { find: /^react-dom$/, replacement: appRequire.resolve('react-dom') },
      { find: /^react$/, replacement: appRequire.resolve('react') },
      { find: /^react\/jsx-dev-runtime$/, replacement: appRequire.resolve('react/jsx-dev-runtime') },
      { find: /^react\/jsx-runtime$/, replacement: appRequire.resolve('react/jsx-runtime') },
    ] }, server: { host: '127.0.0.1', port: 4940, strictPort: false, fs: { allow: [root] } } });
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
    await page.goto(`http://127.0.0.1:${address.port}/checks/host/adapters/scene.html`);
    await page.waitForFunction(() => window.hostScene !== undefined);
    return await run(page);
  } finally { await page.close(); }
}
after(async () => { await browser?.close(); await server?.close(); });
