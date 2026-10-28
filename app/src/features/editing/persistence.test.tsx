import { afterEach, describe, expect, it } from 'vitest';
import { BoardIdSchema, CardIdSchema, CommandSchema, RevisionSchema, emptyBoard } from '@aegis/domain';
import type { Workspace } from '../../workspace/index.js';
import { createWorkspace } from '../../workspace/index.js';

const note = CardIdSchema.parse('noteaaaa');
const workspaces: Workspace[] = [];
function setup() {
  const workspace = createWorkspace({ board: emptyBoard(BoardIdSchema.parse('boardaaa'), 'Save regression checks') });
  workspaces.push(workspace);
  return workspace;
}
function firstPending(workspace: Workspace) {
  const state = workspace.replication.state.getSnapshot(), batch = state.pending[0];
  if (!batch) throw new Error('Expected a pending save');
  return { ...state, batch };
}
function acknowledge(workspace: Workspace) {
  const { epoch, batch, confirmedRevision } = firstPending(workspace);
  workspace.replication.acknowledge(epoch, batch.id, { ok: true, rev: RevisionSchema.parse(confirmedRevision + 1), created: {} });
}
afterEach(() => { for (const workspace of workspaces.splice(0)) workspace.dispose(); });

// These replace the old settings/save queue regressions using the real React workspace.
describe('workspace saving regressions', () => {
  it('retains failed saves and later edits in order until Retry', () => {
    const workspace = setup();
    workspace.submit([{ op: 'create', newId: note, text: 'Original' }]);
    const first = firstPending(workspace);
    workspace.replication.failed(first.epoch, first.batch.id, { kind: 'offline', message: 'offline' });
    workspace.submit([{ op: 'update', id: note, set: { text: 'Later edit' } }]);
    expect(workspace.saving.getSnapshot()).toMatchObject({ kind: 'blocked', pending: 2 });
    expect(workspace.replication.state.getSnapshot().pending.map(batch => batch.commands[0]?.op)).toEqual(['create', 'update']);
    workspace.retry(); acknowledge(workspace);
    expect(workspace.saving.getSnapshot()).toMatchObject({ kind: 'saving', pending: 1 });
    acknowledge(workspace);
    expect(workspace.saving.getSnapshot().kind).toBe('saved');
    expect(workspace.card(note).getSnapshot()?.text).toBe('Later edit');
  });

  it('keeps edits arriving during a pending request unsaved until their own acknowledgement', () => {
    const workspace = setup();
    workspace.submit([{ op: 'create', newId: note, text: 'First request' }]);
    workspace.submit([{ op: 'update', id: note, set: { text: 'During request' } }]);
    acknowledge(workspace);
    expect(workspace.saving.getSnapshot()).toMatchObject({ kind: 'saving', pending: 1 });
    expect(workspace.card(note).getSnapshot()?.text).toBe('During request');
    acknowledge(workspace);
    expect(workspace.saving.getSnapshot().kind).toBe('saved');
  });

  it('refuses non-finite geometry and normalises non-positive dimensions before saving', () => {
    const workspace = setup(), before = workspace.scene.snapshot();
    for (const geometry of [{ x: NaN }, { y: Infinity }, { rot: Infinity }]) {
      expect(CommandSchema.safeParse({ op: 'create', newId: note, ...geometry }).success).toBe(false);
    }
    expect(workspace.scene.snapshot()).toBe(before);
    expect(workspace.replication.state.getSnapshot().pending).toHaveLength(0);
    expect(workspace.saving.getSnapshot().kind).toBe('saved');
    expect(workspace.submit([{ op: 'create', newId: note, w: 0, h: -20 }]).kind).toBe('applied');
    const card = workspace.record(note).getSnapshot();
    expect(card?.w).toBeGreaterThan(0); expect(card?.h).toBeGreaterThan(0);
    expect(JSON.stringify(workspace.replication.state.getSnapshot().pending)).not.toContain('null');
  });

  it('retains an edit that arrives while a confirmed snapshot is being reloaded', () => {
    const workspace = setup();
    workspace.submit([{ op: 'create', newId: note, text: 'Saved' }]); acknowledge(workspace);
    const reloading = workspace.scene.snapshot(), epoch = workspace.replication.state.getSnapshot().epoch;
    workspace.submit([{ op: 'update', id: note, set: { text: 'During reload' } }]);
    workspace.replication.reconcile(epoch, reloading);
    expect(workspace.saving.getSnapshot()).toMatchObject({ kind: 'saving', pending: 1 });
    expect(workspace.card(note).getSnapshot()?.text).toBe('During reload');
    acknowledge(workspace);
    expect(workspace.saving.getSnapshot().kind).toBe('saved');
    expect(workspace.card(note).getSnapshot()?.text).toBe('During reload');
  });
});
