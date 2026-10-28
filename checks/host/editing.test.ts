import { CardIdSchema, BoardSchema, CommandSchema } from '@aegis/domain/schema';
import type { Board } from '@aegis/domain/schema';
import { required } from './required.ts';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '@aegis/domain/commands';
import { applyBatch } from './batch.ts';
import { makeClip, cloneCommands, createHistory, createWorkspace, historyStateCount, arrange, collectionLayout, effectiveFlag, stackCommands } from './adapters/editing.ts';
const batch = (board: Board, commands: unknown[]) => { const result = applyBatch(board, { commands }); assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.board; };
const seed = () => batch(emptyBoard('board-a'), [
  { op: 'create', type: 'note', newId: 'aaaaaa', text: 'First', x: 0, y: 0, group: 'group-a' },
  { op: 'create', type: 'todo', newId: 'bbbbbb', text: 'Tasks', x: 300, y: 80, group: 'group-a', items: [{ text: 'Write', done: true }] },
  { op: 'create', type: 'note', newId: 'cccccc', text: 'Third', x: 800, y: 200 },
  { op: 'connect', a: 'aaaaaa', b: 'bbbbbb', newId: 'linkaa', label: 'Next' },
  { op: 'link_update', id: 'linkaa', set: { dash: true, arrow: 'end', bend: 80 } },
]);
test('copy expands groups and remaps links, groups and nested collection membership across boards', () => {
  let board = seed();
  board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: -12, y: -52, props: { kids: ['aaaaaa', 'bbbbbb'], cols: 1 } }, { op: 'update', id: 'aaaaaa', set: { parent: 'collaa', rot: 15, props: { bold: true, tag: 'Read this' } } }, { op: 'update', id: 'bbbbbb', set: { parent: 'collaa' } }]);
  const clip = makeClip(board, ['collaa']); assert.equal(clip.cards.length, 3);
  const pasted = cloneCommands(clip, emptyBoard('board-b'), { x: 1000, y: 600 });
  const saved = batch(emptyBoard('board-b'), pasted.commands), first = required(saved.cards.find(c => c.text === 'First')), todo = required(saved.cards.find(c => c.type === 'todo')), coll = required(saved.cards.find(c => c.type === 'coll'));
  assert.notEqual(first.id, 'aaaaaa'); assert.equal(first.parent, coll.id); assert.deepEqual(required(coll.props).kids, [first.id, todo.id]);
  assert.equal(first.group, todo.group); assert.notEqual(first.group, 'group-a'); assert.equal(required(first.props).tag, 'Read this'); assert.equal(first.rot, 15);
  assert.equal(required(saved.links[0]).a, first.id); assert.equal(required(saved.links[0]).b, todo.id); assert.equal(required(saved.links[0]).dash, true); assert.equal(required(saved.links[0]).bend, 80);
  const same = batch(board, cloneCommands(makeClip(board, ['cccccc']), board, { x: 0, y: 0 }, 60).commands);
  assert.equal(required(same.cards.at(-1)).x, 860); assert.equal(required(same.cards.at(-1)).y, 260);
});
test('undo and redo restore saved card, link and tray state, branch history and reset on board switch', () => {
  let workspace = createWorkspace({ board: emptyBoard('history-a') });
  const board = () => workspace.scene.snapshot();
  const apply = (commands: unknown[]) => {
    const result = workspace.submit(CommandSchema.array().parse(commands));
    if (result.kind === 'rejected') throw new Error(JSON.stringify(result.errors));
  };
  try {
    // Creating and naming the note is one authored action and one Undo transaction.
    apply([{ op: 'create', type: 'note', newId: 'aaaaaa', text: 'One' }, { op: 'update', id: 'aaaaaa', set: { text: 'Two' } }]);
    assert.equal(historyStateCount(workspace), 2);
    apply([{ op: 'board_set', set: { tray: [{ id: 'tray01', text: 'Idea' }] } }]);
    assert.equal(workspace.undo().kind === 'applied', true); assert.deepEqual(board().tray, []); assert.equal(required(board().cards[0]).text, 'Two');
    assert.equal(workspace.undo().kind === 'applied', true); assert.equal(board().cards.length, 0);
    assert.equal(workspace.redo().kind === 'applied', true); assert.equal(required(board().cards[0]).text, 'Two');
    apply([{ op: 'update', id: 'aaaaaa', set: { text: 'New branch' } }]); assert.equal(workspace.redo().kind === 'applied', false);
    for (let i = 0; i < 90; i++) apply([{ op: 'update', id: 'aaaaaa', set: { text: String(i) } }]);
    assert.equal(historyStateCount(workspace), 81);
    workspace.dispose(); workspace = createWorkspace({ board: emptyBoard('history-b') });
    assert.equal(workspace.undo().kind === 'applied', false); assert.equal(historyStateCount(workspace), 1);

    const separate = createWorkspace({ board: emptyBoard('separate-actions') }), id = CardIdSchema.parse('separatenote');
    try {
      assert.equal(separate.submit([{ op: 'create', type: 'note', newId: id, text: 'One' }]).kind, 'applied');
      assert.equal(separate.submit([{ op: 'update', id, set: { text: 'Two' } }]).kind, 'applied');
      assert.equal(required(separate.scene.snapshot().cards[0]).text, 'Two');
      assert.equal(separate.undo().kind, 'applied');
      assert.equal(required(separate.scene.snapshot().cards[0]).text, 'One');
      assert.equal(separate.undo().kind, 'applied');
      assert.equal(separate.scene.snapshot().cards.length, 0);
    } finally { separate.dispose(); }
  } finally { workspace.dispose(); }
});
test('delete removes attached links and restore returns them through the command path', () => {
  const board = seed(), removed = batch(board, [{ op: 'delete', ids: ['aaaaaa'] }]); assert.equal(removed.links.length, 0);
  const restored = batch(removed, [{ op: 'restore', cards: board.cards, links: board.links, tray: [] }]); assert.deepEqual(restored.cards, board.cards); assert.deepEqual(restored.links, board.links);
});
test('align treats a group as a unit and distribute makes equal gaps for three cards', () => {
  const board = seed(), aligned = batch(board, arrange(board, ['aaaaaa', 'bbbbbb', 'cccccc'], 'top'));
  assert.equal(required(aligned.cards[1]).y - required(aligned.cards[0]).y, 80); assert.equal(required(aligned.cards[2]).y, 0);
  board.cards.forEach(c => { delete c.group; });
  const even = batch(board, arrange(board, board.cards.map(c => c.id), 'distribute-x')).cards;
  assert.equal(required(even[1]).x - required(even[0]).x - required(even[0]).w, required(even[2]).x - required(even[1]).x - required(even[1]).w);
});
test('collection resize changes columns, stacks children and inherited hide and lock apply to children', () => {
  let board = seed(); board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: 0, y: 0, w: 530, props: { kids: ['aaaaaa', 'bbbbbb', 'cccccc'], hidden: true, locked: true } }]);
  const card = (id: string) => required(board.cards.find(c => c.id === id));
  board = batch(board, collectionLayout(board, card('collaa')));
  const coll = card('collaa'); assert.equal(required(coll.props).cols, 2); assert.equal(card('aaaaaa').x, card('cccccc').x); assert.equal(card('bbbbbb').y, card('aaaaaa').y);
  assert.equal(effectiveFlag(board, card('aaaaaa'), 'hidden'), true); assert.equal(effectiveFlag(board, card('bbbbbb'), 'locked'), true);
  board = batch(board, collectionLayout(board, coll, required(coll.props).kids, 300)); assert.equal(required(card('collaa').props).cols, 1); assert.ok(card('bbbbbb').y > card('aaaaaa').y);
});
test('inherited flags follow a batch that changes membership without changing the card count', () => {
  let board = seed(); board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: 0, y: 0, w: 530, props: { kids: ['aaaaaa'], hidden: true } }]);
  const card = (id: string) => required(board.cards.find(c => c.id === id));
  assert.equal(effectiveFlag(board, card('aaaaaa'), 'hidden'), true); assert.equal(effectiveFlag(board, card('cccccc'), 'hidden'), false);
  board = batch(board, [{ op: 'update', id: 'collaa', set: { props: { kids: ['cccccc'] } } }]);
  assert.equal(effectiveFlag(board, card('aaaaaa'), 'hidden'), false); assert.equal(effectiveFlag(board, card('cccccc'), 'hidden'), true);
  board = batch(board, [{ op: 'update', id: 'bbbbbb', set: { parent: 'collaa' } }]);
  assert.equal(effectiveFlag(board, card('bbbbbb'), 'hidden'), true);
});
test('stack shortcuts move one step or all the way while preserving selection order', () => {
  let board = seed(); board = batch(board, stackCommands(board, ['aaaaaa'], 'forward')); assert.deepEqual(board.cards.map(c => c.id), ['bbbbbb', 'aaaaaa', 'cccccc']);
  board = batch(board, stackCommands(board, ['aaaaaa'], 'front')); assert.equal(required(board.cards.at(-1)).id, 'aaaaaa');
  board = batch(board, stackCommands(board, ['aaaaaa'], 'backward')); assert.equal(required(board.cards[1]).id, 'aaaaaa');
});
test('undo and redo include palette changes without changing the camera or background', () => {
  let board = seed(); board.bg = '#123456'; board.view = { x: 100, y: 200, z: 2 };
  const history = createHistory({ read: () => board, apply: commands => { board = batch(board, commands); } }); history.observe(board);
  board = batch(board, [{ op: 'board_set', set: { palette: [{ hex: '#abcdef', name: 'Sky' }] } }]); history.flush();
  assert.equal(history.travel(-1), true); assert.deepEqual(board.palette, []); assert.equal(board.bg, '#123456'); assert.equal(board.view.z, 2);
  assert.equal(history.travel(1), true); const palette = required(BoardSchema.shape.palette.parse(board.palette));
  assert.equal(required(palette[0]).hex, '#abcdef');
});
test('history waits until a drag has settled before recording a snapshot', async () => {
  let board = seed(), dragging = false;
  const history = createHistory({ read: () => board, apply: commands => { board = batch(board, commands); }, busy: () => dragging }); history.observe(board);
  dragging = true; board = batch(board, [{ op: 'move', id: 'aaaaaa', x: 80, y: 50 }]); history.observe(board);
  await new Promise(r => setTimeout(r, 25)); assert.equal(history.status.length, 1);
  board = batch(board, [{ op: 'move', id: 'aaaaaa', x: 120, y: 100 }]); dragging = false; history.observe(board);
  await new Promise(r => setTimeout(r, 25)); assert.equal(history.status.length, 2); history.travel(-1); assert.equal(required(board.cards[0]).x, 0);
});

