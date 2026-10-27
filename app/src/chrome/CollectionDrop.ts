import { applyBatch } from '@aegis/domain';
import type { CardDropRequest, CardDropTarget } from '@aegis/scene';
import type { FeatureContext } from '../composition.js';
import { collectionDrop } from '../features/editing/registration.js';

export function resolveCollectionDrop(context: FeatureContext, request: CardDropRequest): CardDropTarget | null {
  const engine = context.engine(), stage = request.element?.closest<HTMLElement>('#stage');
  if (!engine || !stage || !request.cards.length || request.cards.some(card => card.type === 'coll')) return null;
  const board = context.workspace.scene.snapshot();
  if (!board.cards.some(card => card.type === 'coll')) return null;
  const rect = stage.getBoundingClientRect();
  const point = engine.screenToWorld({ x: request.point.x - rect.left, y: request.point.y - rect.top });
  const ids = new Set(request.cards.map(card => card.id));
  return {
    highlight: request.element?.closest<HTMLElement>('.card[data-type="coll"]') ?? stage,
    run(moves) {
      const current = context.workspace.scene.snapshot();
      if (current.id !== board.id) return false;
      const proposed = applyBatch(current, { commands: moves });
      if (!proposed.ok) return false;
      const members = proposed.board.cards.filter(card => ids.has(card.id));
      const membership = collectionDrop(proposed.board, members, point);
      return context.workspace.submit([...moves, ...membership]).kind === 'applied';
    },
  };
}
