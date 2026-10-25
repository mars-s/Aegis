// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { collectionLayout, columns } from '../../lib/board/collection.js';
export { collectionLayout };

export function collectionDrop(board, cards, point) {
  if (cards.some(c => c.type === 'coll')) return [];
  const moving = new Set(cards.map(c => c.id));
  const target = [...board.cards].reverse().find(c => c.type === 'coll' && !moving.has(c.id) && !c.props?.locked && !c.props?.hidden && point.y > c.y && point.y < c.y + c.h + 70 && point.x > c.x && point.x < c.x + c.w + (point.y < c.y + c.h ? 70 : 0));
  const commands = [];
  for (const parent of board.cards.filter(c => c.type === 'coll' && !moving.has(c.id) && c.id !== target?.id && c.props?.kids?.some(id => moving.has(id)))) {
    commands.push(...collectionLayout(board, parent, parent.props.kids.filter(id => !moving.has(id))));
  }
  if (!target) return [...commands, ...cards.filter(c => board.cards.some(p => p.type === 'coll' && p.id === c.parent && !moving.has(p.id))).map(c => ({ op: 'update', id: c.id, set: { parent: '' } }))];
  const side = point.x >= target.x + target.w, width = target.w + (side ? 244 : 0), cols = columns(width), cw = (width - 24 - (cols - 1) * 16) / cols;
  const col = side ? cols - 1 : Math.max(0, Math.min(cols - 1, Math.floor((point.x - target.x - 12) / (cw + 16))));
  const kids = (target.props?.kids ?? []).filter(id => !moving.has(id)), colOf = { ...target.props?.colOf };
  // Older boards have no column map. Recover their current columns from card positions.
  const byId = new Map(board.cards.map(c => [c.id, c]));
  for (const id of kids) if (colOf[id] == null) colOf[id] = Math.max(0, Math.min(cols - 1, Math.round((byId.get(id)?.x - target.x - 12) / (cw + 16)) || 0));
  const inColumn = kids.filter(id => colOf[id] === col), above = inColumn.filter(id => { const c = byId.get(id); return c && c.y + c.h / 2 < point.y; });
  const index = above.length ? kids.indexOf(above.at(-1)) + 1 : inColumn.length ? kids.indexOf(inColumn[0]) : kids.length;
  kids.splice(index, 0, ...cards.map(c => c.id)); cards.forEach(c => { colOf[c.id] = col; });
  return [...commands, ...collectionLayout(board, { ...target, props: { ...target.props, colOf } }, kids, width)];
}
