import type { Board, Card, Command } from '@aegis/domain/schema';
import { CommandSchema, JsonRecordSchema } from '@aegis/domain/schema';
// Preserve identity, order and every incident connector when a shape becomes an editable path.
export function shapePathCommands(board: Board, card: Card): Command[] {
  const props = JsonRecordSchema.parse(card.props ?? {}); delete props.shape;
  return [{ op: 'delete', id: card.id }, CommandSchema.parse({ ...card, op: 'create', type: 'path', newId: card.id, props }), { op: 'order', ids: [card.id], to: board.cards.findIndex(candidate => candidate.id === card.id) }, ...board.links.filter(link => link.a === card.id || link.b === card.id).flatMap((link): Command[] => {
    const { id, a, b, label, ...style } = link;
    return [{ op: 'connect', a, b, ...(label !== undefined ? { label } : {}), newId: id }, ...(Object.keys(style).length ? [{ op: 'link_update' as const, id, set: JsonRecordSchema.parse(style) }] : [])];
  })];
}