test('collections retain drop columns, insert by drop height, add side columns and detach cleanly', async () => {
  const { collectionDrop } = await import('./adapters/editing.ts');
  let board = seed();
  board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: 0, y: 0, w: 530, props: { kids: [] } }]);
  const card = (id: string) => required(board.cards.find(c => c.id === id));
  board = batch(board, collectionDrop(board, [card('aaaaaa')], { x: 400, y: 100 }));
  assert.deepEqual(collectionDrop(board, [card('collaa'), card('aaaaaa')], { x: 400, y: 100 }), []);
  assert.equal(required(required(card('collaa').props).colOf).aaaaaa, 1); assert.equal(card('aaaaaa').parent, 'collaa');
  board = batch(board, collectionDrop(board, [card('bbbbbb')], { x: 400, y: 80 }));
  assert.deepEqual(required(card('collaa').props).kids, ['bbbbbb', 'aaaaaa']); assert.equal(card('aaaaaa').x, card('bbbbbb').x); assert.ok(card('aaaaaa').y > card('bbbbbb').y);
  board = batch(board, collectionDrop(board, [card('aaaaaa')], { x: 20, y: 100 }));
  assert.equal(required(required(card('collaa').props).colOf).aaaaaa, 0); assert.notEqual(card('aaaaaa').x, card('bbbbbb').x);
  board = batch(board, collectionDrop(board, [card('cccccc')], { x: 550, y: 80 }));
  assert.equal(required(card('collaa').props).cols, 3); assert.equal(required(required(card('collaa').props).colOf).cccccc, 2);
  board = batch(board, collectionDrop(board, [card('aaaaaa')], { x: -500, y: -500 }));
  assert.equal(card('aaaaaa').parent || '', ''); assert.equal(required(required(card('collaa').props).kids).includes(CardIdSchema.parse('aaaaaa')), false); assert.equal('aaaaaa' in required(required(card('collaa').props).colOf), false);
});
test('collection layout uses shortest unassigned column, preserves image ratio and removes header space', () => {
  let board = seed(); required(board.cards[0]).h = 400; required(board.cards[1]).h = 80;
  const coll = { id: 'collaa', type: 'coll', x: 0, y: 0, w: 530, h: 180, props: { kids: ['aaaaaa', 'bbbbbb', 'cccccc'] } };
  board = batch(board, [{ ...coll, op: 'create', newId: coll.id }, ...collectionLayout(board, coll)]);
  const savedParent = required(board.cards.find(c => c.id === coll.id));
  assert.equal(required(required(savedParent.props).colOf).cccccc, 1);
  const before = required(board.cards.find(c => c.id === 'aaaaaa')).y;
  const parent = { ...savedParent, props: { ...savedParent.props, head: false } };
  board = batch(board, [{ op: 'update', id: parent.id, set: { props: { head: false } } }, ...collectionLayout(board, parent)]);
  assert.equal(required(board.cards.find(c => c.id === 'aaaaaa')).y, before - 60);
  const image = required(board.cards.find(c => c.id === 'aaaaaa')); image.type = 'image'; image.w = 400; image.h = 200;
  const command = required(collectionLayout(board, parent).find(c => c.op === 'update' && c.id === image.id));
  assert.equal(command.op, 'update');
  assert.equal(required(command.set.w) / required(command.set.h), 2);
});
test('layer parents use the smallest section, preserve collection ownership and carry geometric descendants', async () => {
  const { layerParents, layerDescendants } = await import('./adapters/editing.ts');
  const board = { cards: [
    { id: 'outer', type: 'section', x: 0, y: 0, w: 1000, h: 1000 },
    { id: 'inner', type: 'section', x: 100, y: 100, w: 400, h: 400 },
    { id: 'note', type: 'note', x: 200, y: 200, w: 100, h: 100 },
    { id: 'coll', type: 'coll', x: 600, y: 200, w: 100, h: 100, props: { kids: ['child'] } },
    { id: 'child', type: 'note', x: 200, y: 200, w: 50, h: 50 },
  ] };
  const parents = layerParents(board); assert.equal(parents.get('inner'), 'outer'); assert.equal(parents.get('note'), 'inner'); assert.equal(parents.get('child'), 'coll');
  assert.deepEqual(layerDescendants(board, ['inner']).map(c => c.id), ['inner', 'note']);
  required(board.cards[2]).x = 700; assert.equal(layerParents(board).get('note'), 'outer');
});
test('near-angle rotation snaps without Shift and Shift snaps farther angles', async () => {
  const { snapRotation, lineHeightDefault } = await import('./adapters/editing.ts');
  assert.equal(snapRotation(14), 15); assert.equal(snapRotation(12, false, true), 15); assert.equal(snapRotation(12), 12); assert.equal(snapRotation(22, true), 15); assert.equal(snapRotation(359), 0); assert.equal(snapRotation(-29), -30);
  assert.equal(lineHeightDefault('title'), 1); assert.equal(lineHeightDefault('note'), 1.45); assert.equal(lineHeightDefault('todo'), 1.35);
});
test('new toolbar tools enter at default positions without losing custom order or resurrecting old tools', async () => {
  const { toolbarOrder } = await import('./adapters/editing.ts');
  assert.deepEqual(toolbarOrder(['pointer', 'note', 'coll', 'image', 'draw'], ['draw', 'note', 'pointer', 'image', 'removed']), ['draw', 'note', 'coll', 'pointer', 'image']);
  assert.deepEqual(toolbarOrder(['pointer', 'note', 'image']), ['pointer', 'note', 'image']);
});
