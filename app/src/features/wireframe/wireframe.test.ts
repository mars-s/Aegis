// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { describe as group, expect, it } from 'vitest';
import { CardSchema, PropsSchema, BoardIdSchema } from '@aegis/domain/schema';
import type { Board, Card, Command } from '@aegis/domain/schema';
import { applyBatch as reduceBatch, emptyBoard, describe } from '@aegis/domain/commands';
import { decodeStoredBoard } from '@aegis/protocol/storage';
import { DEVICES, PIECES, alignmentCommands, dropCommands, expandDrag, pieceCommands, screenCommand, sectionCommands, selectForDrag, snapDrag, wireCard } from './commands.js';

// Ported from checks/host/wireframe.test.ts: every case, run against the TypeScript wireframe model the app ships.
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Expected fixture value');
  return value;
}
const expectEqual = (actual: unknown, expected: unknown, message?: string) => { expect(actual, message).toBe(expected); };
const expectDeep = (actual: unknown, expected: unknown, message?: string) => { expect(actual, message).toEqual(expected); };
const expectOk = (value: unknown, message?: string) => { expect(value, message).toBeTruthy(); };
const apply = (board: Board, commands: readonly unknown[]) => { const result = reduceBatch(board, { commands }); expect(result.ok, JSON.stringify(result.errors)).toBe(true); return decodeStoredBoard(result.board); };
const fresh = () => emptyBoard(BoardIdSchema.parse('wireframe'), 'Wireframe test');
const cards = (list: readonly Card[]) => ({ cards: [...list] });

