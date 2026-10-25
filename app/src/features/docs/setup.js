import { registerRenderer, registerCardDropTarget } from '../../canvas/engine.js';
import { registerTool, registerCardMenu, registerCommand } from '../registry';
import { openDocument, copyIntoDocument, currentDocument, resolveDocumentDrop, installDocumentClipboard } from './editor.js';
export { registerDocRewriter } from './editor.js';
const icon = '<path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3M6 7h4M6 9.5h4M6 12h2"/>';
registerRenderer('doc', {
  resizable: false,
  render(el, card) {
    const page = document.createElement('span'); page.className = 'docs-card-icon'; page.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">${icon}</svg>`;
    const title = document.createElement('span'); title.className = 'docs-card-title'; title.textContent = card.text || 'Untitled document';
    el.append(page, title); el.classList.toggle('docs-has-content', !!card.props?.body?.trim());
    el.title = `${card.text || 'Untitled document'}: double-click to open`; el.setAttribute('aria-label', el.title);
  },
  open(card) { if (globalThis.aegisCtx) openDocument(card, globalThis.aegisCtx); },
});
registerTool({
  id: 'doc', title: 'Doc (D)', key: 'd', icon, group: 'write',
  place(at, ctx) {
    ctx.apply([{ op: 'create', type: 'doc', text: '', x: Math.round(at.x - 120), y: Math.round(at.y - 28), props: { doc: { type: 'doc', content: [{ type: 'paragraph' }] }, body: '' }, ref: 'doc' }], created => {
      ctx.canvas.select([created.doc]);
      const card = ctx.canvas.board.cards.find(c => c.id === created.doc); if (card) openDocument(card, ctx);
    });
  },
});
registerCardMenu({ id: 'doc-open', title: 'Open document', section: 'Document', when: (ctx, ids) => ids.length === 1 && ctx.canvas.board.cards.some(c => c.id === ids[0] && c.type === 'doc'), run: (ctx, ids) => openDocument(ctx.canvas.board.cards.find(c => c.id === ids[0]), ctx) });
registerCardMenu({ id: 'doc-copy', title: 'Copy into open document', section: 'Document', when: () => !!currentDocument(), run: (ctx, ids) => copyIntoDocument(ctx.canvas.board.cards.filter(c => ids.includes(c.id)), ctx) });
registerCommand({ id: 'doc-open', title: 'Open selected document', keys: 'enter', when: ctx => ctx.selection().length === 1 && ctx.canvas.board.cards.some(c => c.id === ctx.selection()[0] && c.type === 'doc'), run: ctx => openDocument(ctx.canvas.board.cards.find(c => c.id === ctx.selection()[0]), ctx) });
registerCardDropTarget(resolveDocumentDrop);
installDocumentClipboard();
