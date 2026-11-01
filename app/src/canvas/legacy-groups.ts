// Ported from Mochiboard, MIT. See LICENSE.mochiboard.
import type { Board, Command } from "@aegis/domain";

type Card = Board["cards"][number];

/** Older boards kept framework notes in template-group cards. Dragging a group carries its notes. */
export function expandTemplateDrag(
  cards: readonly Card[],
  board: Pick<Board, "cards">,
): Card[] {
  const ids = new Set(cards.map((card) => card.id));
  for (const card of cards)
    if (card.type === "template-group")
      for (const child of board.cards) if (child.parent === card.id) ids.add(child.id);
  return board.cards.filter((card) => ids.has(card.id));
}

/** A note dropped into a template group joins it; dropped outside every group, it leaves. */
export function templateDropCommands(
  cards: readonly Card[],
  board: Pick<Board, "cards">,
  kind: "move" | "resize",
): Command[] {
  if (kind !== "move") return [];
  return cards
    .filter((card) => card.type === "note")
    .flatMap((card): Command[] => {
      if (cards.some((parent) => parent.id === card.parent && parent.type === "template-group")) return [];
      const cx = card.x + card.w / 2, cy = card.y + card.h / 2;
      const group = [...board.cards].reverse().find((g) => g.type === "template-group" && cx > g.x && cx < g.x + g.w && cy > g.y && cy < g.y + g.h);
      const previous = board.cards.find((parent) => parent.id === card.parent);
      if (!group && previous?.type !== "template-group") return [];
      const target = group?.id ?? "";
      return (card.parent ?? "") === target ? [] : [{ op: "update", id: card.id, set: { parent: target } }];
    });
}
