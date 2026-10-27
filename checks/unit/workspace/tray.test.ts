import { expect, test } from 'vitest';
import { BoardSchema } from '@aegis/domain';
import { createWorkspace } from '../../../app/src/workspace/index.js';
import { capturedItems, releaseCaptured } from '../../../app/src/platform/tray.js';

const first = { id: 'source01', type: 'note', color: 'plain', x: 10, y: 20, w: 240, h: 120, text: 'First captured note' };
const second = { ...first, id: 'source02', x: 280, text: 'Linked captured note' };
const link = { id: 'linked01', a: first.id, b: second.id, label: 'Evidence' };
const fixture = () => BoardSchema.parse({ id: 'tray-board', name: 'Tray', rev: 0, cards: [], links: [], view: { x: 0, y: 0, z: 1 }, tray: [{ ...first, id: 'capture1', bundle: { cards: [first, second], links: [link] } }, { ...first, id: 'capture2', text: 'Keep this capture' }] });

test('releasing captured bundles remaps real links and preserves other captures in one Undo', () => {
  const board = fixture(), workspace = createWorkspace({ board });
  try {
    const id = capturedItems(board)[0]?.id; if (!id) throw new Error('Missing captured fixture');
    expect(releaseCaptured(workspace, id, { x: 800, y: 500 })).toBe(true);
    const after = workspace.scene.snapshot();
    expect(after.cards.map(card => card.id)).not.toContain(first.id);
    expect(after.cards).toHaveLength(2); expect(after.links).toHaveLength(1);
    const ids = new Set(after.cards.map(card => card.id));
    const connection = after.links[0]; if (!connection) throw new Error('Missing cloned link');
    expect(ids.has(connection.a)).toBe(true); expect(ids.has(connection.b)).toBe(true);
    expect(capturedItems(after).map(item => item.text)).toEqual(['Keep this capture']);
    expect(workspace.selection.getSnapshot()).toHaveLength(2);
    workspace.undo(); expect(workspace.scene.snapshot().cards).toEqual([]); expect(workspace.scene.snapshot().tray).toEqual(board.tray);
  } finally { workspace.dispose(); }
});
