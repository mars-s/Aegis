import type { BoardId, CardId } from "@aegis/domain";
import type { FeatureContext, FeatureWorkspace } from "../../composition.js";

type Flush = () => boolean;
const sessions = new WeakMap<
  FeatureWorkspace,
  Map<BoardId, Map<CardId, Set<Flush>>>
>();
export function retainObjectDraft(
  workspace: FeatureWorkspace,
  id: CardId,
  flush: Flush,
): () => void {
  let boards = sessions.get(workspace);
  if (!boards) {
    boards = new Map();
    sessions.set(workspace, boards);
  }
  const boardId = workspace.metadata.getSnapshot().id;
  let cards = boards.get(boardId);
  if (!cards) {
    cards = new Map();
    boards.set(boardId, cards);
  }
  let views = cards.get(id);
  if (!views) {
    views = new Set();
    cards.set(id, views);
  }
  views.add(flush);
  return () => {
    views.delete(flush);
    if (!views.size) cards.delete(id);
    if (!cards.size) boards.delete(boardId);
  };
}
export function flushObjectDrafts(
  workspace: FeatureWorkspace,
  id: CardId,
): boolean {
  const views = sessions
    .get(workspace)
    ?.get(workspace.metadata.getSnapshot().id)
    ?.get(id);
  for (const flush of views ?? []) if (!flush()) return false;
  return true;
}

export function flushObject(context: FeatureContext, id: CardId): boolean {
  return flushObjectDrafts(context.workspace, id);
}
