import { format } from 'node:util';
import { mkdtempSync as createTemporaryDirectory, rmSync } from 'node:fs';
import { chromium as installedChromium, webkit as installedWebkit } from 'playwright';
import { z } from 'zod';
import { build } from 'vite';
import { decodeStoredBoard } from '@aegis/protocol/storage';
import { LibrarySnapshotSchema, LibraryResultSchema } from '@aegis/protocol/services';
import { decodeBoardList } from '@aegis/protocol/http';
import type { Board } from '@aegis/domain';

import type { LibrarySnapshot, LibraryResult } from '@aegis/protocol/services';
import type { BoardListEntry } from '@aegis/protocol/http';
import type { TestFacade } from '../../app/src/platform/test-facade.ts';

// Playwright is a declared development dependency. Use its checked SDK for both engines.
const playwright = { chromium: installedChromium, webkit: installedWebkit };
import { required } from './poll.ts';
export { required } from './poll.ts';
// Compile the actual checked helpers for both development and production page probes.
const built = await build({
  configFile: false, logLevel: 'silent',
  build: { write: false, lib: { entry: new URL('./poll.ts', import.meta.url).pathname, name: 'aegisUiSchemas', formats: ['iife'] } },
});
const bundle = Array.isArray(built) ? required(built[0]) : built;
if (!('output' in bundle)) throw new Error('Expected one browser schema bundle');
const chunk = bundle.output.find(part => part.type === 'chunk');
if (!chunk || chunk.type !== 'chunk') throw new Error('Missing browser schema bundle');
type UiChecks = typeof import('./poll.ts');
declare global { interface Window {
  uiChecks: UiChecks;
  __xss?: number;
  __marker?: string;
  __previousPreview?: MediaStream;
  recoveryEvents?: { type: string; cue: boolean; view: TestFacade['canvas']['view'] }[];
  recoveryListeners?: AbortController;
} }
const init = chunk.code + ';window.uiChecks = aegisUiSchemas;';
function withSchemas(engine: typeof installedChromium) {
  const launch = engine.launch.bind(engine);
  engine.launch = async (...args: Parameters<typeof engine.launch>) => {
    const browser = await launch(...args);
    const createContext = browser.newContext.bind(browser);
    browser.newContext = async (...options: Parameters<typeof createContext>) => {
      const context = await createContext(...options);
      await context.addInitScript({ content: init });
      return context;
    };
    const createPage = browser.newPage.bind(browser);
    browser.newPage = async (...options: Parameters<typeof createPage>) => {
      const page = await createPage(...options);
      await page.addInitScript({ content: init });
      return page;
    };
    return browser;
  };
  return engine;
}
export const chromium = withSchemas(playwright.chromium);
export const webkit = withSchemas(playwright.webkit);
export type { Browser, Page, Locator } from 'playwright';
export type { TestFacade };

export type CheckProcess = Pick<import('node:child_process').ChildProcess, 'stdout' | 'stderr' | 'on' | 'once'>;

export function checkHost(transport: (path: string, body?: unknown) => Promise<unknown>) {
  function api(path: '/library'): Promise<LibrarySnapshot>;
  function api(path: '/library', body: unknown): Promise<LibraryResult>;
  function api(path: '/boards'): Promise<BoardListEntry[]>;
  function api(path: '/boards', body: unknown): Promise<Board>;
  function api(path: `/boards/${string}`): Promise<Board>;
  function api(path: string, body: unknown): Promise<unknown>;
  async function api(path: string, body?: unknown): Promise<unknown> {
    const result = await transport(path, body);
    if (path === '/library') return body === undefined ? LibrarySnapshotSchema.parse(result) : LibraryResultSchema.parse(result);
    if (path === '/boards') return body === undefined ? decodeBoardList(result) : decodeStoredBoard(result);
    if (path.startsWith('/boards/') && body === undefined) return decodeStoredBoard(result);
    return z.json().parse(result);
  }
  return api;
}

const ownedTemporaryDirectories: string[] = [];
export function mkdtempSync(prefix: string): string {
  const path = createTemporaryDirectory(prefix);
  ownedTemporaryDirectories.push(path);
  return path;
}
process.once('exit', () => { for (const path of ownedTemporaryDirectories) rmSync(path, { recursive: true, force: true }); });

export function log(...values: readonly unknown[]): void { process.stdout.write(format(...values) + '\n'); }
export function error(...values: readonly unknown[]): void { process.stderr.write(format(...values) + '\n'); }
