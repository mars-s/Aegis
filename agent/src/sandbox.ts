import type { ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { z } from 'zod/v4';
import { SHAPES, checkObject } from '@aegis/domain/objects';
import { sandboxDocument, SANDBOX_HEADER_CSP } from '@aegis/protocol/sandbox';
import { send } from './http.js';

export const SANDBOX_LIMIT = 1024 * 1024;
const RegistrationSchema = z.strictObject({
  html: z.string(), css: z.string(), js: z.string(), state: z.string().optional(),
  parentOrigin: z.string().max(2048).optional(), channel: z.string().uuid(), theme: z.string(),
  font: z.string().regex(/^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/).optional(), motionOff: z.boolean(), acknowledgeSnapshots: z.boolean().optional(),
});
export function createSandboxes(port: () => number) {
  const documents = new Map<string, string>();
  function registerSandbox(input: unknown) {
    const value = RegistrationSchema.parse(input);
    const data = SHAPES.html.parse(checkObject('html', { html: value.html, css: value.css, js: value.js, ...(value.state === undefined ? {} : { state: value.state }) }));
    const document = sandboxDocument({ ...data, ...(value.parentOrigin === undefined ? {} : { parentOrigin: value.parentOrigin }) }, value.channel, value.theme, value.font ?? '', value.motionOff, value.acknowledgeSnapshots ?? false);
    if (Buffer.byteLength(document) > SANDBOX_LIMIT) throw Object.assign(new Error('sandbox is over 1 MiB'), { status: 413 });
    const id = randomBytes(32).toString('hex'); documents.set(id, document);
    const oldest = documents.keys().next().value;
    if (documents.size > 200 && oldest !== undefined) documents.delete(oldest);
    return { url: `http://127.0.0.1:${port()}/sandbox/${id}` };
  }
  function sendSandbox(response: ServerResponse, id: string): void {
    const document = documents.get(id);
    if (!document) return send(response, 404, { error: 'no sandbox' });
    documents.delete(id); documents.set(id, document);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(document), 'content-security-policy': SANDBOX_HEADER_CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'cross-origin-resource-policy': 'same-site' });
    response.end(document);
  }
  return { registerSandbox, sendSandbox };
}
