import { describe, expect, it } from 'vitest';
import { BoardSchema, CardSchema } from '@aegis/domain';
import { createWorkspace } from '../../workspace/index.js';
import { captureIdeas, putCaptured, undoCapture } from './capture.js';

function workspace() {
  return createWorkspace({ board: BoardSchema.parse({ id: 'capture-board', name: 'Ideas', rev: 0, cards: [], links: [], view: { x: 0, y: 0, z: 1 } }) });
}

describe('captured ideas', () => {
  it('saves mixed ideas in Unsorted and releases real cards with their original fields', () => {
    const store = workspace();
    try {
      const receipt = captureIdeas(store, 'A thought\nhttps://example.com/research\n- Read the paper\n- [x] Save the source\nA second thought');
      if (!receipt) throw new Error('Expected a capture receipt');
      expect(receipt.description).toBe('2 notes, 1 link card, 1 checklist');
      expect(store.scene.snapshot().cards).toHaveLength(0);
      expect(store.scene.snapshot().tray).toHaveLength(4);
      const placed = putCaptured(store, receipt, { x: 200, y: 300 });
      if (!placed || placed.location.kind !== 'board') throw new Error('Expected placed ideas');
      const cards = store.scene.snapshot().cards;
      expect(cards).toHaveLength(4);
      expect(cards.filter(card => card.type === 'note').map(card => card.text)).toEqual(['A thought', 'A second thought']);
      expect(cards.find(card => card.type === 'link')?.url).toBe('https://example.com/research');
      expect(cards.find(card => card.type === 'todo')?.items).toEqual([{ text: 'Read the paper', done: false }, { text: 'Save the source', done: true }]);
      expect(store.scene.snapshot().tray).toEqual([]);
      expect(store.selection.getSnapshot()).toEqual(placed.location.ids);
      expect(putCaptured(store, placed, { x: 0, y: 0 })).toBeNull();
    } finally { store.dispose(); }
  });

  it('Undo removes only its own tray ideas and preserves later work', () => {
    const store = workspace();
    try {
      const first = captureIdeas(store, 'Undo me'), later = captureIdeas(store, 'Keep me');
      if (!first || !later) throw new Error('Expected capture receipts');
      store.submit([{ op: 'create', type: 'note', text: 'Unrelated work' }]);
      undoCapture(store, first);
      expect(CardSchema.array().parse(store.scene.snapshot().tray).map(card => card.text)).toEqual(['Keep me']);
      expect(store.scene.snapshot().cards.map(card => card.text)).toEqual(['Unrelated work']);
    } finally { store.dispose(); }
  });

  it('Undo of a placed capture preserves a later canvas edit and tray entry', () => {
    const store = workspace();
    try {
      const first = captureIdeas(store, 'Put me on the board');
      if (!first) throw new Error('Expected a capture receipt');
      const placed = putCaptured(store, first, { x: 200, y: 300 });
      if (!placed) throw new Error('Expected placed ideas');
      captureIdeas(store, 'Keep the next capture');
      store.submit([{ op: 'create', type: 'note', text: 'Keep the next card' }]);
      undoCapture(store, placed);
      expect(store.scene.snapshot().cards.map(card => card.text)).toEqual(['Keep the next card']);
      expect(CardSchema.array().parse(store.scene.snapshot().tray).map(card => card.text)).toEqual(['Keep the next capture']);
    } finally { store.dispose(); }
  });

  it('ignores a stale receipt after switching boards and rejects empty captures', () => {
    const store = workspace();
    try {
      expect(captureIdeas(store, ' \n ')).toBeNull();
      const first = captureIdeas(store, 'Original board');
      if (!first) throw new Error('Expected a capture receipt');
      const other = createWorkspace({ board: BoardSchema.parse({ id: 'another-board', name: 'Other', rev: 0, cards: [], links: [], tray: [], view: { x: 0, y: 0, z: 1 } }) });
      try {
        expect(putCaptured(other, first, { x: 0, y: 0 })).toBeNull();
        undoCapture(other, first);
        expect(other.scene.snapshot().tray).toEqual([]);
        expect(other.scene.snapshot().cards).toEqual([]);
      } finally { other.dispose(); }
    } finally { store.dispose(); }
  });
});
