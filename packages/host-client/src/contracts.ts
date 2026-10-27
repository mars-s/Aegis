import type { BatchId, Board, BoardId, Command, Source } from '@aegis/domain/schema';
import type { AssetUpload, BatchResponse, BoardListEntry, HostEvent } from '@aegis/protocol/http';
import type { HostFailure, HostResult } from './result.js';

export type { Source } from '@aegis/domain/schema';

export interface PendingBatch {
  readonly id: BatchId;
  readonly boardId: BoardId;
  readonly commands: readonly Command[];
}

export interface ReplicationState {
  readonly epoch: number;
  readonly closed: boolean;
  readonly boardId: BoardId;
  readonly confirmedRevision: number;
  readonly pending: readonly PendingBatch[];
  readonly blocked: boolean;
}

/** A plain callback port. It does not expose Effect to the app. */
export interface ReplicationPort {
  readonly state: Source<ReplicationState>;
  readonly acknowledge: (epoch: number, batchId: BatchId, response: BatchResponse) => void;
  readonly reconcile: (epoch: number, board: Board) => void;
  readonly accept: (epoch: number, event: HostEvent) => 'applied' | 'ignored' | 'gap';
  readonly failed: (epoch: number, batchId: BatchId, error: HostFailure) => void;
}

export type BoardSummary = BoardListEntry;

export interface HostClient {
  readonly boards: (signal?: AbortSignal) => Promise<HostResult<readonly BoardSummary[]>>;
  readonly board: (id: BoardId, signal?: AbortSignal) => Promise<HostResult<Board>>;
  readonly createBoard: (name: string, signal?: AbortSignal) => Promise<HostResult<Board>>;
  readonly commit: (batch: PendingBatch, signal?: AbortSignal) => Promise<HostResult<BatchResponse>>;
  readonly saveCamera: (id: BoardId, view: Board['view'], signal?: AbortSignal) => Promise<HostResult<void>>;
  readonly events: (args: {
    readonly signal: AbortSignal;
    readonly opened: () => void;
    readonly event: (event: HostEvent, bytes: number) => void;
  }) => Promise<HostResult<void>>;
  readonly upload: (file: File, signal?: AbortSignal) => Promise<HostResult<AssetUpload>>;
  readonly assetUrl: (url: string) => string;
  readonly dispose: () => void;
}

export interface LocalFieldError {
  readonly index: number;
  readonly path: string;
  readonly reason: string;
}

export type CreatedIds = Readonly<Extract<BatchResponse, { readonly ok: true }>['created']>;
