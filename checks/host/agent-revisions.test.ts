import { required } from './required.ts';
type RevisionFixture = { id?: string; running?: boolean; status?: string; turns?: { role: string; text: string }[]; history?: { id: string; finished: number; canUndo?: boolean; undoBlockedReason?: string }[]; text?: string; partial?: string; summary?: string };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as status from '../../agent/dist/status.js';

test('agent revisions advance for every changed field and stay stable across identical reads', () => {
  const revisions = status.createAgentRevisions<RevisionFixture>();
  let state: RevisionFixture = { id: 'one', running: true, status: 'Considering your request and the board', turns: [], history: [], text: '', partial: '' };
  let previous = revisions.snapshot('one', state);
  assert.equal(previous.revision, 1);
  assert.deepEqual(revisions.snapshot('one', structuredClone(state)), previous);
  for (const change of [
    { status: 'Reading the board and its content' }, { partial: 'Here is' },
    { turns: [{ role: 'assistant', text: 'Here is the answer' }], text: 'Here is the answer', partial: '' },
    { running: false }, { history: [{ id: 'request', finished: 100 }] },
    { history: [{ id: 'request', finished: 100, canUndo: false, undoBlockedReason: 'Edited again' }] },
    { summary: 'Finished the part' }, { status: 'Stopped' },
  ]) {
    state = { ...state, ...change };
    const next = revisions.snapshot('one', state);
    assert.equal(next.revision, previous.revision + 1);
    assert.equal(revisions.snapshot('one', structuredClone(state)).revision, next.revision);
    previous = next;
  }
  assert.equal(revisions.snapshot('two', { id: 'two' }).revision, 1, 'agents have independent revisions');
  assert.equal(revisions.snapshot('one', state).revision, previous.revision);
  const captured = revisions.snapshot('three', { turns: required(state.turns) });
  required(state.turns).push({ role: 'user', text: 'A later request' });
  assert.equal(required(captured.turns).length, 1, 'captured snapshots do not change behind their revision');
  const restarted = status.createAgentRevisions({ base: 2 ** 32 });
  assert.ok(restarted.snapshot('one', state).revision > previous.revision);
});

test('a classifier for earlier activity cannot replace the status of newer activity', async () => {
  let timer: () => Promise<void> = async () => { assert.fail('No timer was scheduled'); };
  let finish: (value: string) => void = () => { assert.fail('No summary was started'); };
  const published: string[] = [];
  const tracker = status.createStatusTracker({ schedule: fn => { timer = fn; return 1; },
    summarise: () => new Promise(resolve => { finish = resolve; }), publish: text => published.push(text) });
  tracker.update({ brief: 'First request', tools: [{ name: 'read' }], partial: '' });
  const pending = timer();
  tracker.update({ brief: 'Follow-up request', tools: [{ name: 'write' }], partial: '' });
  finish('Reading the earlier request'); await pending;
  assert.deepEqual(published, []);
  const latest = timer(); finish('Writing the follow-up response'); await latest;
  assert.deepEqual(published, ['Writing the follow-up response']);
  tracker.stop();
});
