import { z } from 'zod/v4';
import { BoardIdSchema, CardSchema, LinkSchema } from '@aegis/domain/schema';
import type { LegacyBoard } from '@aegis/domain/schema';
import { StoredLibrarySchema } from '@aegis/protocol/storage';
import type { LibraryOperation } from '../../agent/src/library.ts';
import { required } from './required.ts';
const card = (value: unknown) => CardSchema.parse({ text: '', color: 'plain', ...z.record(z.string(), z.unknown()).parse(value) });
const failure = (result: ReturnType<typeof applyLibraryOp>) => { assert.ok(!result.ok); return result.error; };
const success = (result: ReturnType<typeof applyLibraryOp>) => { assert.ok(result.ok); return result; };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLibraryOp, emptyLibrary } from '../../agent/src/library.ts';

const make = () => {
  let lib = emptyLibrary(); const step = (op: LibraryOperation, ids?: string[]) => { const r = applyLibraryOp(lib, op, ids); assert.equal(r.ok, true, r.ok ? '' : r.error); assert.ok(r.ok); lib = r.library; return r.created; };
  const p = required(step({ op: 'create', kind: 'project', name: 'Aegis' }));
  const f = required(step({ op: 'create', kind: 'folder', name: 'Ideas', parent: p }));
  const g = required(step({ op: 'create', kind: 'folder', name: 'Deeper', parent: f }));
  return { lib: () => lib, step, p, f, g };
};

test('projects hold folders, folders hold folders and boards', () => {
  const { lib, step, f, g } = make();
  step({ op: 'move', id: 'board1', parent: g }, ['board1']);
  assert.equal(lib().boards.board1, g);
  assert.equal(required(lib().nodes.find(n => n.id === g)).parent, f);
});

test('a folder cannot move inside itself or below itself', () => {
  const { lib, f, g } = make();
  assert.match(failure(applyLibraryOp(lib(), { op: 'move', id: f, parent: g })), /inside itself/);
  assert.match(failure(applyLibraryOp(lib(), { op: 'move', id: f, parent: f })), /inside itself/);
});

test('projects stay at the top and folders can live at the root', () => {
  const { lib, p, f } = make();
  assert.match(failure(applyLibraryOp(lib(), { op: 'move', id: p, parent: f })), /top level/);
  assert.equal(applyLibraryOp(lib(), { op: 'create', kind: 'folder', name: 'x' }).ok, true);
  assert.equal(required(success(applyLibraryOp(lib(), { op: 'move', id: f, parent: null })).library.nodes.find(n => n.id === f)).parent, null);
});

test('only empty folders can be deleted', () => {
  const { lib, step, f, g } = make();
  assert.match(failure(applyLibraryOp(lib(), { op: 'delete', id: f })), /not empty/);
  step({ op: 'move', id: 'board1', parent: g }, ['board1']);
  assert.match(failure(applyLibraryOp(lib(), { op: 'delete', id: g })), /not empty/);
  step({ op: 'move', id: 'board1', parent: null }, ['board1']);
  step({ op: 'delete', id: g });
  assert.equal(lib().nodes.some(n => n.id === g), false);
});

import { duplicateLibrary, deleteLibrary, moveLibraryBoard, libraryContents, createLibraryActions } from '../../agent/src/library.ts';
import { emptyBoard } from '@aegis/domain/commands';
const ids = () => { let n = 0; return () => (++n).toString(16).padStart(8, '0'); };
const nested = () => {
  const lib = StoredLibrarySchema.parse({ nodes: [{ id: 'project', kind: 'project', name: 'Work', parent: null }, { id: 'folder', kind: 'folder', name: 'Plans', parent: 'project' }], boards: { rootboard: 'folder', childboard: 'folder', otherboard: 'project' } });
  const root = emptyBoard('rootboard', 'Root');
  root.cards = [card({ id: 'card001', type: 'canvas', x: 12, y: 14, w: 260, h: 180, props: { board: 'childboard' } }), card({ id: 'card002', type: 'note', x: 0, y: 0, w: 200, h: 100, parent: 'card001', props: { kids: ['card001'] } })];
  root.links = [LinkSchema.parse({ id: 'link001', a: 'card001', b: 'card002', arrow: 'end' })];
  const child = emptyBoard('childboard', 'Child'); child.parent = BoardIdSchema.parse('rootboard');
  return { lib, boards: [root, child, emptyBoard('otherboard', 'Other')] };
};

test('duplicating a project remaps nested folders, boards, cards and connector endpoints without changing the original', () => {
  const { lib, boards } = nested(), before = JSON.stringify({ lib, boards });
  const result = duplicateLibrary(lib, boards, 'project', ids());
  assert.equal(JSON.stringify({ lib, boards }), before);
  const copiedProject = required(result.library.nodes.find(n => n.id === result.created));
  assert.equal(copiedProject.name, 'Work copy');
  const folder = required(result.library.nodes.find(n => n.parent === copiedProject.id));
  const copy = required(result.boards.find(b => b.name === 'Root' && b.id !== 'rootboard'));
  const child = required(result.boards.find(b => b.parent === copy.id));
  assert.equal(required(required(copy.cards[0]).props).board, child.id);
  assert.equal(result.library.boards[copy.id], folder.id);
  assert.notEqual(required(copy.cards[0]).id, 'card001');
  assert.equal(required(copy.cards[1]).parent, required(copy.cards[0]).id);
  assert.deepEqual(required(required(copy.cards[1]).props).kids, [required(copy.cards[0]).id]);
  assert.equal(required(copy.links[0]).a, required(copy.cards[0]).id);
  assert.equal(required(copy.links[0]).b, required(copy.cards[1]).id);
  assert.notEqual(required(copy.links[0]).id, 'link001');
  assert.equal(required(copy.links[0]).arrow, 'end');
});

