// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import type { Board, CardId } from "@aegis/domain";
export function layerParents(board: Board): Map<CardId, CardId> {
  const byId = new Map(board.cards.map((card) => [card.id, card])),
    parents = new Map<CardId, CardId>();
  const sections = board.cards
    .filter((card) => card.type === "section")
    .sort((a, b) => a.w * a.h - b.w * b.h);
  for (const card of board.cards)
    if (card.parent && byId.has(card.parent)) parents.set(card.id, card.parent);
  for (const card of board.cards)
    if (card.type === "coll")
      for (const kid of card.props?.kids ?? [])
        if (byId.has(kid) && kid !== card.id) parents.set(kid, card.id);
  for (const card of board.cards) {
    if (parents.has(card.id)) continue;
    const x = card.x + card.w / 2,
      y = card.y + card.h / 2;
    const section = sections.find(
      (entry) =>
        entry.id !== card.id &&
        (card.type !== "section" || entry.w * entry.h > card.w * card.h) &&
        x > entry.x &&
        x < entry.x + entry.w &&
        y > entry.y &&
        y < entry.y + entry.h,
    );
    if (section) parents.set(card.id, section.id);
  }
  for (const id of parents.keys()) {
    const seen = new Set([id]);
    let parent = parents.get(id);
    while (parent) {
      if (seen.has(parent)) {
        parents.delete(id);
        break;
      }
      seen.add(parent);
      parent = parents.get(parent);
    }
  }
  return parents;
}
export function layerDescendants(
  board: Board,
  ids: readonly CardId[],
  parents = layerParents(board),
) {
  const children = new Map<CardId, CardId[]>();
  for (const [id, parent] of parents) {
    const entries = children.get(parent) ?? [];
    entries.push(id);
    children.set(parent, entries);
  }
  const selected = new Set(ids),
    queue = [...ids];
  for (const id of queue)
    for (const child of children.get(id) ?? [])
      if (!selected.has(child)) {
        selected.add(child);
        queue.push(child);
      }
  return board.cards.filter((card) => selected.has(card.id));
}
