import { applyBatch as reduceBatch } from '@aegis/domain/commands';
import type { BatchResult } from '@aegis/domain/commands';
import type { Board } from '@aegis/domain/schema';
import { decodeStoredBoard } from '@aegis/protocol/storage';

export function applyBatch(board: Board, batch: unknown): BatchResult {
  const result = reduceBatch(board, batch), next = decodeStoredBoard(result.board);
  return { ...result, board: next };
}
