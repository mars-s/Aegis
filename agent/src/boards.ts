import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { applyBatch } from '@aegis/domain/commands';
import { boardSubtitle } from '@aegis/domain/summary';
import type { Board } from '@aegis/domain/schema';
import type { BatchResponse, BoardPatch, HostEvent, BoardListEntry } from '@aegis/protocol/http';
import { HostEventSchema } from '@aegis/protocol/http';
import { decodeStoredBoard } from '@aegis/protocol/storage';
import { atomicJson, readJson } from './files.js';

export type Author = Extract<HostEvent, { type: 'board' }>['author'];
export interface CommitChange { boardId: string; board: Board; next: Board; patch: BoardPatch; author: Author; batch: { commands: { op: string }[] } }
export interface BoardService {
  boardPath(id: string): string;
  historyBoards: Map<string, Board>;
  withBoard<T>(id: string, task: () => Promise<T>): Promise<T>;
  loadBoard(id: string): Promise<Board | null>;
  listBoards(): Promise<BoardListEntry[]>;
  commit(boardId: string, input: unknown, author: Author, expectedRev?: number): Promise<BatchResponse>;
}
export function createBoards(options: {
  directory: string; broadcast(event: HostEvent): void;
  record(change: CommitChange): Promise<void>;
  refreshAgents(boardId: string): void;
  timing(value: { kind: 'batch'; boardId: string; commands: number; loadMs: number; applyMs: number; saveMs: number; totalMs: number }): void;
}): BoardService {
  const locks = new Map<string, Promise<unknown>>(), historyBoards = new Map<string, Board>();
  const boardPath = (id: string) => join(options.directory, `${id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)}.json`);
  function withBoard<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) ?? Promise.resolve(), next = previous.then(task, task);
    const settled = next.catch(() => {}); locks.set(id, settled);
    void settled.finally(() => { if (locks.get(id) === settled) locks.delete(id); });
    return next;
  }
  async function loadBoard(id: string): Promise<Board | null> {
    const value = await readJson(boardPath(id), null);
    if (value === null) return null;
    const board = decodeStoredBoard(value);
    if (board.rev >= (historyBoards.get(id)?.rev ?? -1)) historyBoards.set(id, board);
    return board;
  }
  async function listBoards() {
    const result = [];
    for (const file of await readdir(options.directory).catch(() => [])) if (file.endsWith('.json')) {
      const value = await readJson(join(options.directory, file), null);
      if (value === null) continue;
      const board = decodeStoredBoard(value);
      result.push({ id: board.id, name: board.name, cards: board.cards.length, rev: board.rev, boardParent: board.parent ?? null, editedAt: board.editedAt ?? null, subtitle: boardSubtitle(board) });
    }
    return result;
  }
  async function commit(boardId: string, input: unknown, author: Author, expectedRev?: number): Promise<BatchResponse> {
    const started = performance.now();
    return withBoard(boardId, async () => {
      const board = await loadBoard(boardId);
      if (!board) return { ok: false, errors: [{ index: -1, reason: `no board ${boardId}`, hint: 'list boards first' }] };
      if (expectedRev !== undefined && board.rev !== expectedRev) throw new Error(`The board changed (expected revision ${expectedRev}, current ${board.rev}). Read it again before editing.`);
      const loaded = performance.now(), result = applyBatch(board, input), applied = performance.now();
      if (!result.ok) return { ok: false, rev: board.rev, errors: result.errors };
      // applyBatch's legacy compatibility overload validates and returns a complete board.
      const next = decodeStoredBoard(result.board); next.editedAt = Date.now();
      await atomicJson(boardPath(boardId), next); historyBoards.set(boardId, next);
      const saved = performance.now(), before = new Map(board.cards.map(card => [card.id, card])), after = new Set(next.cards.map(card => card.id)), touched = new Set(result.touched);
      const patch: BoardPatch = {
        cards: next.cards.filter(card => touched.has(card.id) && (!before.has(card.id) || JSON.stringify(before.get(card.id)) !== JSON.stringify(card))),
        removed: board.cards.filter(card => !after.has(card.id)).map(card => card.id),
        ...(JSON.stringify(board.links) !== JSON.stringify(next.links) ? { links: next.links } : {}),
        ...(board.cards.map(card => card.id).join(',') !== next.cards.map(card => card.id).join(',') ? { order: next.cards.map(card => card.id) } : {}),
        fields: Object.fromEntries(['tray', 'palette', 'bg'].filter(key => JSON.stringify(board[key]) !== JSON.stringify(next[key])).map(key => [key, next[key] ?? null])),
      };
      const batch = z.object({ commands: z.array(z.object({ op: z.string() })) }).parse(input);
      await options.record({ boardId, board, next, patch, author, batch });
      options.broadcast(HostEventSchema.parse({ type: 'board', boardId: next.id, baseRev: board.rev, rev: next.rev, patch, author, touched: result.touched, focus: next.focus ?? null, sentAt: Date.now() }));
      options.refreshAgents(boardId);
      options.timing({ kind: 'batch', boardId, commands: batch.commands.length, loadMs: loaded - started, applyMs: applied - loaded, saveMs: saved - applied, totalMs: performance.now() - started });
      return { ok: true, rev: next.rev, created: result.created, ...(result.notes ? { notes: result.notes } : {}) };
    });
  }
  return { boardPath, historyBoards, withBoard, loadBoard, listBoards, commit };
}
