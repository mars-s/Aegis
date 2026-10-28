import { afterEach, describe, expect, it } from 'vitest';
import { applyBatch, BoardIdSchema, CardIdSchema, emptyBoard } from '@aegis/domain';
import type { Workspace } from '../../workspace/index.js';
import { createWorkspace } from '../../workspace/index.js';
import { sheetSession } from './session.js';

const id = CardIdSchema.parse('sheet001');
function board(name = 'boardaa') {
  const result = applyBatch(emptyBoard(BoardIdSchema.parse(name), 'Sheet checks'), { commands: [{ op: 'create', newId: id, type: 'object', kind: 'sheet', data: { columns: [{ label: 'Name', kind: 'text' }, { label: 'Hours', kind: 'number' }], rows: [{ cells: ['Mon', '3'] }, { cells: ['Fri', '9'] }] } }] });
  if (!result.ok) throw new Error('Invalid sheet fixture');
  return result.board;
}
const workspaces: Workspace[] = [];
function setup() {
  const workspace = createWorkspace({ board: board() });
  workspaces.push(workspace);
  return { workspace, session: sheetSession(workspace, id) };
}
afterEach(() => { for (const workspace of workspaces.splice(0)) workspace.dispose(); });
const data = (workspace: Workspace) => {
  const card = workspace.card(id).getSnapshot();
  if (card?.kind !== 'sheet') throw new Error('Expected sheet');
  return card.data;
};

describe('sheet drafts', () => {
  it('commits one cell and preserves concurrent edits elsewhere with one Undo transaction', () => {
    const { workspace, session } = setup();
    session.select({ r: 1, c: 1 }); session.begin(); session.change('5');
    workspace.submit([{ op: 'object_set', id, path: ['rows', 1, 'cells', 1], value: '14' }]);
    expect(session.flush()).toBe(true);
    expect(data(workspace).rows.map(row => row.cells[1])).toEqual(['5', '14']);
    workspace.undo();
    expect(data(workspace).rows.map(row => row.cells[1])).toEqual(['3', '14']);
  });
  it('retains conflicting text, refuses close and allows Escape to retain the other edit', () => {
    const { workspace, session } = setup();
    session.select({ r: 1, c: 1 }); session.begin(); session.change('5');
    workspace.submit([{ op: 'object_set', id, path: ['rows', 0, 'cells', 1], value: '7' }]);
    expect(session.flush()).toBe(false);
    expect(session.getSnapshot().edit).toMatchObject({ kind: 'editing', text: '5' });
    expect(data(workspace).rows[0]?.cells[1]).toBe('7');
    session.cancel(); expect(session.flush()).toBe(true);
    expect(data(workspace).rows[0]?.cells[1]).toBe('7');
  });
  it('does not queue a save or Undo for unchanged input', () => {
    const { workspace, session } = setup();
    session.begin(); expect(session.flush()).toBe(true);
    expect(workspace.history.getSnapshot().undo).toBe(false);
  });
  it('retains a composing value until the input method commits it', () => {
    const { workspace, session } = setup();
    session.begin(); session.change('日本語'); session.compose(true);
    expect(session.flush()).toBe(false);
    expect(data(workspace).rows[0]?.cells[0]).toBe('Mon');
    session.compose(false); expect(session.flush()).toBe(true);
    expect(data(workspace).rows[0]?.cells[0]).toBe('日本語');
  });
  it('keeps a draft in its originating board when another board reuses the card ID', () => {
    const { workspace, session } = setup();
    session.begin(); session.change('Unfinished');
    expect(workspace.replaceBoard(board('boardbb'))).toBe(true);
    const other = sheetSession(workspace, id);
    expect(other.getSnapshot().edit.kind).toBe('idle');
    expect(session.flush()).toBe(false);
    expect(data(workspace).rows[0]?.cells[0]).toBe('Mon');
    expect(workspace.replaceBoard(board())).toBe(true);
    expect(sheetSession(workspace, id).getSnapshot().edit).toMatchObject({ kind: 'editing', text: 'Unfinished' });
  });
  it('clamps the edit target after a selected row or column is removed', () => {
    const { workspace, session } = setup();
    session.select({ r: 2, c: 1 });
    workspace.submit([{ op: 'revise', id, data: { columns: [{ label: 'Name', kind: 'text' }], rows: [{ cells: ['Mon'] }] } }]);
    session.begin(); session.change('Changed');
    expect(session.flush()).toBe(true);
    expect(data(workspace).rows).toEqual([{ cells: ['Changed'] }]);
  });
});
