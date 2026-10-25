import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBatch, emptyBoard, describe } from '../../web/board/commands.js';

const board = () => applyBatch(emptyBoard('b1', 'Test'), { commands: [
  { op: 'create', type: 'note', text: 'one', newId: 'aaaaaaaa', x: 0, y: 0 },
  { op: 'create', type: 'note', text: 'two', newId: 'bbbbbbbb', x: 300, y: 0 },
] }).board;

test('a batch applies all commands and bumps the revision', () => {
  const b = board();
  assert.equal(b.rev, 1);
  assert.deepEqual(b.cards.map(c => c.text), ['one', 'two']);
});

test('a batch with one bad command changes nothing and says why', () => {
  const b = board();
  const r = applyBatch(b, { commands: [{ op: 'update', id: 'aaaaaaaa', set: { text: 'changed' } }, { op: 'move', id: 'missing', x: 1, y: 1 }] });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].index, 1);
  assert.match(r.errors[0].reason, /no card missing/);
  assert.equal(r.board, b, 'returns the untouched board');
  assert.equal(b.cards[0].text, 'one');
});

test('refs let later commands use cards created earlier in the batch', () => {
  const r = applyBatch(board(), { commands: [
    { op: 'create', type: 'title', text: 'Group', ref: 't' },
    { op: 'create', type: 'note', text: 'child', near: '$t', ref: 'c' },
    { op: 'connect', a: '$t', b: '$c' },
    { op: 'focus', ids: ['$t', '$c'] },
  ] });
  assert.equal(r.ok, true);
  assert.equal(r.board.links.length, 1);
  assert.deepEqual(r.board.focus.ids, [r.created.t, r.created.c]);
});

test('cards placed without coordinates never overlap existing cards', () => {
  let b = board();
  for (let i = 0; i < 30; i++) b = applyBatch(b, { commands: [{ op: 'create', type: 'note', text: String(i) }] }).board;
  for (const a of b.cards) for (const c of b.cards) if (a !== c)
    assert.ok(a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y, `${a.text} overlaps ${c.text}`);
});

test('deleting a card removes its links', () => {
  let b = applyBatch(board(), { commands: [{ op: 'connect', a: 'aaaaaaaa', b: 'bbbbbbbb' }] }).board;
  b = applyBatch(b, { commands: [{ op: 'delete', id: 'aaaaaaaa' }] }).board;
  assert.equal(b.links.length, 0);
  assert.deepEqual(b.cards.map(c => c.id), ['bbbbbbbb']);
});

test('grid layout puts cards on a grid', () => {
  const r = applyBatch(board(), { commands: [{ op: 'layout', ids: ['aaaaaaaa', 'bbbbbbbb'], shape: 'column', x: 10, y: 10 }] });
  const [a, b] = r.board.cards;
  assert.equal(a.x, 10); assert.equal(b.x, 10); assert.ok(b.y > a.y + a.h);
});

test('unknown ops and card types are refused with the allowed list', () => {
  assert.match(applyBatch(board(), { commands: [{ op: 'explode' }] }).errors[0].reason, /create, update/);
  assert.match(applyBatch(board(), { commands: [{ op: 'create', type: 'rocket' }] }).errors[0].reason, /note, title/);
});

test('describe gives a model ids, positions and text', () => {
  const d = describe(board());
  assert.deepEqual(d.cards.map(c => [c.id, c.text]), [['aaaaaaaa', 'one'], ['bbbbbbbb', 'two']]);
});

test('notes keep a heading and badge, agents see them, and clearing removes them', () => {
  let r = applyBatch(board(), { commands: [{ op: 'create', type: 'note', text: 'Dump here.', heading: 'How this board works', badge: 'read me first', ref: 'r' }] });
  const id = r.created.r;
  const seen = describe(r.board).cards.find(c => c.id === id);
  assert.equal(seen.heading, 'How this board works'); assert.equal(seen.badge, 'read me first');
  r = applyBatch(r.board, { commands: [{ op: 'update', id, set: { badge: '' } }] });
  assert.equal('badge' in r.board.cards.find(c => c.id === id), false);
});

test('order restacks cards: later in the list draws on top', () => {
  const b = applyBatch(board(), { commands: [{ op: 'create', type: 'note', text: 'three', newId: 'cccccccc', x: 0, y: 400 }] }).board;
  const ids = r => r.board.cards.map(c => c.id);
  assert.deepEqual(ids(applyBatch(b, { commands: [{ op: 'order', ids: ['aaaaaaaa'], to: 'front' }] })), ['bbbbbbbb', 'cccccccc', 'aaaaaaaa']);
  assert.deepEqual(ids(applyBatch(b, { commands: [{ op: 'order', ids: ['cccccccc'], to: 'back' }] })), ['cccccccc', 'aaaaaaaa', 'bbbbbbbb']);
  assert.deepEqual(ids(applyBatch(b, { commands: [{ op: 'order', ids: ['cccccccc'], to: 1 }] })), ['aaaaaaaa', 'cccccccc', 'bbbbbbbb']);
  assert.equal(applyBatch(b, { commands: [{ op: 'order', ids: ['nope'], to: 'front' }] }).ok, false);
});

test('video cards keep their url and get a 16:9 default size', () => {
  const r = applyBatch(board(), { commands: [{ op: 'create', type: 'video', url: 'asset:0123456789abcdef0123456789abcdef.mp4', ref: 'v' }] });
  const v = r.board.cards.find(c => c.id === r.created.v);
  assert.equal(v.url, 'asset:0123456789abcdef0123456789abcdef.mp4'); assert.deepEqual([v.w, v.h], [480, 270]);
});
