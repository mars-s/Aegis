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

test('projects stay at the top and folders need a home', () => {
  const { lib, p, f } = make();
  assert.match(applyLibraryOp(lib(), { op: 'move', id: p, parent: f }).error, /top level/);
  assert.match(applyLibraryOp(lib(), { op: 'create', kind: 'folder', name: 'x' }).error, /needs a project/);
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
