// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// Collection layout: members stack into columns inside the collection (props.colOf keeps a card's
// column; otherwise it joins the shortest). Shared by the canvas and the agent host, so a
// collection an agent makes looks the same as one made by hand.
export const columns = width => Math.max(1, Math.floor((width - 24) / 244));
export function collectionLayout(board, coll, kids = coll.props?.kids ?? [], width = coll.w) {
  const byId = new Map(board.cards.map(c => [c.id, c]));
  const children = [...new Set(kids)].filter(id => id !== coll.id).map(id => byId.get(id)).filter(Boolean);
  const cols = columns(width), cw = (width - 24 - (cols - 1) * 16) / cols;
  const top = coll.y + (coll.props?.head === false ? 12 : 72), heights = Array(cols).fill(top), colOf = {};
  const commands = children.map(c => {
    const saved = coll.props?.colOf?.[c.id];
    const col = Number.isInteger(saved) && saved >= 0 && saved < cols ? saved : heights.indexOf(Math.min(...heights));
    colOf[c.id] = col;
    const h = c.type === 'image' ? Math.max(1, c.h * cw / c.w) : c.h;
    const set = { parent: coll.id, x: coll.x + 12 + col * (cw + 16), y: heights[col], w: cw, h, rot: 0 };
    heights[col] += h + 16;
    return { op: 'update', id: c.id, set };
  });
  commands.push({ op: 'update', id: coll.id, set: { w: width, h: Math.max(coll.props?.head === false ? 108 : 120, Math.max(...heights) - coll.y), props: { kids: children.map(c => c.id), cols, colOf } } });
  const first = board.cards.findIndex(c => colOf[c.id] !== undefined);
  if (first >= 0 && board.cards.findIndex(c => c.id === coll.id) > first) commands.push({ op: 'order', ids: [coll.id], to: first });
  return commands;
}
