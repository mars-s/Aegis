// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
export function layerParents(board) {
  const byId = new Map(board.cards.map(c => [c.id, c])), parents = new Map();
  const sections = board.cards.filter(c => c.type === 'section').sort((a, b) => a.w * a.h - b.w * b.h);
  for (const c of board.cards) if (byId.has(c.parent)) parents.set(c.id, c.parent);
  for (const c of board.cards) if (c.type === 'coll') for (const kid of c.props?.kids ?? []) if (byId.has(kid) && kid !== c.id) parents.set(kid, c.id);
  for (const c of board.cards) {
    if (parents.has(c.id)) continue;
    const x = c.x + c.w / 2, y = c.y + c.h / 2;
    const section = sections.find(s => s.id !== c.id && (c.type !== 'section' || s.w * s.h > c.w * c.h) && x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h);
    if (section) parents.set(c.id, section.id);
  }
  // Malformed imported ownership must not make the layer tree disappear into a cycle.
  for (const id of parents.keys()) { const seen = new Set([id]); let parent = parents.get(id); while (parent) { if (seen.has(parent)) { parents.delete(id); break; } seen.add(parent); parent = parents.get(parent); } }
  return parents;
}
export function layerDescendants(board, ids, parents = layerParents(board)) {
  const children = new Map();
  for (const [id, parent] of parents) { if (!children.has(parent)) children.set(parent, []); children.get(parent).push(id); }
  const out = new Set(ids), queue = [...ids];
  for (const id of queue) for (const child of children.get(id) ?? []) if (!out.has(child)) { out.add(child); queue.push(child); }
  return board.cards.filter(c => out.has(c.id));
}