group('wireframe model', () => {
  const card = (id: string, x: number, y: number, w = 100, h = 100, type = 'box', extra = {}) => CardSchema.parse({ id, type, x, y, w, h, text: '', color: 'plain', ...extra });

  it('all six wireframe types survive board commands and describe', () => {
    const commands = (['frame', 'box', 'text', 'icon', 'font', 'section'] as const).map((type, x) => wireCard({ type, text: type, fill: '#ffffff', font: 'Georgia', radius: 12 }, x * 400, 0));
    const board = apply(fresh(), commands);
    expectDeep(describe(board).cards.map(c => c.type), commands.map(c => c.type));
    expectEqual(required(required(board.cards[4]).props).font, 'Georgia');
    expectEqual(required(required(board.cards[1]).props).radius, 12);
  });
  for (const [device, [w, h, radius]] of Object.entries(DEVICES)) it(`${device} screen has the source dimensions and radius`, () => {
    const board = apply(fresh(), [screenCommand(device, { x: 100, y: 200 })]);
    expectDeep([required(board.cards[0]).w, required(board.cards[0]).h, required(required(board.cards[0]).props).radius], [w, h, radius]);
    expectEqual(required(required(board.cards[0]).props).device, device);
  });
  for (const [name, piece] of Object.entries(PIECES)) it(`${name} stamps editable cards with grouping and frame ownership`, () => {
    let board = fresh();
    const frame = screenCommand(piece.web ? 'Desktop' : 'iPhone', { x: 0, y: 0 }); board = apply(board, [frame]);
    const commands = pieceCommands(name, { x: 24, y: 100 }, board.cards);
    board = apply(board, commands);
    const parts = board.cards.filter(c => c.id !== frame.newId);
    expectOk(parts.length > 0);
    expectOk(parts.every(c => ['box', 'text', 'icon'].includes(c.type)));
    expectOk(parts.every(c => c.parent === frame.newId));
    expectEqual(new Set(parts.map(c => c.group)).size, 1);
    expectOk(parts.every(c => Number.isFinite(c.x + c.y + c.w + c.h)));
    const text = parts.find(c => c.type === 'text');
    if (text) { board = apply(board, [{ op: 'update', id: text.id, set: { text: 'Editable' } }]); expectEqual(required(board.cards.find(c => c.id === text.id)).text, 'Editable'); }
  });
  it('website template creates its own screen on the loose board', () => {
    const board = apply(fresh(), pieceCommands('Hero', { x: 700, y: 900 }, []));
    const frame = required(board.cards[0]); expectEqual(frame.type, 'frame'); expectEqual(frame.w, 1200);
    expectOk(board.cards.slice(1).every(c => c.parent === frame.id));
    expectOk(board.cards.some(c => c.props?.img === 'Hero image'));
  });
  it('website columns scale to narrow devices without negative widths', () => {
    const frame = card('screen01', 0, 0, 393, 852, 'frame');
    for (const [name, _p] of Object.entries(PIECES).filter(([, p]) => p.web)) {
      const commands = pieceCommands(name, { x: 0, y: 50 }, [frame]);
      expectOk(commands.filter((c): c is Extract<Command, { op: 'create' }> => c.op === 'create').every(c => required(c.w) > 0 && required(c.h) > 0), name);
    }
  });
  it('frame drag includes owned children even outside its bounds and does not double move', () => {
    const f = card('screen01', 0, 0, 393, 852, 'frame'), c = card('child001', 900, 900, 100, 30, 'text', { parent: f.id }), outside = card('outside1', 500, 0);
    const board = cards([f, c, outside]);
    expectDeep(expandDrag([f, c], board).map(c => c.id), [f.id, c.id]);
    expectDeep(expandDrag([c], board).map(c => c.id), [c.id]);
  });
  it('section membership follows centres, carries nested screens, ignores hidden and larger sections', () => {
    const section = card('section1', 0, 0, 600, 600, 'section'), f = card('screen01', 20, 40, 100, 100, 'frame');
    const child = card('child001', 900, 900, 100, 100, 'note', { parent: f.id });
    const edge = card('edge0001', 550, 200, 80, 80), out = card('outside1', 610, 0), hidden = card('hidden01', 100, 100, 100, 100, 'box', { props: { hidden: true } });
    const larger = card('larger01', -10, -10, 800, 800, 'section');
    const board = cards([section, f, child, edge, out, hidden, larger]);
    expectDeep(expandDrag([section], board).map(c => c.id), [section.id, f.id, child.id, edge.id]);
    const moved = CardSchema.parse({ ...edge, x: 601 });
    expectOk(!expandDrag([section], cards([section, f, child, moved, out, hidden, larger])).map(c => c.id).includes(moved.id));
  });
  it('piece drag expands its group and modifier permits an independent edit', () => {
    const a = card('aaaaaaa1', 0, 0, 100, 100, 'box', { group: 'piece' }), b = card('bbbbbbb1', 0, 0, 100, 100, 'text', { group: 'piece' });
    expectEqual(expandDrag([a], cards([a, b])).length, 2);
    expectDeep(expandDrag([a], cards([a, b]), { metaKey: true }), [a]);
  });
  it('drop assigns and clears card.parent, and lifts a card above its screen', () => {
    const c = card('child001', 10, 10), f = card('screen01', 0, 0, 393, 852, 'frame');
    apply(fresh(), [wireCard({ type: 'box' }), screenCommand('iPhone', { x: 0, y: 0 })]);
    const commands = dropCommands([c], cards([c, f]));
    expectEqual(PropsSchema.parse(PropsSchema.parse(required(commands[0])).set).parent, f.id); expectEqual(required(commands[1]).op, 'order');
    const owned = CardSchema.parse({ ...c, parent: f.id, x: 600 });
    expectDeep(PropsSchema.parse(required(dropCommands([owned], cards([f, owned]))[0])).set, { parent: '' });
    expectEqual(PropsSchema.parse(PropsSchema.parse(PropsSchema.parse(required(dropCommands([f], cards([f]), 'resize')[0])).set).props).device, 'Custom');
  });
  it('snapping aligns edges and centres in screen pixels, excludes moving and hidden cards', () => {
    const moving = card('moving01', 0, 0), target = card('target01', 200, 210);
    const start = [{ c: moving, x: 0, y: 0 }];
    const result = snapDrag(start, 97, 107, cards([moving, target]), { z: 1 });
    expectDeep([result.dx, result.dy], [100, 110]); expectEqual(result.guides.length, 2);
    const far = snapDrag(start, 93, 103, cards([moving, target]), { z: 1 }); expectDeep([far.dx, far.dy], [93, 103]);
    const zoomed = snapDrag(start, 97, 107, cards([moving, target]), { z: 4 }); expectEqual(zoomed.guides.length, 0);
    const hiddenTarget = CardSchema.parse({ ...target, props: { hidden: true } });
    expectEqual(snapDrag(start, 97, 107, cards([moving, hiddenTarget]), { z: 1 }).guides.length, 0);
  });
  it('grid snapping preserves multi-card spacing and alt bypasses snapping', () => {
    const a = card('aaaaaaa1', 10, 20), b = card('bbbbbbb1', 110, 20), start = [a, b].map(c => ({ c, x: c.x, y: c.y }));
    expectDeep(snapDrag(start, 10, 10, cards([a, b]), { z: 1 }, { grid: true }), { dx: 16, dy: 6, guides: [] });
    expectDeep(snapDrag(start, 10, 10, cards([a, b]), { z: 1 }, { grid: true, disabled: true }), { dx: 10, dy: 10, guides: [] });
  });
  it('removing a section leaves its contained cards in place', () => {
    let board = apply(fresh(), [wireCard({ type: 'box' }, 200, 200)]); const original = structuredClone(required(board.cards[0]));
    board = apply(board, sectionCommands(board.cards));
    const section = required(board.cards.find(c => c.type === 'section')); expectEqual(required(board.cards[0]).id, section.id);
    board = apply(board, [{ op: 'delete', id: section.id }]); expectDeep(board.cards, [original]);
  });
  it('alignment uses a single card frame and distribution measures equal gaps', () => {
    const f = card('screen01', 0, 0, 400, 800, 'frame'), a = card('aaaaaaa1', 10, 30, 80, 40, 'box', { parent: f.id });
    expectEqual(required(alignmentCommands([a], [f, a], 'centre')[0]).x, 160);
    const b = card('bbbbbbb1', 150, 50, 60, 40), c = card('ccccccc1', 400, 80, 100, 40);
    const result = alignmentCommands([a, b, c], [a, b, c], 'across');
    const x = (index: number) => { const command = required(result[index]); if (command.op !== 'move') throw new Error('Expected a move'); return command.x; };
    expectEqual(x(1) - (x(0) + a.w), x(2) - (x(1) + b.w));
  });
  it('borders, image labels, typography and rotation persist and merge', () => {
    let board = apply(fresh(), [wireCard({ type: 'box', img: 'Portrait', fill: 'none', stroke: '#ff0000', sw: 2, sdash: 'dash', dl: 9, dg: 6 })]);
    const id = required(board.cards[0]).id;
    board = apply(board, [{ op: 'update', id, set: { rot: 15, props: { radius: 30, sdash: 'dot' } } }]);
    expectEqual(required(required(board.cards[0]).props).img, 'Portrait'); expectEqual(required(required(board.cards[0]).props).dg, 6); expectEqual(required(required(board.cards[0]).props).sdash, 'dot'); expectEqual(required(board.cards[0]).rot, 15);
  });
  it('source thin dividers retain their visual dimensions within the board hit area', () => {
    const board = apply(fresh(), [wireCard({ type: 'box', w: 200, h: 1 })]);
    expectEqual(required(board.cards[0]).h, 24); expectEqual(required(required(board.cards[0]).props).visualH, 1);
  });

  it('group selection reaches a single part with Command or Control even when already selected', () => {
    const a = card('aaaaaaa1', 0, 0, 100, 100, 'box', { group: 'piece' }), b = card('bbbbbbb1', 0, 0, 100, 100, 'text', { group: 'piece' });
    const board = cards([a, b]);
    expectDeep(selectForDrag([a.id], a.id, board), [a.id, b.id]);
    expectDeep(selectForDrag([], a.id, board, { metaKey: true }), [a.id]);
    expectDeep(selectForDrag([a.id, b.id], a.id, board, { ctrlKey: true }), [a.id]);
    expectDeep(selectForDrag([a.id], a.id, board, { shiftKey: true }), [a.id]);
  });
  it('section centres determine membership without pulling in outside group parts', () => {
    const section = card('section1', 0, 0, 200, 200, 'section');
    const inside = card('inside01', 10, 10, 100, 100, 'box', { group: 'piece' });
    const outside = card('outside1', 300, 300, 100, 100, 'text', { group: 'piece' });
    const orphan = card('orphan01', 20, 20, 100, 100, 'note', { parent: 'deletedframe' });
    const board = cards([section, inside, outside, orphan]);
    expectDeep(expandDrag([section], board).map(c => c.id), [section.id, inside.id, orphan.id]);
  });
});
