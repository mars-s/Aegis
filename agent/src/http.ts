import type { IncomingMessage, ServerResponse } from 'node:http';

export async function body(req: IncomingMessage, limit = 5e6): Promise<unknown> {
  let size = 0; const chunks: Uint8Array[] = [];
  for await (const raw of req) {
    const value: unknown = raw;
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk);
  }
  const value: unknown = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  return value;
}
export function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}
