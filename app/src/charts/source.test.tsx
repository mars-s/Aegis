import { afterEach, describe, expect, it } from 'vitest';
import { applyBatch, BoardIdSchema, CardIdSchema, emptyBoard } from '@aegis/domain';
import type { Workspace } from '../workspace/index.js';
import { createWorkspace } from '../workspace/index.js';
import { chartCardsSource } from './source.js';
const sheetId = CardIdSchema.parse('sheet001'), noteId = CardIdSchema.parse('note0001');
const workspaces: Workspace[] = [];
function setup() {
  const result = applyBatch(emptyBoard(BoardIdSchema.parse('boardaa'), 'Chart subscription checks'), { commands: [
    { op: 'create', newId: sheetId, type: 'object', kind: 'sheet', data: { columns: [{ label: 'Day', kind: 'text' }, { label: 'Hours', kind: 'number' }], rows: [{ cells: ['Mon', '3'] }] } },
    { op: 'create', newId: noteId, type: 'note', text: 'Unrelated note' },
  ] });
  if (!result.ok) throw new Error('Invalid source fixture');
  const workspace = createWorkspace({ board: result.board });
  workspaces.push(workspace);
  return workspace;
}
afterEach(() => { for (const workspace of workspaces.splice(0)) workspace.dispose(); });
describe('chart evidence subscriptions', () => {
  it('shares a stable payload source and publishes no geometry changes', () => {
    const workspace = setup(), source = chartCardsSource(workspace), initial = source.getSnapshot();
    expect(chartCardsSource(workspace)).toBe(source);
    let notifications = 0;
    const unsubscribe = source.subscribe(() => { notifications++; });
    workspace.submit([{ op: 'move', id: sheetId, x: 300, y: 200 }]);
    expect(notifications).toBe(0);
    expect(source.getSnapshot()).toBe(initial);
    workspace.submit([{ op: 'update', id: noteId, set: { text: 'Still unrelated' } }]);
    expect(notifications).toBe(0);
    workspace.submit([{ op: 'object_set', id: sheetId, path: ['rows', 0, 'cells', 1], value: '9' }]);
    expect(notifications).toBe(1);
    const card = source.getSnapshot()[0];
    expect(card?.kind === 'sheet' ? card.data.rows[0]?.cells[1] : null).toBe('9');
    unsubscribe();
  });
  it('removes deleted evidence and reconnects after the final subscriber unmounts', () => {
    const workspace = setup(), source = chartCardsSource(workspace);
    source.getSnapshot();
    const unsubscribe = source.subscribe(() => {});
    unsubscribe();
    workspace.submit([{ op: 'delete', id: sheetId }]);
    expect(source.getSnapshot()).toEqual([]);
    let notifications = 0;
    const stop = source.subscribe(() => { notifications++; });
    workspace.undo();
    expect(notifications).toBe(1);
    expect(source.getSnapshot().map(card => card.id)).toEqual([sheetId]);
    stop();
  });
});