test('duplicating a nested board creates an independent board and avoids repeated copy names', () => {
  const { lib, boards } = nested();
  const copy = duplicateLibrary(lib, boards, 'childboard', ids());
  assert.equal(required(copy.boards.at(-1)).parent, undefined);
  assert.equal(required(copy.boards.at(-1)).name, 'Child copy');
  let i = 100; const second = duplicateLibrary(copy.library, copy.boards, 'childboard', () => String(++i));
  assert.equal(required(second.boards.at(-1)).name, 'Child copy 2');
});

test('deleting a non-empty folder deletes child canvases but preserves unrelated boards', () => {
  const { lib, boards } = nested();
  const result = deleteLibrary(lib, boards, 'folder');
  assert.deepEqual(required(result.removed).sort(), ['childboard', 'rootboard']);
  assert.deepEqual(result.boards.map(b => b.id), ['otherboard']);
  assert.equal(result.library.nodes.some(n => n.id === 'folder'), false);
  assert.equal(result.library.nodes.some(n => n.id === 'project'), true);
  assert.equal(result.library.boards.childboard, undefined);
});

test('deleting just a child removes its canvas and attached connectors in the parent', () => {
  const { lib, boards } = nested();
  const result = deleteLibrary(lib, boards, 'childboard');
  assert.deepEqual(required(result.boards[0]).cards.map(c => c.id), ['card002']);
  assert.deepEqual(required(result.boards[0]).links, []);
  assert.ok(required(result.boards[0]).rev > required(boards[0]).rev);
});

test('moving boards prevents cycles, unhooks old cards and carries child library placement', () => {
  const { lib, boards } = nested();
  assert.throws(() => moveLibraryBoard(lib, boards, { id: 'rootboard', boardParent: 'childboard' }, ids()), /inside itself/);
  const moved = moveLibraryBoard(lib, boards, { id: 'rootboard', parent: 'project' }, ids());
  assert.equal(moved.library.boards.childboard, 'project');
  const nestedAgain = moveLibraryBoard(lib, boards, { id: 'childboard', boardParent: 'otherboard', at: { x: -45, y: 99 } }, ids());
  assert.equal(required(nestedAgain.boards[0]).cards.some(c => c.type === 'canvas'), false);
  assert.equal(required(required(required(nestedAgain.boards[2]).cards[0]).props).board, 'childboard');
  assert.equal(required(required(nestedAgain.boards[2]).cards[0]).x, -45);
  assert.equal(required(required(nestedAgain.boards[2]).cards[0]).y, 99);
  assert.equal(nestedAgain.library.boards.childboard, 'project');
});

test('content traversal tolerates a malformed board cycle', () => {
  const { lib, boards } = nested(); required(boards[0]).parent = BoardIdSchema.parse('childboard');
  assert.equal(libraryContents(lib, boards, 'rootboard').boards.size, 2);
});

test('host actions replace the final deleted board and serialise concurrent creation', async () => {
  let library = emptyLibrary(), store = new Map<string, LegacyBoard>([['lastboard', emptyBoard('lastboard')]]), changes = 0;
  const action = createLibraryActions({
    makeId: ids(), newBoard: emptyBoard, listBoards: async () => [...store.values()], loadBoard: async id => structuredClone(store.get(id) ?? null),
    readLibrary: async () => structuredClone(library), writeLibrary: async next => { library = next; },
    writeBoard: async b => { store.set(b.id, b); }, removeBoard: async id => { store.delete(id); }, withBoard: async (id, fn) => fn(), changed: () => changes++,
  });
  const result = await action('delete', { id: 'lastboard' });
  assert.equal(store.size, 1); assert.ok(store.has(required(result.nextBoard)));
  assert.equal(required(store.get(required(result.nextBoard))).name, 'First board');
  await Promise.all([action('createBoard', { name: 'One' }), action('createBoard', { name: 'Two' })]);
  assert.equal(store.size, 3); assert.equal(changes, 3);
  await assert.rejects(action('createBoard', { name: 'Invalid', parent: 'missing' }), /destination/);
  assert.equal(store.size, 3);
});

test('new library items use distinct names within their scope', () => {
  const { lib, step, p } = make();
  step({ op: 'create', kind: 'folder', name: 'Ideas', parent: p });
  assert.ok(lib().nodes.some(n => n.name === 'Ideas 2'));
});

test('project covers can be saved and cleared without changing other library data', () => {
  const { lib, p, f } = make(), before = structuredClone(lib());
  const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
  const saved = applyLibraryOp(lib(), { op: 'cover', id: p, cover: jpeg });
  assert.equal(saved.ok, true); assert.ok(saved.ok);
  assert.equal(required(saved.library.nodes.find(n => n.id === p)).cover, jpeg);
  assert.deepEqual(lib(), before);
  const cleared = applyLibraryOp(saved.library, { op: 'cover', id: p, cover: null });
  assert.ok(cleared.ok);
  assert.equal('cover' in required(cleared.library.nodes.find(n => n.id === p)), false);
  assert.deepEqual(cleared.library, before);
  assert.equal(applyLibraryOp(lib(), { op: 'cover', id: f, cover: jpeg }).ok, false);
  for (const cover of ['https://example.com/image.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', {}, 'data:image/jpeg;base64,abc!']) {
    assert.equal(applyLibraryOp(lib(), { op: 'cover', id: p, cover }).ok, false);
  }
});

