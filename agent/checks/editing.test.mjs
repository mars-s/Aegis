// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, applyBatch } from '../../app/src/lib/board/commands.js';
import '../../app/src/lib/board/types/index.js';
import { makeClip, cloneCommands, createHistory, arrange, collectionLayout, effectiveFlag, stackCommands } from '../../app/src/features/editing/model.js';
const batch = (board, commands) => { const result = applyBatch(board, { commands }); assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.board; };
const seed = () => batch(emptyBoard('board-a'), [
  { op: 'create', type: 'note', newId: 'aaaaaa', text: 'First', x: 0, y: 0, group: 'group-a' },
  { op: 'create', type: 'todo', newId: 'bbbbbb', text: 'Tasks', x: 300, y: 80, group: 'group-a', items: [{ text: 'Write', done: true }] },
  { op: 'create', type: 'note', newId: 'cccccc', text: 'Third', x: 800, y: 200 },
  { op: 'connect', a: 'aaaaaa', b: 'bbbbbb', newId: 'linkaa', label: 'Next' },
  { op: 'link_update', id: 'linkaa', set: { dash: true, arrow: 'end', bend: 80 } },
]);
test('copy expands groups and remaps links, groups and nested collection membership across boards', () => {
  let board = seed();
  board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: -12, y: -52, props: { kids: ['aaaaaa', 'bbbbbb'], cols: 1 } }, { op: 'update', id: 'aaaaaa', set: { parent: 'collaa', rot: 15, props: { bold: true, tag: 'Read this' } } }]);
  const clip = makeClip(board, ['collaa']); assert.equal(clip.cards.length, 3);
  const pasted = cloneCommands(clip, emptyBoard('board-b'), { x: 1000, y: 600 });
  const saved = batch(emptyBoard('board-b'), pasted.commands), first = saved.cards.find(c => c.text === 'First'), todo = saved.cards.find(c => c.type === 'todo'), coll = saved.cards.find(c => c.type === 'coll');
  assert.notEqual(first.id, 'aaaaaa'); assert.equal(first.parent, coll.id); assert.deepEqual(coll.props.kids, [first.id, todo.id]);
  assert.equal(first.group, todo.group); assert.notEqual(first.group, 'group-a'); assert.equal(first.props.tag, 'Read this'); assert.equal(first.rot, 15);
  assert.equal(saved.links[0].a, first.id); assert.equal(saved.links[0].b, todo.id); assert.equal(saved.links[0].dash, true); assert.equal(saved.links[0].bend, 80);
  const same = batch(board, cloneCommands(makeClip(board, ['cccccc']), board, { x: 0, y: 0 }, 60).commands);
  assert.equal(same.cards.at(-1).x, 860); assert.equal(same.cards.at(-1).y, 260);
});
test('undo and redo restore saved card, link and tray state, branch history and reset on board switch', async () => {
  let board = emptyBoard('history-a'); const apply = commands => { board = batch(board, commands); history.observe(board); };
  const history = createHistory({ read: () => board, apply, delay: 10 }); history.observe(board);
  apply([{ op: 'create', type: 'note', newId: 'aaaaaa', text: 'One' }]);
  apply([{ op: 'update', id: 'aaaaaa', set: { text: 'Two' } }]);
  await new Promise(r => setTimeout(r, 25)); assert.equal(history.status.length, 2);
  apply([{ op: 'board_set', set: { tray: [{ id: 'tray01', text: 'Idea' }] } }]); history.flush();
  assert.equal(history.travel(-1), true); assert.deepEqual(board.tray, []); assert.equal(board.cards[0].text, 'Two');
  assert.equal(history.travel(-1), true); assert.equal(board.cards.length, 0);
  assert.equal(history.travel(1), true); assert.equal(board.cards[0].text, 'Two');
  apply([{ op: 'update', id: 'aaaaaa', set: { text: 'New branch' } }]); history.flush(); assert.equal(history.travel(1), false);
  for (let i = 0; i < 90; i++) { apply([{ op: 'update', id: 'aaaaaa', set: { text: String(i) } }]); history.flush(); }
  assert.equal(history.status.length, 80);
  board = emptyBoard('history-b'); history.observe(board); assert.equal(history.travel(-1), false); assert.equal(history.status.length, 1);
});
test('delete removes attached links and restore returns them through the command path', () => {
  const board = seed(), removed = batch(board, [{ op: 'delete', ids: ['aaaaaa'] }]); assert.equal(removed.links.length, 0);
  const restored = batch(removed, [{ op: 'restore', cards: board.cards, links: board.links, tray: [] }]); assert.deepEqual(restored.cards, board.cards); assert.deepEqual(restored.links, board.links);
});
test('align treats a group as a unit and distribute makes equal gaps for three cards', () => {
  const board = seed(), aligned = batch(board, arrange(board, ['aaaaaa', 'bbbbbb', 'cccccc'], 'top'));
  assert.equal(aligned.cards[1].y - aligned.cards[0].y, 80); assert.equal(aligned.cards[2].y, 0);
  board.cards.forEach(c => { delete c.group; });
  const even = batch(board, arrange(board, board.cards.map(c => c.id), 'distribute-x')).cards;
  assert.equal(even[1].x - even[0].x - even[0].w, even[2].x - even[1].x - even[1].w);
});
test('collection resize changes columns, stacks children and inherited hide and lock apply to children', () => {
  let board = seed(); board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: 0, y: 0, w: 530, props: { kids: ['aaaaaa', 'bbbbbb', 'cccccc'], hidden: true, locked: true } }]);
  board = batch(board, collectionLayout(board, board.cards.at(-1)));
  const coll = board.cards.find(c => c.id === 'collaa'); assert.equal(coll.props.cols, 2); assert.equal(board.cards[0].x, board.cards[2].x); assert.equal(board.cards[1].y, board.cards[0].y);
  assert.equal(effectiveFlag(board, board.cards[0], 'hidden'), true); assert.equal(effectiveFlag(board, board.cards[1], 'locked'), true);
  board = batch(board, collectionLayout(board, coll, coll.props.kids, 300)); assert.equal(board.cards.at(-1).props.cols, 1); assert.ok(board.cards[1].y > board.cards[0].y);
});
test('inherited flags follow a batch that changes membership without changing the card count', () => {
  let board = seed(); board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: 0, y: 0, w: 530, props: { kids: ['aaaaaa'], hidden: true } }]);
  const card = id => board.cards.find(c => c.id === id);
  assert.equal(effectiveFlag(board, card('aaaaaa'), 'hidden'), true); assert.equal(effectiveFlag(board, card('cccccc'), 'hidden'), false);
  board = batch(board, [{ op: 'update', id: 'collaa', set: { props: { kids: ['cccccc'] } } }]);
  assert.equal(effectiveFlag(board, card('aaaaaa'), 'hidden'), false); assert.equal(effectiveFlag(board, card('cccccc'), 'hidden'), true);
  board = batch(board, [{ op: 'update', id: 'bbbbbb', set: { parent: 'collaa' } }]);
  assert.equal(effectiveFlag(board, card('bbbbbb'), 'hidden'), true);
});
test('stack shortcuts move one step or all the way while preserving selection order', () => {
  let board = seed(); board = batch(board, stackCommands(board, ['aaaaaa'], 'forward')); assert.deepEqual(board.cards.map(c => c.id), ['bbbbbb', 'aaaaaa', 'cccccc']);
  board = batch(board, stackCommands(board, ['aaaaaa'], 'front')); assert.equal(board.cards.at(-1).id, 'aaaaaa');
  board = batch(board, stackCommands(board, ['aaaaaa'], 'backward')); assert.equal(board.cards[1].id, 'aaaaaa');
});
test('undo and redo include palette changes without changing the camera or background', () => {
  let board = seed(); board.bg = '#123456'; board.view = { x: 100, y: 200, z: 2 };
  const history = createHistory({ read: () => board, apply: commands => { board = batch(board, commands); } }); history.observe(board);
  board = batch(board, [{ op: 'board_set', set: { palette: [{ hex: '#abcdef', name: 'Sky' }] } }]); history.flush();
  assert.equal(history.travel(-1), true); assert.deepEqual(board.palette, []); assert.equal(board.bg, '#123456'); assert.equal(board.view.z, 2);
  assert.equal(history.travel(1), true); assert.equal(board.palette[0].hex, '#abcdef');
});
test('history waits until a drag has settled before recording a snapshot', async () => {
  let board = seed(), dragging = false;
  const history = createHistory({ read: () => board, apply: commands => { board = batch(board, commands); }, busy: () => dragging, delay: 10 }); history.observe(board);
  dragging = true; board = batch(board, [{ op: 'move', id: 'aaaaaa', x: 80, y: 50 }]); history.observe(board);
  await new Promise(r => setTimeout(r, 25)); assert.equal(history.status.length, 1);
  board = batch(board, [{ op: 'move', id: 'aaaaaa', x: 120, y: 100 }]); dragging = false; history.observe(board);
  await new Promise(r => setTimeout(r, 25)); assert.equal(history.status.length, 2); history.travel(-1); assert.equal(board.cards[0].x, 0);
});
