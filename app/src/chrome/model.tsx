// Tree and arrangement behaviour ported from Mochiboard, MIT. See LICENSE.mochiboard.
import { useMemo, useSyncExternalStore } from "react";
import type { Board, Card, CardId, Command } from "@aegis/domain";
import type { FeatureWorkspace } from "../composition.js";

export function useBoard(workspace: FeatureWorkspace): Board {
  const source = useMemo(
    () => ({
      subscribe: (changed: () => void) => workspace.scene.subscribe(changed),
      getSnapshot: workspace.scene.snapshot,
    }),
    [workspace],
  );
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}

export function cardLabel(card: Card): string {
  if (card.props?.layerName) return card.props.layerName;
  if (card.type === "object" && card.kind === "reply" && card.data.headline)
    return card.data.headline;
  return (
    card.heading ||
    card.text.split("\n").find(Boolean) ||
    card.url?.replace(/^asset:.*/, "").replace(/^https?:\/\/(www\.)?/, "") ||
    (card.type === "object" ? card.kind : card.type)
  );
}

export function layerParents(board: Board): ReadonlyMap<CardId, CardId> {
  const byId = new Map(board.cards.map((card) => [card.id, card]));
  const parents = new Map<CardId, CardId>();
  const sections = board.cards
    .filter((card) => card.type === "section")
    .sort((a, b) => a.w * a.h - b.w * b.h);
  for (const card of board.cards)
    if (card.parent && byId.has(card.parent)) parents.set(card.id, card.parent);
  for (const card of board.cards)
    if (card.type === "coll")
      for (const kid of card.props?.kids ?? [])
        if (kid !== card.id && byId.has(kid)) parents.set(kid, card.id);
  for (const card of board.cards) {
    if (parents.has(card.id)) continue;
    const x = card.x + card.w / 2,
      y = card.y + card.h / 2;
    const section = sections.find(
      (candidate) =>
        candidate.id !== card.id &&
        (card.type !== "section" ||
          candidate.w * candidate.h > card.w * card.h) &&
        x > candidate.x &&
        x < candidate.x + candidate.w &&
        y > candidate.y &&
        y < candidate.y + candidate.h,
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

export function descendants(
  board: Board,
  ids: readonly CardId[],
  parents = layerParents(board),
): Card[] {
  const children = new Map<CardId, CardId[]>();
  for (const [id, parent] of parents)
    children.set(parent, [...(children.get(parent) ?? []), id]);
  const chosen = new Set(ids),
    queue = [...ids];
  for (const id of queue)
    for (const child of children.get(id) ?? [])
      if (!chosen.has(child)) {
        chosen.add(child);
        queue.push(child);
      }
  return board.cards.filter((card) => chosen.has(card.id));
}

export function locked(board: Board, card: Card): boolean {
  const parents = layerParents(board),
    byId = new Map(board.cards.map((item) => [item.id, item]));
  let current: Card | undefined = card;
  const seen = new Set<CardId>();
  while (current && !seen.has(current.id)) {
    if (current.props?.["locked"] === true) return true;
    seen.add(current.id);
    const parent = parents.get(current.id);
    current = parent ? byId.get(parent) : undefined;
  }
  return false;
}

export function bounds(cards: readonly Card[]) {
  const first = cards[0];
  if (!first) return null;
  return cards.reduce(
    (box, card) => ({
      x: Math.min(box.x, card.x),
      y: Math.min(box.y, card.y),
      right: Math.max(box.right, card.x + card.w),
      bottom: Math.max(box.bottom, card.y + card.h),
    }),
    {
      x: first.x,
      y: first.y,
      right: first.x + first.w,
      bottom: first.y + first.h,
    },
  );
}

export type Alignment =
  | "left"
  | "centre"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "distribute-x"
  | "distribute-y";
export function arrange(
  board: Board,
  ids: readonly CardId[],
  how: Alignment,
): Command[] {
  const cards = board.cards.filter(
    (card) => ids.includes(card.id) && !locked(board, card),
  );
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = card.group || card.id;
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  const units = [...groups.values()].flatMap((members) => {
    const box = bounds(members);
    return box ? [{ cards: members, ...box }] : [];
  });
  const box = bounds(cards);
  const distribute = how === "distribute-x" || how === "distribute-y";
  if (!box || units.length < (distribute ? 3 : 2)) return [];
  const horizontal = how === "distribute-x",
    axis = horizontal ? "x" : "y",
    edge = horizontal ? "right" : "bottom";
  const gap =
    (box[edge] -
      box[axis] -
      units.reduce((sum, unit) => sum + unit[edge] - unit[axis], 0)) /
    (units.length - 1);
  let at = box[axis];
  return (distribute ? units.sort((a, b) => a[axis] - b[axis]) : units).flatMap(
    (unit) => {
      let dx = 0,
        dy = 0;
      switch (how) {
        case "left":
          dx = box.x - unit.x;
          break;
        case "centre":
          dx = (box.x + box.right - unit.x - unit.right) / 2;
          break;
        case "right":
          dx = box.right - unit.right;
          break;
        case "top":
          dy = box.y - unit.y;
          break;
        case "middle":
          dy = (box.y + box.bottom - unit.y - unit.bottom) / 2;
          break;
        case "bottom":
          dy = box.bottom - unit.bottom;
          break;
        case "distribute-x":
          dx = at - unit.x;
          at += unit.right - unit.x + gap;
          break;
        case "distribute-y":
          dy = at - unit.y;
          at += unit.bottom - unit.y + gap;
          break;
        default: {
          const exhaustive: never = how;
          return exhaustive;
        }
      }
      return unit.cards.map((card) => ({
        op: "move",
        id: card.id,
        x: Math.round(card.x + dx),
        y: Math.round(card.y + dy),
      }));
    },
  );
}
