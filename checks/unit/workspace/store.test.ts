import { describe, expect, it } from 'vitest';
import { BoardSchema, CardIdSchema, CommandSchema, RevisionSchema } from '@aegis/domain';
import { createWorkspace } from '../../../app/src/workspace/store.js';
import { boardId, boardWith, noteId, otherBoardId, otherId } from './helpers.js';

describe('optimistic workspace', () => {
  it('returns created IDs synchronously and treats one batch as one Undo', () => {
    const workspace = createWorkspace({ board: boardWith() });
    const result = workspace.submit([
      { op: 'create', newId: noteId, type: 'note', text: 'First', ref: 'first' },
      { op: 'create', newId: otherId, type: 'title', text: 'Title', ref: 'second' },
    ]);
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') throw new Error('Expected optimistic success');
    expect(result.created).toEqual({ first: noteId, second: otherId });
    expect(result.ids).toEqual([noteId, otherId]);
    expect(workspace.scene.snapshot().cards).toHaveLength(2);
    expect(workspace.replication.state.getSnapshot().pending).toHaveLength(1);
    expect(workspace.history.getSnapshot()).toEqual({ undo: true, redo: false });
    expect(workspace.undo().kind).toBe('applied');
    expect(workspace.scene.snapshot().cards).toHaveLength(0);
    expect(workspace.history.getSnapshot()).toEqual({ undo: false, redo: true });
    expect(workspace.redo().kind).toBe('applied');
    expect(workspace.scene.snapshot().cards.map(card => card.id)).toEqual([noteId, otherId]);
    expect(workspace.replication.state.getSnapshot().pending).toHaveLength(3);
    workspace.dispose();
  });

  it('reports exact field reasons and leaves board, history and queue unchanged on rejection', () => {
    const workspace = createWorkspace({ board: boardWith() });
    const before = workspace.scene.snapshot();
    const result = workspace.submit([{ op: 'update', id: noteId, set: { text: 'missing' } }]);
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') throw new Error('Expected field errors');
    expect(result.errors[0]).toMatchObject({ index: 0, path: 'commands.0', reason: `no card ${noteId}` });
    expect(workspace.scene.snapshot()).toBe(before);
    expect(workspace.history.getSnapshot()).toEqual({ undo: false, redo: false });
    expect(workspace.replication.state.getSnapshot().pending).toHaveLength(0);
    workspace.dispose();
  });

  it('keeps card sources stable and does not notify bodies for geometry only moves', () => {
    const workspace = createWorkspace({ board: boardWith([{ op: 'create', newId: noteId, text: 'Still' }]) });
    const content = workspace.card(noteId);
    const record = workspace.record(noteId);
    const before = content.getSnapshot();
    let bodies = 0;
    let geometry = 0;
    let scenes = 0;
    content.subscribe(() => { bodies++; });
    record.subscribe(() => { geometry++; });
    workspace.scene.subscribe(() => { scenes++; });
    workspace.submit([{ op: 'move', id: noteId, x: 123, y: 456 }]);
    expect(content).toBe(workspace.card(noteId));
    expect(content.getSnapshot()).toBe(before);
    expect(bodies).toBe(0);
    expect(geometry).toBe(1);
    expect(scenes).toBe(1);
    expect(record.getSnapshot()).toMatchObject({ x: 123, y: 456 });
    workspace.submit([{ op: 'update', id: noteId, set: { text: 'Changed' } }]);
    expect(bodies).toBe(1);
    expect(content.getSnapshot()).toMatchObject({ text: 'Changed' });
    workspace.dispose();
  });

  it('updates all snapshots before notifying any subscriber', () => {
    const workspace = createWorkspace({ board: boardWith([{ op: 'create', newId: noteId, text: 'Before' }]) });
    const body = workspace.card(noteId);
    const seen: unknown[] = [];
    workspace.metadata.subscribe(() => { seen.push(body.getSnapshot()); });
    workspace.submit([{ op: 'update', id: noteId, set: { text: 'After' } }]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ text: 'After' });
    workspace.dispose();
  });

  it('copies submitted command payloads before retaining them for saving', () => {
    const workspace = createWorkspace({ board: boardWith([{ op: 'create', newId: noteId }]) });
    const command = CommandSchema.parse({ op: 'update', id: noteId, set: { text: 'Saved intent' } });
    workspace.submit([command]);
    if (command.op !== 'update') throw new Error('Expected update fixture');
    command.set.text = 'Caller mutation';
    expect(workspace.replication.state.getSnapshot().pending[0]?.commands[0]).toMatchObject({ set: { text: 'Saved intent' } });
    workspace.dispose();
  });

  it('refuses to switch boards while unsaved edits remain', () => {
    const workspace = createWorkspace({ board: boardWith() });
    workspace.submit([{ op: 'create', newId: noteId }]);
    expect(workspace.replaceBoard(BoardSchema.parse({ ...boardWith(), id: otherBoardId }))).toBe(false);
    expect(workspace.scene.snapshot().id).toBe(boardId);
    workspace.dispose();
  });

  it('drops stale epoch snapshots and receipts after a permitted board switch', () => {
    const workspace = createWorkspace({ board: boardWith() });
    const oldEpoch = workspace.replication.state.getSnapshot().epoch;
    const next = BoardSchema.parse({ ...boardWith(), id: otherBoardId, name: 'Next' });
    expect(workspace.replaceBoard(next)).toBe(true);
    workspace.replication.reconcile(oldEpoch, BoardSchema.parse({ ...boardWith(), name: 'Late response', rev: 10 }));
    expect(workspace.scene.snapshot().id).toBe(otherBoardId);
    expect(workspace.metadata.getSnapshot().name).toBe('Next');
    expect(workspace.history.getSnapshot()).toEqual({ undo: false, redo: false });
    workspace.dispose();
  });

  it('preserves optimistic content when a confirmed snapshot rebases later edits', () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'First' }]);
    const workspace = createWorkspace({ board: initial });
    workspace.submit([{ op: 'update', id: noteId, set: { text: 'Unsaved' } }]);
    const snapshot = BoardSchema.parse({ ...initial, rev: RevisionSchema.parse(initial.rev + 1), cards: [...initial.cards, {
      id: CardIdSchema.parse('remoteaa'), type: 'title', text: 'Remote', color: 'plain', x: 50, y: 0, w: 100, h: 50,
    }] });
    workspace.replication.reconcile(0, snapshot);
    expect(workspace.card(noteId).getSnapshot()).toMatchObject({ text: 'Unsaved' });
    expect(workspace.scene.snapshot().cards).toHaveLength(2);
    expect(workspace.saving.getSnapshot().kind).toBe('saving');
    workspace.dispose();
  });

  it('keeps conflicting intents visible as blocked errors after reconciliation', () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'First' }]);
    const workspace = createWorkspace({ board: initial });
    workspace.submit([{ op: 'update', id: noteId, set: { text: 'Unsaved' } }]);
    workspace.replication.reconcile(0, BoardSchema.parse({ ...initial, cards: [], rev: initial.rev + 1 }));
    expect(workspace.replication.state.getSnapshot().pending).toHaveLength(1);
    expect(workspace.saving.getSnapshot()).toMatchObject({ kind: 'blocked', reason: `no card ${noteId}` });
    workspace.retry();
    expect(workspace.saving.getSnapshot().kind).toBe('blocked');
    workspace.dispose();
  });
  it('allocates create IDs before queueing and keeps them through optimistic replay', () => {
    const initial = boardWith();
    const workspace = createWorkspace({ board: initial, id: () => 'generatedaaa' });
    const local = workspace.submit([{ op: 'create', text: 'Allocated', ref: 'new' }]);
    if (local.kind !== 'applied') throw new Error('Expected create success');
    expect(local.created.new).toBe('generatedaaa');
    expect(workspace.replication.state.getSnapshot().pending[0]?.commands[0]).toMatchObject({ newId: 'generatedaaa' });
    workspace.replication.reconcile(0, initial);
    expect(workspace.scene.snapshot().cards[0]?.id).toBe('generatedaaa');
    workspace.dispose();
  });

  it('releases old board body sources when another board reuses the same card ID', () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Old board' }]);
    const workspace = createWorkspace({ board: initial });
    const old = workspace.card(noteId);
    const next = BoardSchema.parse({ ...initial, id: otherBoardId, cards: initial.cards.map(card => ({ ...card, text: 'New board' })) });
    expect(workspace.replaceBoard(next)).toBe(true);
    expect(old.getSnapshot()).toBe(null);
    expect(workspace.card(noteId)).not.toBe(old);
    expect(workspace.card(noteId).getSnapshot()).toMatchObject({ text: 'New board' });
    workspace.dispose();
  });

});
