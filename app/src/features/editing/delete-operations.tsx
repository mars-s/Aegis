import { CommandSchema } from '@aegis/domain';
import type { Board, BoardId, Card, CardId, Command, Link } from '@aegis/domain';
import type { FeatureContext } from '../../composition.js';
import { effectiveFlag } from './operations.js';
import { layerDescendants } from './layers.js';
export interface DeletedSelection { readonly boardId: BoardId; readonly ids: readonly CardId[]; readonly cards: readonly Card[]; readonly links: readonly Link[]; readonly before: Board }
export function deleteSelection(context: FeatureContext): DeletedSelection | null {
  if (!context.closeEditor()) return null;
  const board = context.workspace.scene.snapshot(), selection = context.workspace.selection.getSnapshot();
  const cards = layerDescendants(board, selection).filter(card => !effectiveFlag(board, card, 'locked'));
  if (!cards.length) return null;
  const ids = cards.map(card => card.id), deleted = new Set(ids);
  const result = context.workspace.submit([{ op: 'delete', ids }]);
  if (result.kind === 'rejected') return null;
  context.workspace.act({ kind: 'select', ids: [] });
  return { boardId: board.id, ids, cards, links: board.links.filter(link => deleted.has(link.a) || deleted.has(link.b)), before: board };
}
export function restoreDeleted(current: Board, receipt: DeletedSelection): Command[] {
  if (current.id !== receipt.boardId) return [];
  const present = new Set(current.cards.map(card => card.id)), missing = receipt.cards.filter(card => !present.has(card.id)), restoring = new Set(missing.map(card => card.id)), available = new Set([...present, ...restoring]);
  const commands: Command[] = missing.map(({ id, parent, ...card }) => CommandSchema.parse({ op: 'create', ...card, ...(parent && available.has(parent) ? { parent } : {}), newId: id }));
  for (const card of missing) commands.push({ op: 'order', ids: [card.id], to: Math.min(receipt.before.cards.findIndex(entry => entry.id === card.id), current.cards.length + missing.length - 1) });
  for (const parent of receipt.before.cards) {
    const live = current.cards.find(card => card.id === parent.id);
    if (!live || !parent.props?.kids?.some(id => restoring.has(id))) continue;
    const kids = [...live.props?.kids ?? []], colOf = { ...live.props?.colOf };
    parent.props.kids.forEach((id, index) => { if (restoring.has(id) && !kids.includes(id)) { kids.splice(Math.min(index, kids.length), 0, id); const column = parent.props?.colOf?.[id]; if (column !== undefined) colOf[id] = column; } });
    commands.push({ op: 'update', id: parent.id, set: { props: { kids, colOf } } });
  }
  for (const { id, a, b, label, ...style } of receipt.links) {
    if ((!restoring.has(a) && !restoring.has(b)) || !available.has(a) || !available.has(b) || current.links.some(link => link.id === id)) continue;
    commands.push({ op: 'connect', newId: id, a, b, ...(label === undefined ? {} : { label }) });
    if (Object.keys(style).length) commands.push(CommandSchema.parse({ op: 'link_update', id, set: style }));
  }
  return commands;
}
