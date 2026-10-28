// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { describe, expect, it } from 'vitest';
import { applyBatch as reduceBatch, emptyBoard } from '@aegis/domain/commands';
import { collectionLayout } from '@aegis/domain/collection';
import { BoardIdSchema, BoardSchema, CardIdSchema, CardSchema, CommandSchema } from '@aegis/domain/schema';
import type { Board, Card } from '@aegis/domain/schema';
import { decodeStoredBoard } from '@aegis/protocol/storage';
import { createWorkspace } from '../../workspace/index.js';
import { collectionDrop } from './collection-operations.js';
import { layerDescendants, layerParents } from './layers.js';
import { arrange, cloneCommands, effectiveFlag, lineHeightDefault, makeClip, snapRotation, stackCommands, toolbarOrder } from './operations.js';

// Ported from checks/host/editing.test.ts, run against the TypeScript editing modules and the workspace store the app ships.
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Expected fixture value');
  return value;
}
const id = (value: string) => CardIdSchema.parse(value);
const batch = (board: Board, commands: unknown[]) => {
  const result = reduceBatch(board, { commands });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return decodeStoredBoard(result.board);
};
const seed = () => batch(emptyBoard(BoardIdSchema.parse('board-a')), [
  { op: 'create', type: 'note', newId: 'aaaaaa', text: 'First', x: 0, y: 0, group: 'group-a' },
  { op: 'create', type: 'todo', newId: 'bbbbbb', text: 'Tasks', x: 300, y: 80, group: 'group-a', items: [{ text: 'Write', done: true }] },
  { op: 'create', type: 'note', newId: 'cccccc', text: 'Third', x: 800, y: 200 },
  { op: 'connect', a: 'aaaaaa', b: 'bbbbbb', newId: 'linkaa', label: 'Next' },
  { op: 'link_update', id: 'linkaa', set: { dash: true, arrow: 'end', bend: 80 } },
]);
const ids = (...values: string[]) => values.map(id);

