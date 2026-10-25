import { registerTool, registerPanel, registerCardMenu, registerBoardMenu } from '../registry';
import { installSwatch, mountColours, createSwatch, openSwatch, colourEditor } from './ui.js';
import './style.css';
installSwatch();
registerPanel({ id: 'board-colours', title: 'Board colours', mount: mountColours });
registerTool({ id: 'swatch', title: 'Colour swatch', group: 'media', icon: '<circle cx="8" cy="8" r="5"/><path d="M8 3v10M3 8h10"/>', place: (at, ctx) => createSwatch(ctx, at) });
registerCardMenu({ id: 'swatch-edit', title: 'Change colour', when: (ctx, ids) => ids.length === 1 && ctx.canvas.board.cards.find((c: { id: string; type: string }) => c.id === ids[0])?.type === 'swatch', run(ctx, ids) {
  openSwatch(ctx.canvas.board.cards.find((c: { id: string; type: string }) => c.id === ids[0]), { get board() { return ctx.canvas.board; }, apply: ctx.apply, setProps: (id: string, props: object) => ctx.apply([{ op: 'update', id, set: { props } }]) });
} });
registerBoardMenu({ id: 'board-background', title: 'Board background colour', run(ctx) { colourEditor({ hex: ctx.canvas.board.bg || '#ffffff', name: null, board: () => ctx.canvas.board, apply: (p: { hex: string }) => ctx.apply([{ op: 'board_set', set: { bg: p.hex } }]) }); } });
registerBoardMenu({ id: 'board-background-reset', title: 'Restore default background', when: ctx => !!ctx.canvas.board.bg, run: ctx => ctx.apply([{ op: 'board_set', set: { bg: null } }]) });
