import { describe, expect, it } from 'vitest';
import { applyBatch as reduceBatch, emptyBoard } from '@aegis/domain/commands';
import { BoardIdSchema, BoardSchema, CardSchema } from '@aegis/domain/schema';
import type { Board, Card, Command } from '@aegis/domain/schema';
import { decodeStoredBoard } from '@aegis/protocol/storage';
import { expandTemplateDrag, frameworks, starters, templateCommands, templateDropCommands } from './templates.js';

// Ported from checks/host/library.test.ts: the template cases, run against the TypeScript templates the app ships.
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Expected fixture value');
  return value;
}
const board = (cards: unknown[] = []): Board => BoardSchema.parse({ ...emptyBoard(BoardIdSchema.parse('testboard')), cards: cards.map(card) });
const card = (value: unknown): Card => CardSchema.parse({ text: '', color: 'plain', ...(typeof value === 'object' && value !== null ? value : {}) });
const apply = (target: Board, commands: readonly Command[]) => { const result = reduceBatch(target, { commands }); return { ...result, board: decodeStoredBoard(result.board) }; };

describe('board templates', () => {
  it('all frameworks and starters produce valid, editable board commands with distinct card ids', () => {
    for (const key of [...Object.keys(frameworks), ...Object.keys(starters)]) {
      const target = board(), result = apply(target, templateCommands(key, target));
      expect(result.ok, `${key}: ${JSON.stringify(result.errors)}`).toBe(true);
      expect(result.board.cards.length >= 2).toBe(true);
      expect(new Set(result.board.cards.map(c => c.id)).size).toBe(result.board.cards.length);
      expect(JSON.stringify(result.board).includes('Mochi')).toBe(false);
      if (key === 'Moodboard') expect(result.board.cards.filter(c => c.type === 'swatch').length).toBe(3);
      if (key === 'opportunity') expect(result.board.links.every(l => l.arrow === 'end')).toBe(true);
    }
  });

  it('frameworks are placed beside existing content, rather than covering it', () => {
    const commands = templateCommands('affinity', board([{ type: 'note', id: 'existing', x: 500, y: -100, w: 300, h: 200 }]));
    expect(commands.filter(c => c.op === 'create').every(c => c.op === 'create' && (c.x ?? 0) >= 1000)).toBe(true);
  });

  it('template groups carry their notes, and notes can be moved between groups or out', () => {
    const a = card({ id: 'groupaaa', type: 'template-group', x: 0, y: 0, w: 288, h: 200 });
    const b = card({ id: 'groupbbb', type: 'template-group', x: 330, y: 0, w: 288, h: 200 });
    const n = card({ id: 'notecard', type: 'note', parent: a.id, x: 350, y: 50, w: 200, h: 100 });
    const cards = { cards: [a, b, n] };
    const parent = (command: Command | undefined) => { const update = required(command); if (update.op !== 'update') throw new Error('Expected an update'); return update.set.parent; };
    expect(expandTemplateDrag([a], cards).map(c => c.id)).toEqual([a.id, n.id]);
    expect(parent(templateDropCommands([n], cards, 'move')[0])).toBe(b.id);
    expect(templateDropCommands([a, n], cards, 'move')).toEqual([]);
    const away = card({ ...n, x: 900 });
    expect(parent(templateDropCommands([away], { cards: [a, b, away] }, 'move')[0])).toBe('');
  });

  it('Brain dump starts with two board cards and five separate Unsorted notes', () => {
    for (const key of Object.keys(starters)) {
      const result = apply(board(), templateCommands(key, board()));
      expect(result.ok).toBe(true);
      if (key === 'Brain dump') {
        expect(result.board.cards.length).toBe(2);
        const tray = required(result.board.tray).map(card);
        expect(tray.length).toBe(5);
        expect(tray.every(c => c.type === 'note' && c.text && c.id && !c.parent)).toBe(true);
        expect(new Set([...result.board.cards, ...tray].map(c => c.id)).size).toBe(7);
      } else expect(result.board.tray ?? []).toEqual([]);
    }
  });

  it('framework groups are ordinary collections with laid-out members in reading order', () => {
    for (const [key, framework] of Object.entries(frameworks)) {
      const result = apply(board(), templateCommands(key, board()));
      expect(result.ok).toBe(true);
      expect(result.board.cards.some(c => c.type === 'template-group')).toBe(false);
      const collections = result.board.cards.filter(c => c.type === 'coll');
      expect(collections.length).toBe(framework.items.filter(it => it.t === 'group').length);
      for (const coll of collections) {
        expect(required(coll.props).cols).toBe(1);
        const notes = required(required(coll.props).kids).map(id => required(result.board.cards.find(c => c.id === id)));
        expect(notes.length > 0).toBe(true);
        notes.forEach((note, i) => {
          expect(note.parent).toBe(coll.id);
          expect(note.x >= coll.x && note.x + note.w <= coll.x + coll.w).toBe(true);
          expect(note.y > coll.y && note.y + note.h <= coll.y + coll.h).toBe(true);
          if (i) expect(note.y > required(notes[i - 1]).y + required(notes[i - 1]).h).toBe(true);
        });
      }
    }
  });
});
