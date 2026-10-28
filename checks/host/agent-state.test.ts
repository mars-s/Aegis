import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentSnapshot, createAgentState } from './adapters/agent-state.ts';

const working = agentSnapshot({ id: 'one', revision: 2, running: true, text: '', turns: [], history: [] });
const completed = agentSnapshot({ ...working, revision: 3, running: false, text: 'Answer', turns: [{ id: 'answer', role: 'assistant', text: 'Answer' }], history: [{ id: 'request', brief: '', started: 0, finished: 100, elapsedMs: 100, summary: 'Answer', changes: [], undone: false, undoBlockedReason: null, canUndo: true }] });

test('older or duplicate snapshots and events cannot replace newer per-agent state', () => {
  const state = createAgentState(), read = state.beginRead();
  assert.equal(state.mergeEvent(working), true);
  assert.equal(state.mergeEvent(completed), true);
  for (const old of [working, { ...working, revision: completed.revision }]) {
    assert.equal(state.mergeSnapshot(old, read), false);
    assert.equal(state.mergeEvent(old), false);
    assert.deepEqual(state.get('one'), completed);
  }
  assert.equal(state.mergeSnapshot({ id: 'two', revision: 1 }, read), true, 'another agent has independent ordering');
  assert.equal(state.mergeSnapshot({ ...completed, revision: 4, status: 'Stopped' }, read), true, 'a newer revision wins even if the request began earlier');
  const first = state.beginRead(), second = state.beginRead();
  state.mergeSnapshot({ ...completed, revision: 6 }, second);
  assert.equal(state.mergeSnapshot({ ...completed, revision: 5 }, first), false);
});

test('legacy reads merge only for agents without an event since the request began', () => {
  const state = createAgentState(), read = state.beginRead();
  const { revision: _, ...legacyWorking } = working;
  const { revision: __, ...legacyCompleted } = completed;
  state.mergeEvent(legacyCompleted);
  assert.equal(state.mergeSnapshot(legacyWorking, read), false);
  assert.deepEqual(state.get('one'), legacyCompleted);
  assert.equal(state.mergeSnapshot({ id: 'two', running: true }, read), true);
  const later = state.beginRead();
  assert.equal(state.mergeSnapshot({ ...legacyCompleted, status: 'Ready' }, later), true, 'an event before the read does not block reconciliation');
  const olderRead = state.beginRead(), newerRead = state.beginRead();
  state.mergeSnapshot({ ...legacyCompleted, status: 'Stopped' }, newerRead);
  assert.equal(state.mergeSnapshot(legacyWorking, olderRead), false, 'overlapping reads cannot go backwards either');
});

test('mixed legacy and revisioned updates retain the request-start event guard', () => {
  const state = createAgentState(), read = state.beginRead();
  state.mergeEvent(completed);
  assert.equal(state.mergeSnapshot({ ...working, revision: undefined }, read), false);
  const next = state.beginRead();
  state.mergeEvent({ ...completed, revision: undefined });
  assert.equal(state.mergeSnapshot({ ...working, revision: 4 }, next), false);
});
