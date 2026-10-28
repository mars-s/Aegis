import type { AgentId, BatchId, Board, Card, CardContent, CardId, ChangeSet, Command, RequestId, Source } from '@aegis/domain/schema';
import type { HostEvent } from '@aegis/protocol/http';
import type { SceneOrigin } from '@aegis/scene';
import type { CreatedIds, HostFailure, LocalFieldError, ReplicationPort } from '@aegis/host-client';

export type AgentStatus = Extract<HostEvent, { readonly type: 'agent' }>;

export type FieldError = LocalFieldError;
export type LocalResult =
  | { readonly kind: 'applied'; readonly batchId: BatchId; readonly created: CreatedIds; readonly ids: readonly CardId[] }
  | { readonly kind: 'rejected'; readonly errors: readonly FieldError[] };

export type SaveState =
  | { readonly kind: 'saved'; readonly revision: number }
  | { readonly kind: 'saving'; readonly pending: number }
  | { readonly kind: 'blocked'; readonly batchId: BatchId; readonly pending: number; readonly reason: string; readonly errors: readonly FieldError[] };

export type SceneChange = (
  | (ChangeSet & { readonly kind: 'change' })
  | (ChangeSet & { readonly kind: 'replace'; readonly board: Board })
) & { readonly origin: SceneOrigin };

export interface SceneSource {
  readonly snapshot: () => Board;
  readonly subscribe: (changed: (change: SceneChange) => void) => () => void;
}

export type UiIntent =
  | { readonly kind: 'select'; readonly ids: readonly CardId[] }
  | { readonly kind: 'edit-close' }
  | { readonly kind: 'edit'; readonly id: CardId; readonly view: 'side' | 'full' }
  | { readonly kind: 'panel'; readonly side: 'left' | 'right'; readonly open: boolean };

export interface UiState {
  readonly editor: { readonly id: CardId; readonly view: 'side' | 'full' } | null;
  readonly leftPanel: boolean;
  readonly rightPanel: boolean;
}

export interface Workspace {
  readonly scene: SceneSource;
  readonly replication: ReplicationPort;
  readonly metadata: Source<Pick<Board, 'id' | 'name' | 'rev'>>;
  readonly saving: Source<SaveState>;
  readonly selection: Source<readonly CardId[]>;
  readonly history: Source<{ readonly undo: boolean; readonly redo: boolean }>;
  readonly ui: Source<UiState>;
  readonly connectionError: Source<HostFailure | null>;
  readonly events: Source<HostEvent | null>;
  readonly agent: (id: AgentId) => Source<AgentStatus | null>;
  readonly card: (id: CardId) => Source<CardContent | null>;
  readonly record: (id: CardId) => Source<Card | null>;
  readonly submit: (commands: readonly Command[]) => LocalResult;
  readonly expectAgentUndo: (agentId: AgentId, requestId: RequestId) => () => void;
  readonly undo: () => LocalResult;
  readonly redo: () => LocalResult;
  readonly retry: () => void;
  readonly act: (intent: UiIntent) => void;
  readonly replaceBoard: (board: Board) => boolean;
  readonly dispose: () => void;
}

export type FeatureWorkspace = Omit<Workspace, 'replication' | 'dispose'>;
