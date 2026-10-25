import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLibraryOp, emptyLibrary } from '../library.mjs';

const make = () => {
  let lib = emptyLibrary(); const step = (op, ids) => { const r = applyLibraryOp(lib, op, ids); assert.equal(r.ok, true, r.error); lib = r.library; return r.created; };
  const p = step({ op: 'create', kind: 'project', name: 'Aegis' });
  const f = step({ op: 'create', kind: 'folder', name: 'Ideas', parent: p });
  const g = step({ op: 'create', kind: 'folder', name: 'Deeper', parent: f });
  return { lib: () => lib, step, p, f, g };
};

test('projects hold folders, folders hold folders and boards', () => {
  const { lib, step, f, g } = make();
  step({ op: 'move', id: 'board1', parent: g }, ['board1']);
  assert.equal(lib().boards.board1, g);
  assert.equal(lib().nodes.find(n => n.id === g).parent, f);
});

test('a folder cannot move inside itself or below itself', () => {
  const { lib, f, g } = make();
  assert.match(applyLibraryOp(lib(), { op: 'move', id: f, parent: g }).error, /inside itself/);
  assert.match(applyLibraryOp(lib(), { op: 'move', id: f, parent: f }).error, /inside itself/);
});

test('projects stay at the top and folders can live at the root', () => {
  const { lib, p, f } = make();
  assert.match(applyLibraryOp(lib(), { op: 'move', id: p, parent: f }).error, /top level/);
  assert.equal(applyLibraryOp(lib(), { op: 'create', kind: 'folder', name: 'x' }).ok, true);
  assert.equal(applyLibraryOp(lib(), { op: 'move', id: f, parent: null }).library.nodes.find(n => n.id === f).parent, null);
});

test('only empty folders can be deleted', () => {
  const { lib, step, f, g } = make();
  assert.match(applyLibraryOp(lib(), { op: 'delete', id: f }).error, /not empty/);
  step({ op: 'move', id: 'board1', parent: g }, ['board1']);
  assert.match(applyLibraryOp(lib(), { op: 'delete', id: g }).error, /not empty/);
  step({ op: 'move', id: 'board1', parent: null }, ['board1']);
  step({ op: 'delete', id: g });
  assert.equal(lib().nodes.some(n => n.id === g), false);
});

import { duplicateLibrary, deleteLibrary, moveLibraryBoard, libraryContents, createLibraryActions } from '../library.mjs';
import { emptyBoard, applyBatch } from '../../app/src/lib/board/commands.js';
import '../../app/src/lib/board/types/library.js';
import '../../app/src/lib/board/types/media.js';
import { templateCommands, frameworks, starters } from '../../app/src/features/library/templates.js';
const ids = () => { let n = 0; return () => (++n).toString(16).padStart(8, '0'); };
const nested = () => {
  const lib = { nodes: [{ id: 'project', kind: 'project', name: 'Work', parent: null }, { id: 'folder', kind: 'folder', name: 'Plans', parent: 'project' }], boards: { rootboard: 'folder', childboard: 'folder', otherboard: 'project' } };
  const root = emptyBoard('rootboard', 'Root');
  root.cards = [{ id: 'card001', type: 'canvas', x: 12, y: 14, w: 260, h: 180, props: { board: 'childboard' } }, { id: 'card002', type: 'note', x: 0, y: 0, w: 200, h: 100, parent: 'card001', props: { kids: ['card001'] } }];
  root.links = [{ id: 'link001', a: 'card001', b: 'card002', arrow: 'end' }];
  const child = { ...emptyBoard('childboard', 'Child'), parent: 'rootboard' };
  return { lib, boards: [root, child, emptyBoard('otherboard', 'Other')] };
};

test('duplicating a project remaps nested folders, boards, cards and connector endpoints without changing the original', () => {
  const { lib, boards } = nested(), before = JSON.stringify({ lib, boards });
  const result = duplicateLibrary(lib, boards, 'project', ids());
  assert.equal(JSON.stringify({ lib, boards }), before);
  const copiedProject = result.library.nodes.find(n => n.id === result.created);
  assert.equal(copiedProject.name, 'Work copy');
  const folder = result.library.nodes.find(n => n.parent === copiedProject.id);
  const copy = result.boards.find(b => b.name === 'Root' && b.id !== 'rootboard');
  const child = result.boards.find(b => b.parent === copy.id);
  assert.equal(copy.cards[0].props.board, child.id);
  assert.equal(result.library.boards[copy.id], folder.id);
  assert.notEqual(copy.cards[0].id, 'card001');
  assert.equal(copy.cards[1].parent, copy.cards[0].id);
  assert.deepEqual(copy.cards[1].props.kids, [copy.cards[0].id]);
  assert.equal(copy.links[0].a, copy.cards[0].id);
  assert.equal(copy.links[0].b, copy.cards[1].id);
  assert.notEqual(copy.links[0].id, 'link001');
  assert.equal(copy.links[0].arrow, 'end');
});

test('duplicating a nested board creates an independent board and avoids repeated copy names', () => {
  const { lib, boards } = nested();
  const copy = duplicateLibrary(lib, boards, 'childboard', ids());
  assert.equal(copy.boards.at(-1).parent, undefined);
  assert.equal(copy.boards.at(-1).name, 'Child copy');
  let i = 100; const second = duplicateLibrary(copy.library, copy.boards, 'childboard', () => String(++i));
  assert.equal(second.boards.at(-1).name, 'Child copy 2');
});

