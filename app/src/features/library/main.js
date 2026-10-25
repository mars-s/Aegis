// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { registerRenderer, registerDragHandler } from '../../canvas/engine.js';
import { registerTool, registerBoardMenu, registerCardMenu } from '../registry';
import { createMenu } from '../../chrome/menu.js';
import { openLibraryBoard, createLibraryBoard, loadLibraryBoard, renameLibraryBoard } from './navigation.js';
import { boardPreview, escapeHtml as esc } from './preview.js';
import { frameworks, starters, templateCommands, expandTemplateDrag, templateDropCommands } from './templates.js';
registerDragHandler('template-groups', { start: expandTemplateDrag, end: templateDropCommands });
const cleanup = new WeakMap();
registerRenderer('canvas', {
  render(el, card) {
    el.innerHTML = '<div class="canvas-card"><div class="canvas-preview"></div><div class="canvas-title" contenteditable="plaintext-only" role="textbox" aria-label="Canvas name"></div></div>';
    const title = el.querySelector('.canvas-title'); title.textContent = card.text || 'Canvas';
    const refresh = async () => {
      try { const b = await loadLibraryBoard(card.props?.board); if (b && el.isConnected) { if (document.activeElement !== title) title.textContent = b.name; el.querySelector('.canvas-preview').innerHTML = boardPreview(b); } } catch { if (el.isConnected) el.querySelector('.canvas-preview').textContent = 'Canvas unavailable'; }
    };
    title.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); title.blur(); } if (e.key === 'Escape') { e.preventDefault(); title.textContent = card.text || 'Canvas'; title.dataset.cancel = 'true'; title.blur(); } });
    title.addEventListener('dblclick', e => e.stopPropagation());
    title.addEventListener('blur', async () => {
      if (title.dataset.cancel) { delete title.dataset.cancel; return refresh(); }
      const name = title.textContent.trim(); if (name) await renameLibraryBoard(card.props?.board, name);
    });
    document.addEventListener('library-refreshed', refresh); cleanup.set(el, () => document.removeEventListener('library-refreshed', refresh)); refresh();
  },
  drop(el) { cleanup.get(el)?.(); cleanup.delete(el); },
  open(card) { if (card.props?.board) openLibraryBoard(card.props.board); },
  interactive: '.canvas-title',
});
registerRenderer('template-group', {
  render(el, card, api) {
    el.innerHTML = `<div class="template-group-title" contenteditable="plaintext-only" role="textbox" aria-label="Group name">${esc(card.text)}</div>`;
    const title = el.firstElementChild;
    title.onblur = () => { if (title.textContent.trim() !== card.text) api.apply([{ op: 'update', id: card.id, set: { text: title.textContent.trim() } }]); };
    title.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') title.textContent = card.text; title.blur(); } };
  }, interactive: '.template-group-title',
});
registerTool({ id: 'canvas', title: 'Canvas', group: 'Library', icon: '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 5h6M5 8h4"/>',
  place(at, ctx) {
    const parent = ctx.canvas.board.id;
    createLibraryBoard({ name: 'Untitled canvas', boardParent: parent, at }).then(() => openLibraryBoard(parent)).catch(e => ctx.toast(e.message));
  },
});
let templateMenu;
function showTemplates(ctx) {
  templateMenu ??= createMenu();
  const button = document.querySelector('[data-tool="templates"]'), rect = button?.getBoundingClientRect();
  const items = Object.entries(frameworks).map(([key, value]) => ({ title: value.name, section: 'Add to this board', run() {
    const commands = templateCommands(key, ctx.canvas.board);
    ctx.apply(commands, () => { const ids = commands.filter(c => c.op === 'create').map(c => c.newId); ctx.canvas.select(ids); ctx.canvas.frameIds(ids); });
  } }));
  for (const key of Object.keys(starters)) items.push({ title: key, section: 'Start a new board', run: async () => {
    try {
      const b = await createLibraryBoard({ name: key });
      const result = await ctx.host.post(`/boards/${b.id}/batch`, { commands: templateCommands(key, b) });
      if (!result.ok) throw new Error(result.errors?.[0]?.reason || 'Could not create the starter.');
      await openLibraryBoard(b.id); ctx.canvas.fit();
    } catch (e) { ctx.toast(e.message); }
  } });
  templateMenu.show(rect?.right + 8 || 300, rect?.top || 80, items);
  // createMenu separates sections; labels make the two kinds of template clear.
  const el = [...document.querySelectorAll('.ctx-menu')].find(el => !el.hidden && el.querySelector('button')?.textContent === 'Affinity map');
  if (el) {
    const heading = text => { const div = document.createElement('div'); div.className = 'template-menu-heading'; div.textContent = text; return div; };
    el.prepend(heading('Add to this board')); el.querySelector('.ctx-sep')?.after(heading('Start a new board'));
  }
}
registerTool({ id: 'templates', title: 'Templates', group: 'Library', icon: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><path d="M9 11.5h5M11.5 9v5"/>', activate: showTemplates });
registerBoardMenu({ id: 'templates', title: 'Templates…', section: 'Add', run: showTemplates });
registerCardMenu({ id: 'open-canvas', title: 'Open this canvas', when: (ctx, ids) => ids.length === 1 && ctx.canvas.board.cards.find(c => c.id === ids[0])?.type === 'canvas', run(ctx, ids) { const c = ctx.canvas.board.cards.find(c => c.id === ids[0]); openLibraryBoard(c.props.board); } });
