import type { IncomingMessage, ServerResponse } from 'node:http';
import { stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { send } from './http.js';

export function createUiFiles(UI_DIRS: readonly string[]) {
const UI_TYPES: Readonly<Record<string, string>> = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', wasm: 'application/wasm', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', apng: 'image/apng', png: 'image/png', json: 'application/json', map: 'application/json', woff2: 'font/woff2' };
// end item 14
async function uiRoot() {
  for (const dir of UI_DIRS) { try { if ((await stat(join(dir, 'index.html'))).isFile()) return dir; } catch {} }
  return null;
}
async function sendUi(req: IncomingMessage, res: ServerResponse, rel: string | undefined) {
  const root = await uiRoot(); if (!root) return send(res, 404, { error: 'no ui installed' });
  const clean = normalize('/' + decodeURIComponent(rel || 'index.html')).replace(/^\/+/, '');
  if (clean.includes('..')) return send(res, 404, { error: 'not found' });
  const path = join(root, clean || 'index.html');
  if (!path.startsWith(root)) return send(res, 404, { error: 'not found' });
  let info; try { info = await stat(path); } catch { return send(res, 404, { error: 'not found' }); }
  if (!info.isFile()) return send(res, 404, { error: 'not found' });
  const ext = path.split('.').pop();
  res.writeHead(200, { 'content-type': UI_TYPES[ext ?? ''] ?? 'application/octet-stream', 'cache-control': clean === 'index.html' ? 'no-store' : 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
  return pipeline(createReadStream(path), res).catch(() => {});
}

  return { uiRoot, sendUi };
}
