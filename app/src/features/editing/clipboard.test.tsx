import { afterEach, expect, test, vi } from 'vitest';
import { LinkIdSchema } from '@aegis/domain';
import type { FeatureContext } from '../../composition.js';
import { createWorkspace } from '../../workspace/store.js';
import { cutSelection, readClip } from './clipboard.js';
import { boardWith, noteId, otherId } from '../../../../checks/unit/workspace/helpers.js';

afterEach(() => vi.unstubAllGlobals());
function setup(blocked = false) {
  const board = boardWith([{ op: 'create', newId: noteId, text: 'First' }, { op: 'create', newId: otherId, text: 'Second' }, { op: 'connect', newId: LinkIdSchema.parse('cutlink1'), a: noteId, b: otherId }]);
  const workspace = createWorkspace({ board });
  workspace.act({ kind: 'select', ids: [noteId, otherId] });
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => { if (blocked) throw new Error('Storage unavailable'); stored.set(key, value); }, getItem: (key: string) => stored.get(key) ?? null });
  vi.stubGlobal('navigator', { clipboard: { writeText: async () => { throw new Error('System clipboard unavailable'); } } });
  const context: FeatureContext = { workspace, engine: () => null, openEditor: () => false, closeEditor: () => true };
  return { board, workspace, context };
}
test('Cut retains a complete local clip when the system clipboard is unavailable and normal Undo restores the linked selection', () => {
  const { board, workspace, context } = setup();
  expect(cutSelection(context)).toBe(true);
  expect(workspace.scene.snapshot().cards).toEqual([]);
  expect(workspace.scene.snapshot().links).toEqual([]);
  expect(readClip()?.cards).toEqual(board.cards);
  expect(readClip()?.links).toEqual(board.links);
  expect(workspace.replication.state.getSnapshot().pending).toHaveLength(1);
  workspace.undo();
  expect(workspace.scene.snapshot().cards).toEqual(board.cards);
  expect(workspace.scene.snapshot().links).toEqual(board.links);
  workspace.dispose();
});
test('Cut leaves the board and history alone if the full clip cannot be retained or an editor refuses to close', () => {
  const { board, workspace, context } = setup(true);
  expect(cutSelection(context)).toBe(false);
  expect(workspace.scene.snapshot()).toBe(board);
  expect(workspace.history.getSnapshot().undo).toBe(false);
  expect(cutSelection({ ...context, closeEditor: () => false })).toBe(false);
  expect(workspace.scene.snapshot()).toBe(board);
  workspace.dispose();
});
