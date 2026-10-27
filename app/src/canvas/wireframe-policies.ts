import type { Board } from '@aegis/domain/schema';
import type { CanvasAttachment } from '@aegis/scene';
import { selectForDrag, expandDrag, snapDrag, dropCommands } from '../features/wireframe/commands.js';

type Policies = Pick<CanvasAttachment, 'selectForDrag' | 'expandDrag' | 'snapDrag' | 'dropCommands'>;
export function wireframePolicies(board: () => Board): Policies {
  return {
    selectForDrag: (ids, hit, modifiers) => selectForDrag(ids, hit, board(), { shiftKey: modifiers.shift, metaKey: modifiers.bypass }),
    expandDrag: (ids, modifiers) => {
      const current = board();
      return expandDrag(current.cards.filter(card => ids.includes(card.id)), current, { shiftKey: modifiers.shift, metaKey: modifiers.bypass }).map(card => card.id);
    },
    snapDrag: request => {
      const result = snapDrag(request.start.map(entry => ({ c: entry.card, x: entry.bounds.x, y: entry.bounds.y })), request.delta.x, request.delta.y, board(), { z: request.zoom }, { grid: localStorage.getItem('aegis:wireframe-grid') === 'on', disabled: request.bypass });
      const anchor = request.start[0]?.bounds;
      const delta = anchor && !request.bypass && localStorage.getItem('aegis:snap') === 'on'
        ? { x: Math.round((anchor.x + result.dx) / 24) * 24 - anchor.x, y: Math.round((anchor.y + result.dy) / 24) * 24 - anchor.y }
        : { x: result.dx, y: result.dy };
      return { delta, guides: result.guides };
    },
    dropCommands: request => {
      const moved = new Map(request.cards.map(card => [card.id, card]));
      return dropCommands(request.cards, { cards: board().cards.map(card => moved.get(card.id) ?? card) }, request.kind);
    },
  };
}
