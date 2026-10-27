import type {LegacyBoard, LegacyCard, Command, CardId} from './schema.js';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// Collection layout: members stack into columns inside the collection (props.colOf keeps a card's
// column; otherwise it joins the shortest). Shared by the canvas and the agent host, so a
// collection an agent makes looks the same as one made by hand.
export const columns = (width: number) => Math.max(1, Math.floor((width - 24) / 244));
export function collectionLayout(board: LegacyBoard, coll: LegacyCard, kids: CardId[] = coll.props?.kids ?? [], width = Number(coll.w)): Command[] {
  const byId = new Map(board.cards.map(c => [c.id, c]));
  const children = [...new Set(kids)].filter(id => id !== coll.id).map(id => byId.get(id)).filter((card): card is LegacyCard => card !== undefined);
  const cols = columns(width), cw = (width - 24 - (cols - 1) * 16) / cols;
  const top = Number(coll.y) + (coll.props?.head === false ? 12 : 72), heights = Array.from({length: cols}, () => top), colOf: Record<string, number> = {};
  const commands: Command[] = children.map(c => {
    const saved = coll.props?.colOf?.[c.id];
    const col = typeof saved === 'number' && Number.isInteger(saved) && saved >= 0 && saved < cols ? saved : heights.indexOf(Math.min(...heights));
    colOf[c.id] = col;
    const h = c.type === 'image' ? Math.max(1, Number(c.h) * cw / Number(c.w)) : Number(c.h);
    const set = { parent: coll.id, x: Number(coll.x) + 12 + col * (cw + 16), y: heights[col] ?? top, w: cw, h, rot: 0 };
    heights[col] = (heights[col] ?? top) + h + 16;
    return { op: 'update' as const, id: c.id, set };
  });
  commands.push({ op: 'update', id: coll.id, set: { w: width, h: Math.max(coll.props?.head === false ? 108 : 120, Math.max(...heights) - Number(coll.y)), props: { kids: children.map(c => c.id), cols, colOf } } });
  const first = board.cards.findIndex(c => colOf[c.id] !== undefined);
  if (first >= 0 && board.cards.findIndex(c => c.id === coll.id) > first) commands.push({ op: 'order', ids: [coll.id], to: first });
  return commands;
}
