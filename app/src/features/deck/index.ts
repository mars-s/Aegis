import './deck.css';
import { registerRenderer } from '../../canvas/engine.js';
import { registerTool, registerCommand, registerCardMenu } from '../registry';
import { renderDeck, dropDeck, openDeckCard } from './renderer.js';
import { openDeck, findDeck, installDeckOpenEvent } from './editor.js';
import { newSlide } from './slides.js';

registerRenderer('deck', { render: renderDeck, drop: dropDeck, open: openDeckCard, interactive: '.deck-open, .deck-thumb, .deck-source' });
registerTool({
  id: 'deck', title: 'Slides (B)', key: 'b', group: 'write',
  icon: '<rect x="2.5" y="3.5" width="11" height="7.5" rx="1.2"/><path d="M5.5 13.5h5"/>',
  place(at, ctx) {
    ctx.apply([{ op: 'create', type: 'deck', text: 'Untitled deck', x: Math.round(at.x - 235), y: Math.round(at.y - 176), props: { slides: [{ ...newSlide(), title: 'Your next idea', sub: 'Click to write' }], current: 0 }, ref: 'deck' }], created => {
      ctx.canvas.select([created.deck]);
      const card = findDeck(ctx, created.deck);
      if (card) openDeck(card, ctx);
    });
  },
});
registerCommand({
  id: 'deck-open', title: 'Open selected deck', keys: 'enter',
  when: ctx => !document.activeElement?.closest('.deck-panel, .ctx-menu') && ctx.selection().length === 1 && !!findDeck(ctx, ctx.selection()[0]),
  run: ctx => openDeck(findDeck(ctx, ctx.selection()[0]), ctx, { viaKey: true }),
});
registerCardMenu({
  id: 'deck-open', title: 'Open deck', section: 'Slides',
  when: (ctx, ids) => ids.length === 1 && !!findDeck(ctx, ids[0]),
  run: (ctx, ids) => openDeck(findDeck(ctx, ids[0]), ctx),
});
installDeckOpenEvent();
