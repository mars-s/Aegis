// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// Collection layout: members stack into columns inside the collection. Shared by the canvas and the
// agent host, so a collection an agent makes looks the same as one made by hand.
export function collectionLayout(board, coll, kids = coll.props?.kids ?? [], width = coll.w) {
  const children = kids.map(id => board.cards.find(c => c.id === id)).filter(Boolean);
  const cols = Math.max(1, Math.floor((width - 24) / 244)), cw = (width - 24 - (cols - 1) * 16) / cols;
  const heights = Array(cols).fill(coll.y + 72);
  const commands = children.map((c, i) => { const col = i % cols, x = coll.x + 12 + col * (cw + 16), y = heights[col]; heights[col] += c.h + 16;
    return { op: 'update', id: c.id, set: { parent: coll.id, x, y, w: cw, rot: 0 } }; });
  commands.push({ op: 'update', id: coll.id, set: { w: width, h: Math.max(120, Math.max(...heights) - coll.y), props: { kids: children.map(c => c.id), cols } } });
  return commands;
}
