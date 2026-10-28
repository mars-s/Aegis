import './register.ts';
import { AgentIdSchema, BoardIdSchema } from '@aegis/domain/schema';
import type { AgentSnapshot } from '@aegis/protocol/agents';
import type { AgentStore } from '../../../app/src/features/agents/store.ts';
import { AgentSnapshotSchema } from '@aegis/protocol/agents';
import { z } from 'zod/v4';
const { createAgentStore } = await import('../../../app/src/features/agents/store.ts');
const boardId = BoardIdSchema.parse('host-agent-order');
// Complete only the protocol fields absent from the original state-ordering fixtures.
export function agentSnapshot(value: unknown) {
  return AgentSnapshotSchema.parse({ boardId, brief: '', model: { provider: 'fake', modelId: 'fake' }, created: 0,
    status: '', running: false, parent: null, title: null, text: '', error: null, ...z.record(z.string(), z.unknown()).parse(value) });
}
interface State {
  readonly beginRead: AgentStore['beginRead'];
  readonly mergeEvent: (value: unknown) => boolean;
  readonly mergeSnapshot: (value: unknown, read: ReturnType<AgentStore['beginRead']>) => boolean;
  readonly get: (id: string) => AgentSnapshot | undefined;
}
export function createAgentState(): State {
  const store = createAgentStore(boardId);
  return {
    beginRead: store.beginRead,
    mergeEvent: (value: unknown) => store.mergeEvent(agentSnapshot(value)),
    mergeSnapshot: (value: unknown, read: ReturnType<typeof store.beginRead>) => store.mergeSnapshot(agentSnapshot(value), read),
    get: (id: string) => store.get(AgentIdSchema.parse(id)),
  };
}
