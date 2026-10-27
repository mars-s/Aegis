import type { CardId } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
const pins = new WeakMap<CanvasEngine, Map<CardId, Set<symbol>>>();
export function pinObjectDraft(
  engine: CanvasEngine,
  id: CardId,
  token: symbol,
  pinned: boolean,
) {
  let cards = pins.get(engine);
  if (!cards) {
    cards = new Map();
    pins.set(engine, cards);
  }
  let tokens = cards.get(id);
  if (!tokens) {
    tokens = new Set();
    cards.set(id, tokens);
  }
  if (pinned) tokens.add(token);
  else tokens.delete(token);
  engine.pin(id, "dirty", tokens.size > 0);
  if (!tokens.size) cards.delete(id);
}
