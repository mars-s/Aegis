import './wireframe.css';
import type { Ctx } from '../registry';
import { registerTool, registerPanel, registerCommand, registerCardMenu, registerBoardMenu } from '../registry';
import { registerDragHandler } from '../../canvas/engine.js';
import { installRenderers } from './render.js';
import { selectForDrag, expandDrag, dropCommands } from './model.js';
import { mountPanel, openPanel, placementPointer, snapConfigured, createSection, setGroup, beginTool } from './panel.js';

installRenderers();
registerDragHandler('wireframe', {
  select: selectForDrag,
  start: expandDrag,
  snap: snapConfigured,
  end: dropCommands,
});
registerTool({ id: 'wireframe', title: 'Wireframe', icon: '<rect x="3" y="1" width="10" height="14" rx="2"/><path d="M6 12h4"/>', group: 'design', activate: openPanel, pointer: placementPointer });
registerPanel({ id: 'wireframe', title: 'Wireframe', side: 'right', mount: mountPanel });
registerCommand({ id: 'wireframe.section', title: 'Create section', keys: 'mod+alt+g', run: createSection });
registerCardMenu({ id: 'wireframe.section', title: 'Create section', run: createSection });
registerCardMenu({ id: 'wireframe.ungroup', title: 'Ungroup piece', run: (ctx, ids) => setGroup(ctx, ids, false), when: (ctx, ids) => ctx.canvas.board.cards.some((c: { id: string; group?: string }) => ids.includes(c.id) && c.group) });
registerBoardMenu({ id: 'wireframe.open', title: 'Wireframe design panel', run: openPanel });

registerCommand({ id: 'wireframe.text', title: 'Wireframe text', keys: 'x', run: () => beginTool('text') });
registerCommand({ id: 'wireframe.box', title: 'Wireframe box', keys: 'shift+r', run: () => beginTool('box') });
registerCommand({ id: 'wireframe.group', title: 'Group pieces', keys: 'mod+g', when: ctx => ctx.selection().length > 1, run: ctx => setGroup(ctx, ctx.selection(), true) });
registerCommand({ id: 'wireframe.ungroup', title: 'Ungroup pieces', keys: 'mod+shift+g', when: ctx => ctx.selection().length > 0, run: ctx => setGroup(ctx, ctx.selection(), false) });
function orderContents(ctx: Ctx, to: 'front' | 'back') {
  const cards = ctx.canvas.board.cards.filter((c: { id: string }) => ctx.selection().includes(c.id));
  ctx.apply([{ op: 'order', ids: expandDrag(cards, ctx.canvas.board).map((c: { id: string }) => c.id), to }]);
}
for (const [keys, to] of Object.entries({ ']': 'front', '[': 'back' })) {
  if (to !== 'front' && to !== 'back') continue;
  registerCommand({ id: `wireframe.order.${to}`, title: to === 'front' ? 'Bring contents to front' : 'Send contents to back', keys, when: ctx => ctx.selection().length > 0, run: ctx => orderContents(ctx, to) });
}
