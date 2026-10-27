import { describe, expect, it } from 'vitest';
import { BoardSchema } from '@aegis/domain';
import { capturedItems, releaseCaptured } from '../../../app/src/platform/tray.js';
import { createWorkspace } from '../../../app/src/workspace/index.js';

describe('saved capture tray compatibility', () => {
  it('renders and releases older ideas that omit canvas presentation fields', () => {
    const board = BoardSchema.parse({ id: 'tray-board', name: 'Ideas', rev: 0, cards: [], links: [], view: { x: 0, y: 0, z: 1 }, tray: [{ id: 'old-idea', type: 'note', text: 'Keep this thought' }] });
    const item = capturedItems(board)[0];
    expect(item).toMatchObject({ id: 'old-idea', text: 'Keep this thought', x: 0, y: 0, w: 268, h: 140, color: 'plain' });
    expect(board.tray).toEqual([{ id: 'old-idea', type: 'note', text: 'Keep this thought' }]);
    if (!item) throw new Error('The saved idea was not decoded.');
    const workspace = createWorkspace({ board });
    try {
      expect(releaseCaptured(workspace, item.id, { x: 500, y: 300 })).toBe(true);
      expect(workspace.scene.snapshot().cards).toHaveLength(1);
      expect(workspace.scene.snapshot().cards[0]?.text).toBe('Keep this thought');
      expect(workspace.scene.snapshot().tray).toEqual([]);
    } finally { workspace.dispose(); }
  });
});
