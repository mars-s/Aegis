import { decodeStoredBoard } from '@aegis/protocol/storage';
import type { Board } from '@aegis/domain/schema';
import { required } from './required.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBatch } from './batch.ts';
import { emptyBoard, describe } from '@aegis/domain/commands';
const run = (b: Board, commands: unknown[]) => applyBatch(b, { commands });
function linked() {
  return run(emptyBoard('drawing'), [
    ...['aaaaaa', 'bbbbbb', 'cccccc'].map((newId, i) => ({ op: 'create', newId, x: i * 300, y: 0 })),
    { op: 'connect', a: 'aaaaaa', b: 'bbbbbb', newId: 'linkaa' },
  ]).board;
}
test('drawing card props survive commands, description and JSON persistence', () => {
  const commands = [
    { op: 'create', type: 'ink', props: { points: [[0, 0, 1], [20, 30, 4]], pen: 'hi', size: 24, ink: '#ff0000', ow: 40, oh: 40 } },
    { op: 'create', type: 'shape', text: 'Decision', props: { shape: 'diamond', fill: 'none', stroke: '#123456' } },
    { op: 'create', type: 'path', props: { points: [{ x: 0, y: 0, ox: 30, oy: 20 }, { x: 70, y: 60, r: 10 }], closed: false } },
    { op: 'create', type: 'stamp', props: { emoji: '🌱' } },
  ];
  const result = run(emptyBoard('drawing'), commands); assert.equal(result.ok, true);
  const saved = decodeStoredBoard(JSON.parse(JSON.stringify(result.board)));
  for (const [i, _c] of saved.cards.entries()) assert.deepEqual(required(describe(saved).cards[i]).props, required(commands[i]).props);
});
test('link_update keeps stable ids, styles, label and pins visible to the host', () => {
  const b = linked(), style = { bend: -60, dash: true, arrow: 'both', colour: '#aabbcc', label: '<A & B>', pa: { u: 1, v: .25 }, pb: { u: 0, v: .75 } };
  assert.equal(required(b.links[0]).id, 'linkaa');
  const result = run(b, [{ op: 'link_update', id: 'linkaa', set: style }]); assert.equal(result.ok, true);
  assert.deepEqual(required(describe(result.board).links[0]), { id: 'linkaa', a: 'aaaaaa', b: 'bbbbbb', ...style });
  assert.equal(required(b.links[0]).bend, undefined);
  const auto = run(result.board, [{ op: 'link_update', id: 'linkaa', set: { pa: null, pb: null, bend: null } }]);
  assert.equal('pa' in required(auto.board.links[0]), false); assert.equal('bend' in required(auto.board.links[0]), false);
});
test('reconnect and removal are atomic, missing cards and invalid styles are refused', () => {
  const b = linked();
  const moved = run(b, [{ op: 'link_update', id: 'linkaa', set: { b: 'cccccc' } }]); assert.equal(required(moved.board.links[0]).b, 'cccccc');
  for (const set of [{ a: 'missing' }, { a: 'bbbbbb' }, { bend: NaN }, { dash: 'yes' }, { arrow: 'unknown' }, { colour: 'url(evil)' }, { pa: { u: .5, v: .5 } }]) {
    const result = run(b, [{ op: 'link_update', id: 'linkaa', set: { label: 'changed', ...set } }]); assert.equal(result.ok, false, JSON.stringify(set)); assert.equal(result.board, b);
  }
  assert.equal(run(b, [{ op: 'link_update', id: 'linkaa', remove: true }]).board.links.length, 0);
  assert.equal(run(b, [{ op: 'link_update', id: 'missing', set: {} }]).ok, false);
});
test('reconnection rejects duplicate undirected pairs and deletion still removes attached links', () => {
  const b = run(linked(), [{ op: 'connect', a: 'cccccc', b: 'aaaaaa', newId: 'linkbb' }]).board;
  assert.equal(run(b, [{ op: 'link_update', id: 'linkaa', set: { b: 'cccccc' } }]).ok, false);
  assert.equal(run(b, [{ op: 'delete', id: 'aaaaaa' }]).board.links.length, 0);
});

