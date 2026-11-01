import type { Profile } from '@aegis/domain/profile';
import type { AgentModel, AgentSnapshot, StartAgent } from '@aegis/protocol/agents';
import type { AgentId, CardId, RequestId } from '@aegis/domain/schema';
import type { LibrarySnapshot, LibraryChange, LibraryResult, Provider, ProviderAccount, McpSetup, RewriteRequest, LinkPreview, SandboxRequest } from '@aegis/protocol/services';
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

export interface BoardClient {
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
  readonly upload: (file: File, signal?: AbortSignal, progress?: (percent: number) => void) => Promise<HostResult<AssetUpload>>;
  readonly assetUrl: (url: string) => string;
  readonly dispose: () => void;
}

export interface LocalFieldError {
  readonly index: number;
  readonly path: string;
  readonly reason: string;
}

export type CreatedIds = Readonly<Extract<BatchResponse, { readonly ok: true }>['created']>;

export interface AgentClient {
  readonly list: (boardId: BoardId | null, signal: AbortSignal) => Promise<HostResult<readonly AgentSnapshot[]>>;
  readonly models: (signal: AbortSignal) => Promise<HostResult<readonly AgentModel[]>>;
  readonly connected: (provider: string, signal: AbortSignal) => Promise<HostResult<boolean>>;
  readonly start: (request: StartAgent, signal: AbortSignal) => Promise<HostResult<readonly Pick<AgentSnapshot, 'id'>[]>>;
  readonly message: (id: AgentId, content: string, selectedIds: readonly CardId[], signal: AbortSignal) => Promise<HostResult<void>>;
  readonly stop: (id: AgentId, signal: AbortSignal) => Promise<HostResult<void>>;
  readonly undoRequest: (id: AgentId, requestId: RequestId, signal: AbortSignal) => Promise<HostResult<void>>;
}
export interface HostClient extends BoardClient {
  readonly profile: (signal?: AbortSignal) => Promise<HostResult<Profile>>;
  readonly resetProfile: (signal?: AbortSignal) => Promise<HostResult<Profile>>;
  readonly refreshClaude: (signal?: AbortSignal) => Promise<HostResult<void>>;
  readonly agents: AgentClient;
  readonly accounts: (signal?: AbortSignal) => Promise<HostResult<readonly ProviderAccount[]>>;
  readonly authenticate: (provider: Provider, action: 'start' | 'cancel' | 'logout', signal?: AbortSignal) => Promise<HostResult<readonly ProviderAccount[]>>;
  readonly answer: (provider: Provider, answer: string, signal?: AbortSignal) => Promise<HostResult<void>>;
  readonly mcp: (signal?: AbortSignal) => Promise<HostResult<McpSetup>>;
  readonly rewrite: (request: RewriteRequest, signal?: AbortSignal) => Promise<HostResult<string>>;
  readonly rewriteStream: (request: RewriteRequest, onDelta: (delta: string) => void, signal?: AbortSignal) => Promise<HostResult<string>>;
  readonly linkPreview: (url: string, signal: AbortSignal) => Promise<HostResult<LinkPreview>>;
  readonly registerSandbox: (request: SandboxRequest, signal: AbortSignal) => Promise<HostResult<{ readonly url: string }>>;
  readonly library: {
    readonly read: (signal?: AbortSignal) => Promise<HostResult<LibrarySnapshot>>;
    readonly change: (change: LibraryChange, signal?: AbortSignal) => Promise<HostResult<LibraryResult>>;
    readonly createBoard: (name: string, parent: string | null, signal?: AbortSignal) => Promise<HostResult<Board>>;
    readonly createChild: (name: string, parent: BoardId, at: { readonly x: number; readonly y: number }, signal?: AbortSignal) => Promise<HostResult<Board>>;
    readonly renameBoard: (id: BoardId, name: string, signal?: AbortSignal) => Promise<HostResult<void>>;
    readonly duplicate: (id: string, signal?: AbortSignal) => Promise<HostResult<LibraryResult>>;
    readonly removeBoard: (id: BoardId, signal?: AbortSignal) => Promise<HostResult<LibraryResult>>;
  };
}
