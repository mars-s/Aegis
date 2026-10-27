import { registerRenderer, registerCardDropTarget } from '../../canvas/engine.js';
import { registerTool, registerCardMenu, registerCommand } from '../registry';
import { openDocument, copyIntoDocument, currentDocument, resolveDocumentDrop, installDocumentClipboard } from './editor.js';
import { generateHTML, generateJSON } from '@tiptap/core';
import { extensions } from './extensions.js';
import { markdownHTML, migrateTitle } from '@aegis/domain/content';
export { registerDocRewriter } from './editor.js';
const icon = '<path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3M6 7h4M6 9.5h4M6 12h2"/>';
// A document on the canvas is a window: a 36px strip, then the document itself as a quiet read-only preview.
// Older 56px pills keep the pill look until someone resizes them into a window.
const PILL_HEIGHT = 80;
let previewExtensions;
function docPreview(card) {
  try {
    const ext = previewExtensions ??= extensions();
    const original = card.props?.doc ?? generateJSON(markdownHTML(card.props?.body || ''), ext);
    const doc = card.props?.docTitleMigrated ? original : migrateTitle(original, card.text);
    return generateHTML(doc, ext);
  } catch { return markdownHTML(card.props?.body || ''); }
}
registerRenderer('doc', {
  render(el, card) {
    const name = card.text || 'Untitled document';
    el.setAttribute('aria-label', `${name}, document. Double-click or press Return to open.`);
    el.classList.toggle('docs-has-content', !!card.props?.body?.trim());
    if (card.h < PILL_HEIGHT) {
      const page = document.createElement('span'); page.className = 'docs-card-icon'; page.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">${icon}</svg>`;
      const title = document.createElement('span'); title.className = 'docs-card-title'; title.textContent = name;
      el.classList.add('doc-pill'); el.append(page, title); return;
    }
    el.classList.add('doc-window');
    el.innerHTML = `<header class="win-strip doc-strip"><span class="win-name"></span><span class="win-kind">\u00a0· Document</span><button class="win-open" type="button">Open</button></header><div class="doc-view"><article class="doc-page"></article></div>`;
    el.querySelector('.win-name').textContent = name;
    el.querySelector('.win-open').setAttribute('aria-label', `Open ${name}`);
    const page = el.querySelector('.doc-page');
    page.innerHTML = docPreview(card);
    if (!page.textContent.trim()) page.innerHTML = '<p class="doc-empty">Empty document. Open it to start writing.</p>';
    el.querySelector('.win-open').onclick = event => { if (globalThis.aegisCtx) openDocument(card, globalThis.aegisCtx, { keyboard: event.detail === 0 }); };
  },
  open(card) { if (globalThis.aegisCtx) openDocument(card, globalThis.aegisCtx); },
  interactive: '.win-open',
});
registerTool({
  id: 'doc', title: 'Doc (D)', key: 'd', icon, group: 'write',
  place(at, ctx) {
    ctx.apply([{ op: 'create', type: 'doc', text: '', x: Math.round(at.x - 380), y: Math.round(at.y - 60), props: { doc: { type: 'doc', content: [{ type: 'paragraph' }] }, body: '' }, ref: 'doc' }], created => {
      ctx.canvas.select([created.doc]);
      const card = ctx.canvas.board.cards.find(c => c.id === created.doc); if (card) openDocument(card, ctx);
    });
  },
});
registerCardMenu({ id: 'doc-open', title: 'Open document', section: 'Document', when: (ctx, ids) => ids.length === 1 && ctx.canvas.board.cards.some(c => c.id === ids[0] && c.type === 'doc'), run: (ctx, ids) => openDocument(ctx.canvas.board.cards.find(c => c.id === ids[0]), ctx) });
registerCardMenu({ id: 'doc-copy', title: 'Copy into open document', section: 'Document', when: () => !!currentDocument(), run: (ctx, ids) => copyIntoDocument(ctx.canvas.board.cards.filter(c => ids.includes(c.id)), ctx) });
registerCommand({ id: 'doc-open', title: 'Open selected document', keys: 'enter', when: ctx => !document.activeElement?.closest('.side-editor') && ctx.selection().length === 1 && ctx.canvas.board.cards.some(c => c.id === ctx.selection()[0] && c.type === 'doc'), run: ctx => openDocument(ctx.canvas.board.cards.find(c => c.id === ctx.selection()[0]), ctx, { keyboard: true }) });
registerCardDropTarget(resolveDocumentDrop);
installDocumentClipboard();
