import type { AgentId, BoardId, Source } from '@aegis/domain/schema';
import { AgentSnapshotSchema } from './schema.js';
import type { AgentSnapshot } from './schema.js';

interface ReadTicket { readonly id: number; readonly events: ReadonlyMap<AgentId, number> }
export interface AgentStore extends Source<readonly AgentSnapshot[]> {
  readonly get: (id: AgentId) => AgentSnapshot | undefined;
  readonly beginRead: () => ReadTicket;
  readonly mergeSnapshot: (agent: AgentSnapshot, read: ReadTicket) => boolean;
  readonly mergeEvent: (value: unknown) => boolean;
  readonly clear: () => void;
}

export function createAgentStore(boardId: BoardId): AgentStore {
  const agents = new Map<AgentId, AgentSnapshot>();
  const events = new Map<AgentId, number>();
  const reads = new Map<AgentId, number>();
  const listeners = new Set<() => void>();
  let serial = 0;
  let snapshot: readonly AgentSnapshot[] = [];
  function publish(): void {
    snapshot = [...agents.values()].sort((a, b) => b.created - a.created || b.id.localeCompare(a.id));
    for (const listener of listeners) listener();
  }
  function merge(agent: AgentSnapshot, read: ReadTicket | null): boolean {
    if (agent.boardId !== boardId) return false;
    const previous = agents.get(agent.id);
    if (agent.revision !== undefined && previous?.revision !== undefined) {
      if (agent.revision <= previous.revision) return false;
    } else if (read && ((events.get(agent.id) ?? 0) !== (read.events.get(agent.id) ?? 0) || read.id < (reads.get(agent.id) ?? 0))) return false;
    agents.set(agent.id, agent);
    if (read) reads.set(agent.id, Math.max(read.id, reads.get(agent.id) ?? 0));
    publish();
    return true;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get: id => agents.get(id), beginRead: () => ({ id: ++serial, events: new Map(events) }),
    mergeSnapshot: (agent, read) => merge(agent, read),
    mergeEvent(value) {
      const result = AgentSnapshotSchema.safeParse(value);
      if (!result.success || result.data.boardId !== boardId) return false;
      const agent = result.data;
      events.set(agent.id, (events.get(agent.id) ?? 0) + 1);
      return merge(agent, null);
    },
    clear() { agents.clear(); events.clear(); reads.clear(); publish(); },
  };
}
