import { CardSchema } from '@aegis/domain/schema';
import type { RewriteRequest } from '../editors/document/services.js';
import { findDocumentSession } from '../editors/document/session.js';
import type {} from './test-facade.js';
let rewrite: ((request: RewriteRequest) => Promise<string>) | null = null;
export function documentTestRewriter() { return rewrite; }
export function registerDocRewriter(handler: (request: RewriteRequest) => Promise<string>): () => void { rewrite = handler; return () => { if (rewrite === handler) rewrite = null; }; }
export function currentDocument() {
  const workspace = window.aegis?.workspace, id = workspace?.ui.getSnapshot().editor?.id;
  const session = workspace && id ? findDocumentSession(workspace, id) : undefined;
  if (!session) throw new Error('No document session is attached.');
  return session;
}
export function openDocument(boundary: unknown, _context: unknown, options: { readonly keyboard?: boolean } = {}): void {
  const card = CardSchema.parse(boundary);
  window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: card.id, keyboard: options.keyboard ?? false } }));
}
