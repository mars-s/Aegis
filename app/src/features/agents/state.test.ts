import { describe, expect, it } from 'vitest';
import { AgentIdSchema, BoardIdSchema } from '@aegis/domain/schema';
import { AgentSnapshotSchema } from './schema.js';
import type { AgentSnapshot } from './schema.js';
import { createAgentStore } from './store.js';

// Ported from checks/host/agent-state.test.ts: the same cases, run against the React agent store.
const board = BoardIdSchema.parse('board');
const base = { boardId: board, brief: 'Brief', model: { provider: 'fake', modelId: 'fake' }, created: 1, status: 'Working', parent: null, title: null, error: null };
function agent(fields: Record<string, unknown>): AgentSnapshot {
  return AgentSnapshotSchema.parse({ ...base, ...fields });
}
function without<K extends string>(value: Record<string, unknown>, key: K): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}
const workingFields = { id: 'one', revision: 2, running: true, text: '', turns: [], history: [] };
const completedFields = { ...workingFields, revision: 3, running: false, text: 'Answer', turns: [{ id: 't1', role: 'assistant', text: 'Answer' }] };
const working = agent(workingFields), completed = agent(completedFields);
const one = AgentIdSchema.parse('one');

describe('agent state ordering', () => {
  it('older or duplicate snapshots and events cannot replace newer per-agent state', () => {
    const state = createAgentStore(board), read = state.beginRead();
    expect(state.mergeEvent(working)).toBe(true);
    expect(state.mergeEvent(completed)).toBe(true);
    for (const old of [working, agent({ ...workingFields, revision: completed.revision })]) {
      expect(state.mergeSnapshot(old, read)).toBe(false);
      expect(state.mergeEvent(old)).toBe(false);
      expect(state.get(one)).toEqual(completed);
    }
    expect(state.mergeSnapshot(agent({ id: 'two', revision: 1, running: true, text: '' }), read), 'another agent has independent ordering').toBe(true);
    expect(state.mergeSnapshot(agent({ ...completedFields, revision: 4, status: 'Stopped' }), read), 'a newer revision wins even if the request began earlier').toBe(true);
    const first = state.beginRead(), second = state.beginRead();
    state.mergeSnapshot(agent({ ...completedFields, revision: 6 }), second);
    expect(state.mergeSnapshot(agent({ ...completedFields, revision: 5 }), first)).toBe(false);
  });

  it('legacy reads merge only for agents without an event since the request began', () => {
    const state = createAgentStore(board), read = state.beginRead();
    const legacyWorking = agent(without(workingFields, 'revision'));
    const legacyCompleted = agent(without(completedFields, 'revision'));
    state.mergeEvent(legacyCompleted);
    expect(state.mergeSnapshot(legacyWorking, read)).toBe(false);
    expect(state.get(one)).toEqual(legacyCompleted);
    expect(state.mergeSnapshot(agent({ id: 'two', running: true, text: '' }), read)).toBe(true);
    const later = state.beginRead();
    expect(state.mergeSnapshot(agent({ ...without(completedFields, 'revision'), status: 'Ready' }), later), 'an event before the read does not block reconciliation').toBe(true);
    const olderRead = state.beginRead(), newerRead = state.beginRead();
    state.mergeSnapshot(agent({ ...without(completedFields, 'revision'), status: 'Stopped' }), newerRead);
    expect(state.mergeSnapshot(legacyWorking, olderRead), 'overlapping reads cannot go backwards either').toBe(false);
  });

  it('mixed legacy and revisioned updates retain the request-start event guard', () => {
    const state = createAgentStore(board), read = state.beginRead();
    state.mergeEvent(completed);
    expect(state.mergeSnapshot(agent(without(workingFields, 'revision')), read)).toBe(false);
    const next = state.beginRead();
    state.mergeEvent(agent(without(completedFields, 'revision')));
    expect(state.mergeSnapshot(agent({ ...workingFields, revision: 4 }), next)).toBe(false);
  });
});
