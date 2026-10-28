import type { AgentId, BoardId, CardId, RequestId } from '@aegis/domain/schema';
import type { AgentModel, AgentSnapshot, StartAgent } from './schema.js';

/** Semantic operations supplied by the host-client owner. No transport or credentials enter components. */
export interface AgentService {
  readonly list: (boardId: BoardId | null, signal: AbortSignal) => Promise<readonly AgentSnapshot[]>;
  readonly models: (signal: AbortSignal) => Promise<readonly AgentModel[]>;
  readonly connected: (provider: string, signal: AbortSignal) => Promise<boolean>;
  readonly start: (request: StartAgent, signal: AbortSignal) => Promise<readonly Pick<AgentSnapshot, 'id'>[]>;
  readonly message: (id: AgentId, content: string, selectedIds: readonly CardId[], signal: AbortSignal) => Promise<void>;
  readonly stop: (id: AgentId, signal: AbortSignal) => Promise<void>;
  readonly undoRequest: (id: AgentId, requestId: RequestId, signal: AbortSignal) => Promise<void>;
}
