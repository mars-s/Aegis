import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat, unlink, rename } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { DATASET_LIMITS } from '@aegis/domain/dataset';
import { send } from './http.js';

export function createAssets(ASSETS: string) {
const MEDIA: Readonly<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', apng: 'image/apng',
  // item 14: originals remain downloadable through the existing asset capability.
  pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', key: 'application/vnd.apple.keynote',
  // end item 14
  // Datasets keep their original text; the host reads them for exact queries.
  csv: 'text/csv', tsv: 'text/tab-separated-values',
  weba: 'audio/webm', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
  mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm' };
const EXT_OF: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(MEDIA).reverse().map(([e, t]) => [t, e]));
const ASSET_RE = /^[a-f0-9]{32}\.([a-z0-9]{3,4})$/;
async function saveAsset(req: IncomingMessage) {
  const type = (String(req.headers['content-type'] ?? '').split(';')[0] ?? '').trim().toLowerCase();
  const ext = EXT_OF[type]; if (!ext) throw Object.assign(new Error(`unsupported file type ${type || '(none)'}`), { status: 415 });
  // item 14: cap original imported documents, independent of the media allowance.
  const limit = ['csv', 'tsv'].includes(ext) ? DATASET_LIMITS.bytes : ['pdf', 'pptx', 'key'].includes(ext) ? 64 * 1024 ** 2 : 1024 ** 3;
  // end item 14
  const name = `${randomBytes(16).toString('hex')}.${ext}`, tmp = join(ASSETS, `${name}.tmp`);
  let size = 0;
  req.on('data', (chunk: unknown) => { if (!Buffer.isBuffer(chunk)) { req.destroy(new Error('Invalid upload chunk')); return; } size += chunk.length; if (size > limit) req.destroy(new Error(`file is over ${limit === 1024 ** 3 ? '1 GB' : `${Math.round(limit / 1024 ** 2)} MB`}`)); });
  try { await pipeline(req, createWriteStream(tmp, { mode: 0o600 })); } catch (error) { await unlink(tmp).catch(() => {}); throw error; }
  if (!size) { await unlink(tmp).catch(() => {}); throw new Error('empty file'); }
  await rename(tmp, join(ASSETS, name));
  return { url: `asset:${name}`, type, size };
}
async function sendAsset(req: IncomingMessage, res: ServerResponse, name: string) {
  const match = ASSET_RE.exec(name), extension = match?.[1], mimeType = extension ? MEDIA[extension] : undefined; if (!mimeType) return send(res, 404, { error: 'no asset' });
  const path = join(ASSETS, name); let info;
  try { info = await stat(path); } catch { return send(res, 404, { error: 'no asset' }); }
  const headers = { 'content-type': mimeType, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" };
  // WebKit seeks video with byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) { res.writeHead(416, { 'content-range': `bytes */${info.size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return pipeline(createReadStream(path, { start, end }), res).catch(() => {});
  }
  res.writeHead(200, { ...headers, 'content-length': info.size });
  if (req.method === 'HEAD') return res.end();
  return pipeline(createReadStream(path), res).catch(() => {});
}

  async function readAsset(name: string) {
    const extension = ASSET_RE.exec(name)?.[1], mimeType = extension ? MEDIA[extension] : undefined;
    if (!mimeType) throw new Error('Unknown asset type.');
    const path = join(ASSETS, name), info = await stat(path);
    if (info.size > 20 * 1024 ** 2) throw new Error('This file is over the 20 MB MCP limit. Read its extracted text or individual page images instead.');
    return { bytes: await readFile(path), mimeType };
  }
  return { saveAsset, sendAsset, readAsset };
}
