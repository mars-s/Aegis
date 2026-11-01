import { describe, expect, it } from 'vitest';
import { AgentIdSchema, BoardIdSchema } from '@aegis/domain/schema';
import { AgentSnapshotSchema } from './schema.js';
import { createAgentStore } from './store.js';
import { defaultStatusModel } from './model-choice.js';
import { edgeLayout, freeAgentRect } from './geometry.js';
import { requestResult } from './results.js';

const board = BoardIdSchema.parse('board-a');
function snapshot(revision: number | undefined, running = true) {
  return AgentSnapshotSchema.parse({ id: 'agent-a', boardId: board, ...(revision === undefined ? {} : { revision }), brief: 'My request', model: { provider: 'fake', modelId: 'fake' }, created: 1, status: running ? 'Working' : 'Ready', running, parent: null, title: null, text: running ? '' : 'Completed answer', error: null });
}

describe('agent revisions', () => {
  it('a delayed working GET cannot replace completion, or notify subscribers', () => {
    const store = createAgentStore(board), read = store.beginRead();
    expect(store.mergeEvent(snapshot(3, false))).toBe(true);
    const completed = store.getSnapshot(); let notifications = 0;
    const off = store.subscribe(() => { notifications++; });
    expect(store.mergeSnapshot(snapshot(2), read)).toBe(false);
    expect(store.mergeEvent(snapshot(3))).toBe(false);
    expect(store.getSnapshot()).toBe(completed);
    expect(store.get(AgentIdSchema.parse('agent-a'))?.text).toBe('Completed answer');
    expect(notifications).toBe(0); off();
  });
  it('unrevisioned GETs are rejected after a per-agent event', () => {
    const store = createAgentStore(board), read = store.beginRead();
    store.mergeEvent(snapshot(undefined, false));
    expect(store.mergeSnapshot(snapshot(undefined), read)).toBe(false);
    expect(store.getSnapshot()[0]?.running).toBe(false);
    expect(store.mergeSnapshot({ ...snapshot(undefined), id: AgentIdSchema.parse('agent-b') }, read)).toBe(true);
  });
  it('read completion order cannot roll an unrevisioned agent backwards', () => {
    const store = createAgentStore(board), older = store.beginRead(), newer = store.beginRead();
    store.mergeSnapshot(snapshot(undefined, false), newer);
    expect(store.mergeSnapshot(snapshot(undefined), older)).toBe(false);
    expect(store.getSnapshot()[0]?.text).toBe('Completed answer');
  });
  it('invalid snapshots and results for another board do not enter the store', () => {
    const store = createAgentStore(board), before = store.getSnapshot();
    expect(store.mergeEvent({ ...snapshot(1), boardId: 'board-b' })).toBe(false);
    expect(store.mergeEvent({ ...snapshot(1), running: 'yes' })).toBe(false);
    expect(store.getSnapshot()).toBe(before);
  });
});

describe('spatial agent controls', () => {
  it('an exact-width identity fits after a fractional pan', () => {
    const area = { x: 23.131, y: -8.35, w: 280, h: 400 };
    expect(freeAgentRect([], [], { x: 25, y: 10 }, 60, null, area, 280).x).toBe(area.x);
  });
  it('crowded edge targets retain every identity and direction order', () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({ id: `agent-${i}`, created: i, dx: 10000, dy: i * 10 }));
    const group = edgeLayout(entries, 1586, 992).find(group => group.side === 'right');
    expect(group?.crowded).toBe(true);
    expect(group?.entries.map(entry => entry.id)).toEqual(entries.map(entry => entry.id));
  });
  it('three close directions keep distinct 44px hit areas at least 48px apart', () => {
    const group = edgeLayout([0, 1, 2].map(i => ({ id: `${i}`, created: i, dx: 10000, dy: i })), 1586, 992).find(group => group.side === 'right');
    expect(group?.crowded).toBe(false);
    const entries = group?.entries ?? [];
    expect(entries).toHaveLength(3);
    expect((entries[1]?.y ?? 0) - (entries[0]?.y ?? 0)).toBeGreaterThanOrEqual(48);
    expect((entries[2]?.y ?? 0) - (entries[1]?.y ?? 0)).toBeGreaterThanOrEqual(48);
  });
});

describe('request presentation', () => {
  it('status model defaults prefer a connected small model', () => {
    const models = [ {provider:'claude',modelId:'haiku',name:'Small'}, {provider:'openai',modelId:'luna',name:'Fast'}, {provider:'fake',modelId:'fake',name:'Review'} ];
    expect(defaultStatusModel(models, model => model.provider === 'openai')).toEqual(models[1]);
  });
  it('completion frames every surviving affected card and counts creates, edits and deletes', () => {
    const agent = AgentSnapshotSchema.parse({ ...snapshot(4, false), history: [{ id: 'request', brief: 'Arrange', started: 1, finished: 2, elapsedMs: 1, summary: 'Updated', changes: [ { id:'one',title:'One',previousTitle:null,actions:['Created'] }, { id:'two',title:'Two',previousTitle:null,actions:['Moved','Edited'] }, { id:'gone',title:'Gone',previousTitle:null,actions:['Deleted'] } ], undone: false, undoBlockedReason:null, canUndo:true }] });
    expect(requestResult(agent)?.label).toBe('Created 1 window · Updated 1 · Deleted 1');
    expect(requestResult(agent)?.ids).toEqual(['one','two']);
    expect(requestResult({ ...agent, history: agent.history.map(entry => ({...entry,undone:true})) })).toBeNull();
  });
});
