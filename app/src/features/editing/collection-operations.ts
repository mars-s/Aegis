import { CardSchema } from '@aegis/domain';
// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import type { Board, Card, Command } from '@aegis/domain';
import { collectionLayout, columns } from '@aegis/domain/collection';
import type { Point } from './operations.js';
export { collectionLayout };
export function collectionDrop(board: Board, cards: readonly Card[], point: Point): Command[] {
  if (cards.some(card => card.type === 'coll')) return [];
  const moving = new Set(cards.map(card => card.id));
  const target = [...board.cards].reverse().find(card => card.type === 'coll' && !moving.has(card.id) && !card.props?.locked && !card.props?.hidden && point.y > card.y && point.y < card.y + card.h + 70 && point.x > card.x && point.x < card.x + card.w + (point.y < card.y + card.h ? 70 : 0));
  const commands: Command[] = [];
  for (const parent of board.cards.filter(card => card.type === 'coll' && !moving.has(card.id) && card.id !== target?.id && card.props?.kids?.some(id => moving.has(id)))) commands.push(...collectionLayout(board, parent, parent.props?.kids?.filter(id => !moving.has(id))));
  if (!target) return [...commands, ...cards.filter(card => board.cards.some(parent => parent.type === 'coll' && parent.id === card.parent && !moving.has(parent.id))).map(card => ({ op: 'update', id: card.id, set: { parent: '' } } satisfies Command))];
  const side = point.x >= target.x + target.w, width = target.w + (side ? 244 : 0), cols = columns(width), cw = (width - 24 - (cols - 1) * 16) / cols;
  const col = side ? cols - 1 : Math.max(0, Math.min(cols - 1, Math.floor((point.x - target.x - 12) / (cw + 16))));
  const kids = (target.props?.kids ?? []).filter(id => !moving.has(id)), colOf = { ...target.props?.colOf }, byId = new Map(board.cards.map(card => [card.id, card]));
  for (const id of kids) if (colOf[id] === undefined) colOf[id] = Math.max(0, Math.min(cols - 1, Math.round(((byId.get(id)?.x ?? target.x + 12) - target.x - 12) / (cw + 16)) || 0));
  const inColumn = kids.filter(id => colOf[id] === col), above = inColumn.filter(id => { const card = byId.get(id); return card && card.y + card.h / 2 < point.y; });
  const last = above.at(-1), first = inColumn[0], index = last ? kids.indexOf(last) + 1 : first ? kids.indexOf(first) : kids.length;
  kids.splice(index, 0, ...cards.map(card => card.id)); for (const card of cards) colOf[card.id] = col;
  return [...commands, ...collectionLayout(board, CardSchema.parse({ ...target, props: { ...target.props, colOf } }), kids, width)];
}
