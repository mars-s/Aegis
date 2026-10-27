import { expect, test } from 'vitest';
import { applyBatch, CardIdSchema, emptyBoard } from '@aegis/domain';
import { createWorkspace } from '../workspace/index.js';
import type { FeatureContext } from '../composition.js';
import { deleteCards, undoDeletedCards } from './actions.js';

const first = CardIdSchema.parse('deleteaa'), second = CardIdSchema.parse('deletebb');
function fixture() {
  const initial = applyBatch(emptyBoard('delete-test'), { commands: [{ op: 'create', type: 'note', newId: first, text: 'Restore me' }, { op: 'create', type: 'note', newId: second, text: 'Keep me' }] });
  if (!initial.ok) throw new Error('Invalid deletion fixture');
  const workspace = createWorkspace({ board: initial.board });
  expect(workspace.record(first).getSnapshot()?.text).toBe('Restore me');
  const context: FeatureContext = { workspace, engine: () => null, openEditor: () => false, closeEditor: () => false };
  return { workspace, context };
}

test('deletion is immediate and keyboard Undo restores the original history and selection', async () => {
  const { workspace, context } = fixture();
  try {
    await deleteCards(context, [first], () => {});
    expect(workspace.record(first).getSnapshot()).toBeNull();
    expect(undoDeletedCards(context)).toBe(true);
    expect(workspace.selection.getSnapshot()).toEqual([first]);
    expect(workspace.record(first).getSnapshot()?.text).toBe('Restore me');
    expect(workspace.redo().kind).toBe('applied');
    expect(workspace.record(first).getSnapshot()).toBeNull();
  } finally { workspace.dispose(); }
});

test('scoped deletion Undo preserves a later edit while keyboard Undo still belongs to that edit', async () => {
  const { workspace, context } = fixture();
  try {
    await deleteCards(context, [first], () => {});
    workspace.submit([{ op: 'update', id: second, set: { text: 'Later work' } }]);
    expect(undoDeletedCards(context)).toBe(false);
    expect(undoDeletedCards(context, true)).toBe(true);
    expect(workspace.record(first).getSnapshot()?.text).toBe('Restore me');
    expect(workspace.record(second).getSnapshot()?.text).toBe('Later work');
    expect(workspace.selection.getSnapshot()).toEqual([first]);
  } finally { workspace.dispose(); }
});