describe('editing model', () => {
  it('copy expands groups and remaps links, groups and nested collection membership across boards', () => {
    let board = seed();
    board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: -12, y: -52, props: { kids: ['aaaaaa', 'bbbbbb'], cols: 1 } }, { op: 'update', id: 'aaaaaa', set: { parent: 'collaa', rot: 15, props: { bold: true, tag: 'Read this' } } }, { op: 'update', id: 'bbbbbb', set: { parent: 'collaa' } }]);
    const clip = makeClip(board, ids('collaa')); expect(clip.cards.length).toBe(3);
    const other = emptyBoard(BoardIdSchema.parse('board-b'));
    const pasted = cloneCommands(clip, other, { x: 1000, y: 600 });
    const saved = batch(other, [...pasted.commands]), first = required(saved.cards.find(c => c.text === 'First')), todo = required(saved.cards.find(c => c.type === 'todo')), coll = required(saved.cards.find(c => c.type === 'coll'));
    expect(first.id).not.toBe('aaaaaa'); expect(first.parent).toBe(coll.id); expect(required(coll.props).kids).toEqual([first.id, todo.id]);
    expect(first.group).toBe(todo.group); expect(first.group).not.toBe('group-a'); expect(required(first.props).tag).toBe('Read this'); expect(first.rot).toBe(15);
    expect(required(saved.links[0]).a).toBe(first.id); expect(required(saved.links[0]).b).toBe(todo.id); expect(required(saved.links[0]).dash).toBe(true); expect(required(saved.links[0]).bend).toBe(80);
    const same = batch(board, [...cloneCommands(makeClip(board, ids('cccccc')), board, { x: 0, y: 0 }, 60).commands]);
    expect(required(same.cards.at(-1)).x).toBe(860); expect(required(same.cards.at(-1)).y).toBe(260);
  });

  it('undo and redo restore saved card, link and tray state, branch history and reset on board switch', () => {
    const workspace = createWorkspace({ board: emptyBoard(BoardIdSchema.parse('history-a')) });
    const board = () => workspace.scene.snapshot();
    const apply = (commands: unknown[]) => { const result = workspace.submit(commands.map(command => CommandSchema.parse(command))); if (result.kind !== 'applied') throw new Error(JSON.stringify(result)); };
    apply([{ op: 'create', type: 'note', newId: 'aaaaaa', text: 'One' }]);
    apply([{ op: 'update', id: 'aaaaaa', set: { text: 'Two' } }]);
    apply([{ op: 'board_set', set: { tray: [{ id: 'tray01', text: 'Idea' }] } }]);
    expect(workspace.undo().kind).toBe('applied'); expect(board().tray ?? []).toEqual([]); expect(required(board().cards[0]).text).toBe('Two');
    expect(workspace.undo().kind).toBe('applied'); expect(required(board().cards[0]).text).toBe('One');
    expect(workspace.undo().kind).toBe('applied'); expect(board().cards.length).toBe(0);
    expect(workspace.redo().kind).toBe('applied'); expect(required(board().cards[0]).text).toBe('One');
    apply([{ op: 'update', id: 'aaaaaa', set: { text: 'New branch' } }]); expect(workspace.redo().kind).toBe('rejected');
    for (let i = 0; i < 90; i++) apply([{ op: 'update', id: 'aaaaaa', set: { text: String(i) } }]);
    let undone = 0; while (workspace.undo().kind === 'applied') undone++;
    expect(undone).toBe(80);
    workspace.dispose();
    const next = createWorkspace({ board: emptyBoard(BoardIdSchema.parse('history-b')) });
    expect(next.undo().kind).toBe('rejected'); expect(next.history.getSnapshot()).toEqual({ undo: false, redo: false });
    next.dispose();
  });

  it('delete removes attached links and restore returns them through the command path', () => {
    const board = seed(), removed = batch(board, [{ op: 'delete', ids: ['aaaaaa'] }]); expect(removed.links.length).toBe(0);
    const restored = batch(removed, [{ op: 'restore', cards: board.cards, links: board.links, tray: [] }]); expect(restored.cards).toEqual(board.cards); expect(restored.links).toEqual(board.links);
  });

  // The scene submits a whole drag once, on release (checks/unit/scene/browser.test.ts "drag uses one command batch").
  // History therefore records only the settled position, and one Undo returns the card to where the drag began.
  it('history waits until a drag has settled before recording a snapshot', () => {
    const workspace = createWorkspace({ board: seed() });
    expect(workspace.history.getSnapshot()).toEqual({ undo: false, redo: false });
    expect(workspace.submit([{ op: 'move', id: id('aaaaaa'), x: 120, y: 100 }]).kind).toBe('applied');
    expect(workspace.history.getSnapshot()).toEqual({ undo: true, redo: false });
    expect(workspace.undo().kind).toBe('applied');
    expect(required(workspace.scene.snapshot().cards.find(c => c.id === 'aaaaaa')).x).toBe(0);
    expect(workspace.history.getSnapshot()).toEqual({ undo: false, redo: true });
    workspace.dispose();
  });

  it('align treats a group as a unit and distribute makes equal gaps for three cards', () => {
    const board = seed(), aligned = batch(board, [...arrange(board, ids('aaaaaa', 'bbbbbb', 'cccccc'), 'top')]);
    expect(required(aligned.cards[1]).y - required(aligned.cards[0]).y).toBe(80); expect(required(aligned.cards[2]).y).toBe(0);
    const ungrouped = BoardSchema.parse({ ...board, cards: board.cards.map(({ group: _group, ...card }) => card) });
    const even = batch(ungrouped, [...arrange(ungrouped, ungrouped.cards.map(c => c.id), 'distribute-x')]).cards;
    expect(required(even[1]).x - required(even[0]).x - required(even[0]).w).toBe(required(even[2]).x - required(even[1]).x - required(even[1]).w);
  });

  it('collection resize changes columns, stacks children and inherited hide and lock apply to children', () => {
    let board = seed(); board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: 0, y: 0, w: 530, props: { kids: ['aaaaaa', 'bbbbbb', 'cccccc'], hidden: true, locked: true } }]);
    const card = (value: string): Card => required(board.cards.find(c => c.id === value));
    board = batch(board, [...collectionLayout(board, card('collaa'))]);
    const coll = card('collaa'); expect(required(coll.props).cols).toBe(2); expect(card('aaaaaa').x).toBe(card('cccccc').x); expect(card('bbbbbb').y).toBe(card('aaaaaa').y);
    expect(effectiveFlag(board, card('aaaaaa'), 'hidden')).toBe(true); expect(effectiveFlag(board, card('bbbbbb'), 'locked')).toBe(true);
    board = batch(board, [...collectionLayout(board, coll, required(coll.props).kids, 300)]); expect(required(card('collaa').props).cols).toBe(1); expect(card('bbbbbb').y > card('aaaaaa').y).toBe(true);
  });

  it('inherited flags follow a batch that changes membership without changing the card count', () => {
    let board = seed(); board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: 0, y: 0, w: 530, props: { kids: ['aaaaaa'], hidden: true } }]);
    const card = (value: string): Card => required(board.cards.find(c => c.id === value));
    expect(effectiveFlag(board, card('aaaaaa'), 'hidden')).toBe(true); expect(effectiveFlag(board, card('cccccc'), 'hidden')).toBe(false);
    board = batch(board, [{ op: 'update', id: 'collaa', set: { props: { kids: ['cccccc'] } } }]);
    expect(effectiveFlag(board, card('aaaaaa'), 'hidden')).toBe(false); expect(effectiveFlag(board, card('cccccc'), 'hidden')).toBe(true);
    board = batch(board, [{ op: 'update', id: 'bbbbbb', set: { parent: 'collaa' } }]);
    expect(effectiveFlag(board, card('bbbbbb'), 'hidden')).toBe(true);
  });

  it('stack shortcuts move one step or all the way while preserving selection order', () => {
    let board = seed(); board = batch(board, [...stackCommands(board, ids('aaaaaa'), 'forward')]); expect(board.cards.map(c => c.id)).toEqual(['bbbbbb', 'aaaaaa', 'cccccc']);
    board = batch(board, [...stackCommands(board, ids('aaaaaa'), 'front')]); expect(required(board.cards.at(-1)).id).toBe('aaaaaa');
    board = batch(board, [...stackCommands(board, ids('aaaaaa'), 'backward')]); expect(required(board.cards[1]).id).toBe('aaaaaa');
  });

  it('undo and redo include palette changes without changing the camera or background', () => {
    const start = batch(seed(), [{ op: 'board_set', set: { bg: '#123456' } }]);
    const workspace = createWorkspace({ board: BoardSchema.parse({ ...start, view: { x: 100, y: 200, z: 2 } }) });
    const board = () => workspace.scene.snapshot();
    expect(workspace.submit([{ op: 'board_set', set: { palette: [{ hex: '#abcdef', name: 'Sky' }] } }]).kind).toBe('applied');
    expect(workspace.undo().kind).toBe('applied'); expect(board().palette ?? []).toEqual([]); expect(board().bg).toBe('#123456'); expect(board().view.z).toBe(2);
    expect(workspace.redo().kind).toBe('applied'); const palette = required(BoardSchema.shape.palette.parse(board().palette));
    expect(required(palette[0]).hex).toBe('#abcdef');
    workspace.dispose();
  });

  it('collections retain drop columns, insert by drop height, add side columns and detach cleanly', () => {
    let board = seed();
    board = batch(board, [{ op: 'create', type: 'coll', newId: 'collaa', x: 0, y: 0, w: 530, props: { kids: [] } }]);
    const card = (value: string): Card => required(board.cards.find(c => c.id === value));
    board = batch(board, [...collectionDrop(board, [card('aaaaaa')], { x: 400, y: 100 })]);
    expect(collectionDrop(board, [card('collaa'), card('aaaaaa')], { x: 400, y: 100 })).toEqual([]);
    expect(required(required(card('collaa').props).colOf).aaaaaa).toBe(1); expect(card('aaaaaa').parent).toBe('collaa');
    board = batch(board, [...collectionDrop(board, [card('bbbbbb')], { x: 400, y: 80 })]);
    expect(required(card('collaa').props).kids).toEqual(['bbbbbb', 'aaaaaa']); expect(card('aaaaaa').x).toBe(card('bbbbbb').x); expect(card('aaaaaa').y > card('bbbbbb').y).toBe(true);
    board = batch(board, [...collectionDrop(board, [card('aaaaaa')], { x: 20, y: 100 })]);
    expect(required(required(card('collaa').props).colOf).aaaaaa).toBe(0); expect(card('aaaaaa').x).not.toBe(card('bbbbbb').x);
    board = batch(board, [...collectionDrop(board, [card('cccccc')], { x: 550, y: 80 })]);
    expect(required(card('collaa').props).cols).toBe(3); expect(required(required(card('collaa').props).colOf).cccccc).toBe(2);
    board = batch(board, [...collectionDrop(board, [card('aaaaaa')], { x: -500, y: -500 })]);
    expect(card('aaaaaa').parent || '').toBe(''); expect(required(required(card('collaa').props).kids).includes(id('aaaaaa'))).toBe(false); expect('aaaaaa' in required(required(card('collaa').props).colOf)).toBe(false);
  });

  it('collection layout uses shortest unassigned column, preserves image ratio and removes header space', () => {
    const seeded = seed();
    let board = BoardSchema.parse({ ...seeded, cards: seeded.cards.map((c, i) => i === 0 ? { ...c, h: 400 } : i === 1 ? { ...c, h: 80 } : c) });
    const coll = { id: 'collaa', type: 'coll', x: 0, y: 0, w: 530, h: 180, props: { kids: ['aaaaaa', 'bbbbbb', 'cccccc'] } };
    board = batch(board, [{ ...coll, op: 'create', newId: coll.id }, ...collectionLayout(board, BoardSchema.shape.cards.element.parse({ ...coll, color: 'plain', text: '' }))]);
    const savedParent = required(board.cards.find(c => c.id === coll.id));
    expect(required(required(savedParent.props).colOf).cccccc).toBe(1);
    const before = required(board.cards.find(c => c.id === 'aaaaaa')).y;
    const parent = CardSchema.parse({ ...savedParent, props: { ...savedParent.props, head: false } });
    board = batch(board, [{ op: 'update', id: parent.id, set: { props: { head: false } } }, ...collectionLayout(board, parent)]);
    expect(required(board.cards.find(c => c.id === 'aaaaaa')).y).toBe(before - 60);
    const imaged = BoardSchema.parse({ ...board, cards: board.cards.map(c => c.id === 'aaaaaa' ? { ...c, type: 'image', w: 400, h: 200 } : c) });
    const command = required(collectionLayout(imaged, parent).find(c => c.op === 'update' && c.id === 'aaaaaa'));
    if (command.op !== 'update') throw new Error('Expected an update');
    expect(Number(required(command.set.w)) / Number(required(command.set.h))).toBe(2);
  });

  it('layer parents use the smallest section, preserve collection ownership and carry geometric descendants', () => {
    const cards = [
      { id: 'outer', type: 'section', x: 0, y: 0, w: 1000, h: 1000 },
      { id: 'inner', type: 'section', x: 100, y: 100, w: 400, h: 400 },
      { id: 'note', type: 'note', x: 200, y: 200, w: 100, h: 100 },
      { id: 'coll', type: 'coll', x: 600, y: 200, w: 100, h: 100, props: { kids: ['child'] } },
      { id: 'child', type: 'note', x: 200, y: 200, w: 50, h: 50 },
    ].map(c => ({ color: 'plain', text: '', ...c }));
    const board = (list: typeof cards) => BoardSchema.parse({ id: 'layers', name: 'Layers', rev: 0, cards: list, links: [], view: { x: 0, y: 0, z: 1 } });
    const parents = layerParents(board(cards)); expect(parents.get(id('inner'))).toBe('outer'); expect(parents.get(id('note'))).toBe('inner'); expect(parents.get(id('child'))).toBe('coll');
    expect(layerDescendants(board(cards), ids('inner')).map(c => c.id)).toEqual(['inner', 'note']);
    expect(layerParents(board(cards.map(c => c.id === 'note' ? { ...c, x: 700 } : c))).get(id('note'))).toBe('outer');
  });

  it('near-angle rotation snaps without Shift and Shift snaps farther angles', () => {
    expect(snapRotation(14)).toBe(15); expect(snapRotation(12, false, true)).toBe(15); expect(snapRotation(12)).toBe(12); expect(snapRotation(22, true)).toBe(15); expect(snapRotation(359)).toBe(0); expect(snapRotation(-29)).toBe(-30);
    expect(lineHeightDefault('title')).toBe(1); expect(lineHeightDefault('note')).toBe(1.45); expect(lineHeightDefault('todo')).toBe(1.35);
  });

  it('new toolbar tools enter at default positions without losing custom order or resurrecting old tools', () => {
    expect(toolbarOrder(['pointer', 'note', 'coll', 'image', 'draw'], ['draw', 'note', 'pointer', 'image', 'removed'])).toEqual(['draw', 'note', 'coll', 'pointer', 'image']);
    expect(toolbarOrder(['pointer', 'note', 'image'])).toEqual(['pointer', 'note', 'image']);
  });
});
