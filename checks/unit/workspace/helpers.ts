import { applyBatch, BoardIdSchema, CardIdSchema, emptyBoard } from '@aegis/domain';
import type { Board, Command } from '@aegis/domain';
import type { HostClient, HostResult, PendingBatch } from '@aegis/host-client';
import type { BatchResponse, HostEvent } from '@aegis/protocol/http';

export const boardId = BoardIdSchema.parse('boardaa');
export const otherBoardId = BoardIdSchema.parse('boardbb');
export const noteId = CardIdSchema.parse('noteaaaa');
export const otherId = CardIdSchema.parse('notebbbb');

export function deferred<T>() {
  const handlers: ((value: T) => void)[] = [];
  return {
    promise: new Promise<T>(resolve => { handlers.push(resolve); }),
    resolve: (value: T) => { for (const handler of handlers.splice(0)) handler(value); },
  };
}

export function boardWith(commands: readonly Command[] = []): Board {
  const board = emptyBoard(boardId, 'Workspace checks');
  if (commands.length === 0) return board;
  const result = applyBatch(board, { commands: [...commands] });
  if (!result.ok) throw new Error(result.errors[0]?.reason ?? 'Fixture is invalid');
  return result.board;
}

export function memoryHost(initial: Board) {
  let board = initial;
  let online = true;
  let receive: (event: HostEvent, bytes: number) => void = () => {};
  const attempts: PendingBatch[] = [];
  const reads: Board['id'][] = [];
  const client: HostClient = {
    boards: async () => ({ kind: 'ok', value: [{ id: board.id, name: board.name, cards: board.cards.length, rev: board.rev, boardParent: board.parent ?? null, editedAt: board.editedAt ?? null, subtitle: '' }] }),
    board: async id => {
      reads.push(id);
      return { kind: 'ok', value: board };
    },
    createBoard: async () => ({ kind: 'ok', value: board }),
    commit: async batch => {
      attempts.push(batch);
      if (!online) return { kind: 'error', error: { kind: 'offline', message: 'offline' } };
      const result = applyBatch(board, { commands: [...batch.commands] });
      if (!result.ok) return { kind: 'ok', value: { ok: false, errors: result.errors } };
      board = result.board;
      return { kind: 'ok', value: { ok: true, rev: board.rev, created: result.created } };
    },
    saveCamera: async () => ({ kind: 'ok', value: undefined }),
    assetUrl: url => url,
    events: args => {
      receive = args.event;
      args.opened();
      return new Promise<HostResult<void>>(resolve => {
        if (args.signal.aborted) resolve({ kind: 'ok', value: undefined });
        else args.signal.addEventListener('abort', () => { resolve({ kind: 'ok', value: undefined }); }, { once: true });
      });
    },
    dispose: () => {},
  };
  return {
    client, attempts, reads,
    board: () => board,
    setBoard: (next: Board) => { board = next; },
    online: (value: boolean) => { online = value; },
    emit: (event: HostEvent) => { receive(event, JSON.stringify(event).length); },
    response: (response: BatchResponse): HostResult<BatchResponse> => ({ kind: 'ok', value: response }),
  };
}