test('deleting a non-empty folder deletes child canvases but preserves unrelated boards', () => {
  const { lib, boards } = nested();
  const result = deleteLibrary(lib, boards, 'folder');
  assert.deepEqual(result.removed.sort(), ['childboard', 'rootboard']);
  assert.deepEqual(result.boards.map(b => b.id), ['otherboard']);
  assert.equal(result.library.nodes.some(n => n.id === 'folder'), false);
  assert.equal(result.library.nodes.some(n => n.id === 'project'), true);
  assert.equal(result.library.boards.childboard, undefined);
});

test('deleting just a child removes its canvas and attached connectors in the parent', () => {
  const { lib, boards } = nested();
  const result = deleteLibrary(lib, boards, 'childboard');
  assert.deepEqual(result.boards[0].cards.map(c => c.id), ['card002']);
  assert.deepEqual(result.boards[0].links, []);
  assert.ok(result.boards[0].rev > boards[0].rev);
});

test('moving boards prevents cycles, unhooks old cards and carries child library placement', () => {
  const { lib, boards } = nested();
  assert.throws(() => moveLibraryBoard(lib, boards, { id: 'rootboard', boardParent: 'childboard' }, ids()), /inside itself/);
  const moved = moveLibraryBoard(lib, boards, { id: 'rootboard', parent: 'project' }, ids());
  assert.equal(moved.library.boards.childboard, 'project');
  const nestedAgain = moveLibraryBoard(lib, boards, { id: 'childboard', boardParent: 'otherboard', at: { x: -45, y: 99 } }, ids());
  assert.equal(nestedAgain.boards[0].cards.some(c => c.type === 'canvas'), false);
  assert.equal(nestedAgain.boards[2].cards[0].props.board, 'childboard');
  assert.equal(nestedAgain.boards[2].cards[0].x, -45);
  assert.equal(nestedAgain.boards[2].cards[0].y, 99);
  assert.equal(nestedAgain.library.boards.childboard, 'project');
});

test('content traversal tolerates a malformed board cycle', () => {
  const { lib, boards } = nested(); boards[0].parent = 'childboard';
  assert.equal(libraryContents(lib, boards, 'rootboard').boards.size, 2);
});

test('host actions replace the final deleted board and serialise concurrent creation', async () => {
  let library = emptyLibrary(), store = new Map([['lastboard', emptyBoard('lastboard')]]), changes = 0;
  const action = createLibraryActions({
    makeId: ids(), newBoard: emptyBoard, listBoards: async () => [...store.values()], loadBoard: async id => structuredClone(store.get(id)),
    readLibrary: async () => structuredClone(library), writeLibrary: async next => { library = next; },
    writeBoard: async b => { store.set(b.id, b); }, removeBoard: async id => { store.delete(id); }, withBoard: async (id, fn) => fn(), changed: () => changes++,
  });
  const result = await action('delete', { id: 'lastboard' });
  assert.equal(store.size, 1); assert.ok(store.has(result.nextBoard));
  assert.equal(store.get(result.nextBoard).name, 'First board');
  await Promise.all([action('createBoard', { name: 'One' }), action('createBoard', { name: 'Two' })]);
  assert.equal(store.size, 3); assert.equal(changes, 3);
  await assert.rejects(action('createBoard', { name: 'Invalid', parent: 'missing' }), /destination/);
  assert.equal(store.size, 3);
});

test('all frameworks and starters produce valid, editable board commands with distinct card ids', () => {
  for (const key of [...Object.keys(frameworks), ...Object.keys(starters)]) {
    const board = emptyBoard('testboard'), commands = templateCommands(key, board, ids());
    const result = applyBatch(board, { commands });
    assert.equal(result.ok, true, `${key}: ${JSON.stringify(result.errors)}`);
    assert.ok(result.board.cards.length >= 2);
    assert.equal(new Set(result.board.cards.map(c => c.id)).size, result.board.cards.length);
    assert.equal(JSON.stringify(result.board).includes('Mochi'), false);
    if (key === 'Moodboard') assert.equal(result.board.cards.filter(c => c.type === 'swatch').length, 3);
    if (key === 'opportunity') assert.ok(result.board.links.every(l => l.arrow === 'end'));
  }
});

test('frameworks are placed beside existing content, rather than covering it', () => {
  const board = emptyBoard('testboard'); board.cards.push({ id: 'existing', x: 500, y: -100, w: 300, h: 200 });
  const commands = templateCommands('affinity', board, ids());
  assert.ok(commands.filter(c => c.op === 'create').every(c => c.x >= 1000));
});

import { expandTemplateDrag, templateDropCommands } from '../../app/src/features/library/templates.js';
test('template groups carry their notes, and notes can be moved between groups or out', () => {
  const a = { id: 'groupaaa', type: 'template-group', x: 0, y: 0, w: 288, h: 200 };
  const b = { id: 'groupbbb', type: 'template-group', x: 330, y: 0, w: 288, h: 200 };
  const n = { id: 'notecard', type: 'note', parent: a.id, x: 350, y: 50, w: 200, h: 100 };
  const board = { cards: [a, b, n] };
  assert.deepEqual(expandTemplateDrag([a], board).map(c => c.id), [a.id, n.id]);
  assert.equal(templateDropCommands([n], board, 'move')[0].set.parent, b.id);
  assert.deepEqual(templateDropCommands([a, n], board, 'move'), []);
  n.x = 900;
  assert.equal(templateDropCommands([n], board, 'move')[0].set.parent, '');
});

test('new library items use distinct names within their scope', () => {
  const { lib, step, p } = make();
  step({ op: 'create', kind: 'folder', name: 'Ideas', parent: p });
  assert.ok(lib().nodes.some(n => n.name === 'Ideas 2'));
});
