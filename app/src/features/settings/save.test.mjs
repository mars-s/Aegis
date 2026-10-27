import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue } from './save.js';
import { repairBatch } from './preferences.js';
import { applyBatch, emptyBoard } from '@aegis/domain/commands';

test('failed saves retain later edits and retry in order against a real board', async () => {
  let board = emptyBoard('boardaa'), online = false;
  const states = [], failures = [];
  const queue = createSaveQueue({
    post: async (id, commands) => { if (!online) throw new Error('offline'); const result = applyBatch(board, { commands }); if (result.ok) board = result.board; return result; },
    reload: async () => {}, changed: state => states.push(state), failed: error => failures.push(error.message),
  });
  await queue.add(board.id, [{ op: 'create', newId: 'noteaa', type: 'note', text: 'Original' }]);
  await queue.add(board.id, [{ op: 'update', id: 'noteaa', set: { text: 'Later edit' } }]);
  assert.equal(board.cards.length, 0); assert.equal(queue.pending, true); assert.equal(states.at(-1), 'not saved');
  online = true; await queue.retry();
  assert.equal(board.cards.length, 1); assert.equal(board.cards[0].text, 'Later edit'); assert.equal(queue.pending, false);
  assert.deepEqual(failures, ['offline']); assert.deepEqual(states, ['saved', 'saving', 'not saved', 'saving', 'saved']);
});

test('edits made while a request is pending are not reported saved early', async () => {
  let release, requests = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const states = [];
  const queue = createSaveQueue({ post: async () => { requests++; await gate; return { ok: true }; }, reload: async () => {}, changed: value => states.push(value), failed: error => { throw error; } });
  const first = queue.add('boardaa', []); queue.add('boardaa', []);
  assert.equal(queue.pending, true); assert.equal(requests, 1); assert.equal(states.at(-1), 'saving');
  release(); await first; assert.equal(requests, 2); assert.equal(queue.pending, false); assert.equal(states.at(-1), 'saved');
});

test('corrupted card geometry and malformed commands become finite before board application', () => {
  let board = applyBatch(emptyBoard('boardaa'), { commands: [{ op: 'create', newId: 'noteaa', type: 'note', x: 10, y: 20 }] }).board;
  board.cards[0].x = NaN; board.cards[0].w = -1; board.cards[0].rot = Infinity;
  const commands = repairBatch(board, [
    { op: 'update', id: 'noteaa', set: { y: Infinity, h: -20 } },
    { op: 'create', newId: 'notebb', type: 'note', x: NaN, y: Infinity, w: 0, h: NaN, rot: Infinity },
  ]);
  const result = applyBatch(board, { commands }); assert.equal(result.ok, true);
  assert.ok(result.board.cards.every(c => ['x', 'y', 'w', 'h', 'rot'].every(k => Number.isFinite(c[k]))));
  assert.ok(result.board.cards.every(c => c.w > 0 && c.h > 0));
  assert.doesNotThrow(() => JSON.stringify(commands));
});

test('an edit arriving during reload keeps the same drain pending until it is saved', async () => {
  let release, reloading;
  const inReload = new Promise(resolve => { reloading = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const states = []; let requests = 0, reads = 0;
  const queue = createSaveQueue({ post: async () => { requests++; return { ok: true }; }, reload: async () => { if (++reads === 1) { reloading(); await gate; } }, changed: value => states.push(value), failed: error => { throw error; } });
  const draining = queue.add('boardaa', []); await inReload; queue.add('boardaa', []);
  release(); await draining;
  assert.equal(requests, 2); assert.equal(reads, 2); assert.equal(queue.pending, false); assert.deepEqual(states, ['saved', 'saving', 'saved']);
});
