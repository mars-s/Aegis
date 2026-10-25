// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
export const preference = (key, fallback) => typeof localStorage === 'undefined' ? fallback : localStorage.getItem(`aegis:${key}`) ?? fallback;
export function displayRotation(card) {
  const loose = !card.parent && !card.group && ['note', 'todo', 'link'].includes(card.type);
  const tilt = loose && preference('tilt', 'off') === 'on' ? ([...card.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 9 - 4) * .4 : 0;
  return (card.rot || 0) + tilt;
}
// Repair geometry before optimistic application and before JSON crosses the host boundary.
export function repairBatch(board, input) {
  for (const card of board.cards) repair(card, { x: 0, y: 0, w: 200, h: 100, rot: 0 });
  return input.map(command => {
    const c = { ...command }, card = board.cards.find(card => card.id === c.id);
    if (c.set) c.set = { ...c.set };
    repair(c.set ?? c, card ?? { x: 0, y: 0, w: 200, h: 100, rot: 0 });
    if (c.op === 'create' && (c.type ?? 'note') === 'note' && c.color == null) c.color = preference('note-colour', 'plain');
    return c;
  });
}
function repair(value, fallback) {
  for (const key of ['x', 'y', 'w', 'h', 'rot']) if (key in value && (!Number.isFinite(value[key]) || (['w', 'h'].includes(key) && value[key] <= 0))) value[key] = fallback[key] ?? 0;
}
