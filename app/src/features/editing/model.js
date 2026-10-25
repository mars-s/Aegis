// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
export { collectionLayout } from '../../lib/board/collection.js';
export const uid = () => Math.random().toString(36).slice(2, 12).padEnd(8, '0');
export const bounds = cards => ({
  x: Math.min(...cards.map(c => c.x)), y: Math.min(...cards.map(c => c.y)),
  right: Math.max(...cards.map(c => c.x + c.w)), bottom: Math.max(...cards.map(c => c.y + c.h)),
});
export function descendants(board, ids) {
  const out = new Set(ids);
  for (let changed = true; changed;) {
    changed = false;
    for (const c of board.cards) if (out.has(c.parent) || [...out].some(id => board.cards.find(p => p.id === id)?.props?.kids?.includes(c.id))) {
      if (!out.has(c.id)) { out.add(c.id); changed = true; }
    }
  }
  return board.cards.filter(c => out.has(c.id));
}
// Child id -> cards that contain it (screen parent or collection kid). Batches clone the board, so a
// cards array is rebuilt rather than edited; the length check covers anything that pushes in place.
const parentIndexes = new WeakMap();
function parentsOf(board, card) {
  let index = parentIndexes.get(board.cards);
  if (!index || index.length !== board.cards.length) {
    const byId = new Map(board.cards.map(c => [c.id, c])), parents = new Map();
    const add = (child, parent) => { if (!parent) return; const list = parents.get(child); if (list) list.push(parent); else parents.set(child, [parent]); };
    for (const c of board.cards) { if (c.parent) add(c.id, byId.get(c.parent)); for (const kid of c.props?.kids ?? []) add(kid, c); }
    index = { length: board.cards.length, parents }; parentIndexes.set(board.cards, index);
  }
  return index.parents.get(card.id) ?? [];
}
export function effectiveFlag(board, card, flag, seen = new Set()) {
  if (!card || seen.has(card.id)) return false;
  seen.add(card.id);
  if (card.props?.[flag]) return true;
  return parentsOf(board, card).some(c => effectiveFlag(board, c, flag, seen));
}
export function makeClip(board, ids) {
  const selected = board.cards.filter(c => ids.includes(c.id));
  const groups = new Set(selected.map(c => c.group).filter(Boolean));
  const cards = descendants(board, [...ids, ...board.cards.filter(c => groups.has(c.group)).map(c => c.id)]);
  const keep = new Set(cards.map(c => c.id));
  return structuredClone({ from: board.id, cards, links: board.links.filter(l => keep.has(l.a) && keep.has(l.b)), text: cards.map(c => [c.heading, c.text, ...(c.items ?? []).map(i => `${i.done ? '[x]' : '[ ]'} ${i.text}`), c.url].filter(Boolean).join('\n')).join('\n\n') });
}
export function cloneCommands(clip, board, centre, offset = 30) {
  if (!clip?.cards?.length) return { commands: [], ids: [] };
  const idMap = new Map(clip.cards.map(c => [c.id, uid()])), groupMap = new Map();
  const b = bounds(clip.cards), same = clip.from === board.id;
  const dx = same ? offset : centre.x - (b.x + b.right) / 2, dy = same ? offset : centre.y - (b.y + b.bottom) / 2;
  const copies = clip.cards.map(card => {
    const c = structuredClone(card); c.newId = idMap.get(c.id); delete c.id;
    c.x += dx; c.y += dy;
    if (c.group) { if (!groupMap.has(c.group)) groupMap.set(c.group, uid()); c.group = groupMap.get(c.group); }
    if (c.parent) c.parent = idMap.get(c.parent);
    if (c.props?.kids) c.props.kids = c.props.kids.map(id => idMap.get(id)).filter(Boolean);
    if (c.props?.colOf) c.props.colOf = Object.fromEntries(Object.entries(c.props.colOf).filter(([id]) => idMap.has(id)).map(([id, col]) => [idMap.get(id), col]));
    return { ...c, op: 'create' };
  });
  const links = (clip.links ?? []).flatMap(l => {
    const a = idMap.get(l.a), b = idMap.get(l.b); if (!a || !b) return [];
    const newId = uid();
    const set = Object.fromEntries(['bend', 'dash', 'arrow', 'colour', 'pa', 'pb'].filter(k => k in l).map(k => [k, l[k]]));
    return [{ op: 'connect', a, b, newId, label: l.label }, ...(Object.keys(set).length ? [{ op: 'link_update', id: newId, set }] : [])];
  });
  return { commands: [...copies, ...links], ids: [...idMap.values()] };
}
const snapshot = board => JSON.stringify({ cards: board.cards, links: board.links, tray: board.tray ?? [], palette: board.palette ?? [] });
export function createHistory({ read, apply, changed = () => {}, busy = () => false, delay = 350 }) {
  let boardId, states = [], index = -1, timer;
  function reset(board) { clearTimeout(timer); boardId = board.id; states = [snapshot(board)]; index = 0; changed(); }
  function flush() {
    clearTimeout(timer); const board = read(); if (!board) return;
    if (board.id !== boardId) return reset(board);
    if (busy()) { timer = setTimeout(flush, delay); return; }
    const next = snapshot(board); if (next === states[index]) return;
    states.splice(index + 1); states.push(next); if (states.length > 80) states.shift(); index = states.length - 1; changed();
  }
  return {
    observe(board) { if (board.id !== boardId) return reset(board); clearTimeout(timer); timer = setTimeout(flush, delay); },
    flush,
    travel(step) { flush(); const next = index + step; if (next < 0 || next >= states.length) return false; index = next; const { palette, ...state } = JSON.parse(states[index]); apply([{ op: 'restore', ...state }, { op: 'board_set', set: { palette } }]); changed(); return true; },
    get status() { return { undo: index > 0, redo: index < states.length - 1, length: states.length }; },
  };
}
export function arrange(board, ids, how) {
  const cards = board.cards.filter(c => ids.includes(c.id) && !effectiveFlag(board, c, 'locked'));
  const groups = new Map();
  for (const c of cards) { const key = c.group || c.id; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(c); }
  const units = [...groups.values()].map(cards => ({ cards, ...bounds(cards) }));
  if (units.length < 2 || (how.startsWith('distribute') && units.length < 3)) return [];
  const b = bounds(cards), horizontal = how === 'distribute-x', axis = horizontal ? 'x' : 'y', edge = horizontal ? 'right' : 'bottom';
  let at = b[axis];
  const ordered = [...units].sort((a, b) => a[axis] - b[axis]);
  const gap = (b[edge] - b[axis] - units.reduce((n, u) => n + u[edge] - u[axis], 0)) / (units.length - 1);
  return (how.startsWith('distribute') ? ordered : units).flatMap(u => {
    let dx = 0, dy = 0;
    if (how === 'left') dx = b.x - u.x;
    if (how === 'centre') dx = (b.x + b.right - u.x - u.right) / 2;
    if (how === 'right') dx = b.right - u.right;
    if (how === 'top') dy = b.y - u.y;
    if (how === 'middle') dy = (b.y + b.bottom - u.y - u.bottom) / 2;
    if (how === 'bottom') dy = b.bottom - u.bottom;
    if (how.startsWith('distribute')) { if (horizontal) dx = at - u.x; else dy = at - u.y; at += u[edge] - u[axis] + gap; }
    return u.cards.map(c => ({ op: 'move', id: c.id, x: Math.round(c.x + dx), y: Math.round(c.y + dy) }));
  });
}
export function stackCommands(board, ids, direction) {
  const moving = board.cards.filter(c => ids.includes(c.id));
  if (!moving.length) return [];
  if (direction === 'front' || direction === 'back') return [{ op: 'order', ids: moving.map(c => c.id), to: direction }];
  const ordered = [...board.cards], forward = direction === 'forward';
  for (const c of forward ? [...moving].reverse() : moving) {
    const i = ordered.indexOf(c), j = i + (forward ? 1 : -1);
    if (j >= 0 && j < ordered.length && !ids.includes(ordered[j].id)) [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  return ordered.map((c, to) => ({ op: 'order', ids: [c.id], to }));
}
