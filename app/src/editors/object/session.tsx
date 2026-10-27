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


type Prepare = (signal: AbortSignal) => Promise<boolean>;
const preparations = new WeakMap<FeatureWorkspace, Map<BoardId, Map<CardId, Set<Prepare>>>>();
export function retainObjectPreparation(workspace: FeatureWorkspace, id: CardId, prepare: Prepare): () => void {
  let boards = preparations.get(workspace);
  if (!boards) { boards = new Map(); preparations.set(workspace, boards); }
  const board = workspace.metadata.getSnapshot().id;
  let cards = boards.get(board);
  if (!cards) { cards = new Map(); boards.set(board, cards); }
  let views = cards.get(id);
  if (!views) { views = new Set(); cards.set(id, views); }
  views.add(prepare);
  return () => {
    views.delete(prepare);
    if (!views.size) cards.delete(id);
    if (!cards.size) boards.delete(board);
  };
}
export async function prepareObject(context: FeatureContext, id: CardId, signal: AbortSignal): Promise<boolean> {
  const views = preparations.get(context.workspace)?.get(context.workspace.metadata.getSnapshot().id)?.get(id);
  for (const prepare of views ?? []) if (signal.aborted || !await prepare(signal)) return false;
  return !signal.aborted;
}
