import { effectiveFlag } from '../editing/model.js';
import { cardTitle } from '@aegis/domain/summary';
const containers = new Set(['frame', 'coll', 'template-group']);
export function boardClusters(board) {
  const cards = board.cards.filter(c => !effectiveFlag(board, c, 'hidden'));
  const byId = new Map(cards.map(c => [c.id, c]));
  const parent = new Map(cards.filter(c => c.parent).map(c => [c.id, c.parent]));
  for (const c of cards) for (const id of c.props?.kids ?? []) if (!parent.has(id)) parent.set(id, c.id);
  const anchors = cards.filter(c => cardTitle(c) && (containers.has(c.type) || c.type === 'title'));
  const titles = anchors.filter(a => a.type === 'title');
  const groups = new Map(anchors.map(c => [c.id, { id: c.id, name: cardTitle(c), cards: [c] }]));
  const fallback = { id: 'board', name: board.name || 'This board', cards: [] };
  for (const c of cards) {
    if (groups.has(c.id)) continue;
    let ancestor = parent.get(c.id), group; const seen = new Set();
    while (ancestor && !seen.has(ancestor)) {
      seen.add(ancestor); if (groups.has(ancestor)) { group = groups.get(ancestor); break; }
      ancestor = parent.get(ancestor);
    }
    if (!group) {
      let distance = Infinity;
      for (const a of titles) {
        const dx = c.x - a.x, dy = c.y - a.y;
        const d = dx * dx + dy * dy * (dy < 0 ? 4 : 1);
        if (d < distance) { distance = d; group = groups.get(a.id); }
      }
    }
    (group || fallback).cards.push(c);
  }
  if (fallback.cards.length) groups.set('board', fallback);
  return [...groups.values()].map(group => {
    // Include nested groups in the parent's frame and count, without duplicating the windows.
    const members = new Set(group.cards.map(c => c.id));
    for (const c of cards) {
      let id = parent.get(c.id); const seen = new Set();
      while (id && !seen.has(id)) { seen.add(id); if (id === group.id) { members.add(c.id); break; } id = parent.get(id); }
    }
    const all = [...members].map(id => byId.get(id)).filter(Boolean);
    const windows = all.filter(c => c.type !== 'title' && !containers.has(c.type));
    return { id: group.id, name: group.name, ids: all.map(c => c.id), count: windows.length,
      x: Math.min(...all.map(c => c.x)), y: Math.min(...all.map(c => c.y)),
      right: Math.max(...all.map(c => c.x + c.w)), bottom: Math.max(...all.map(c => c.y + c.h)) };
  });
}
