import { CardSchema, PropsSchema } from '@aegis/domain/schema';
import type { Board } from '@aegis/domain/schema';
import { required } from './required.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBatch } from './batch.ts';
import { emptyBoard, describe } from '@aegis/domain/commands';
import { DEVICES, PIECES, wireCard, screenCommand, pieceCommands, sectionCommands, selectForDrag, expandDrag, snapDrag, dropCommands, alignmentCommands } from './adapters/wireframe.ts';

const apply = (board: Board, commands: unknown[]) => { const result = applyBatch(board, { commands }); assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.board; };
const fresh = () => emptyBoard('wireframe', 'Wireframe test');
const card = (id: string, x: number, y: number, w = 100, h = 100, type = 'box', extra = {}) => CardSchema.parse({ id, type, x, y, w, h, text: '', color: 'plain', ...extra });

test('all six wireframe types survive board commands and describe', () => {
  const commands = ['frame', 'box', 'text', 'icon', 'font', 'section'].map((type, x) => wireCard({ type, text: type, fill: '#ffffff', font: 'Georgia', radius: 12 }, x * 400, 0));
  const board = apply(fresh(), commands);
  assert.deepEqual(describe(board).cards.map(c => c.type), commands.map(c => c.type));
  assert.equal(required(required(board.cards[4]).props).font, 'Georgia');
  assert.equal(required(required(board.cards[1]).props).radius, 12);
});
for (const [device, [w, h, radius]] of Object.entries(DEVICES)) test(`${device} screen has the source dimensions and radius`, () => {
  const board = apply(fresh(), [screenCommand(device, { x: 100, y: 200 })]);
  assert.deepEqual([required(board.cards[0]).w, required(board.cards[0]).h, required(required(board.cards[0]).props).radius], [w, h, radius]);
  assert.equal(required(required(board.cards[0]).props).device, device);
});
for (const [name, piece] of Object.entries(PIECES)) test(`${name} stamps editable cards with grouping and frame ownership`, () => {
  let board = fresh();
  const frame = screenCommand(piece.web ? 'Desktop' : 'iPhone', { x: 0, y: 0 }); board = apply(board, [frame]);
  const commands = pieceCommands(name, { x: 24, y: 100 }, board.cards);
  board = apply(board, commands);
  const parts = board.cards.filter(c => c.id !== frame.newId);
  assert.ok(parts.length > 0);
  assert.ok(parts.every(c => ['box', 'text', 'icon'].includes(c.type)));
  assert.ok(parts.every(c => c.parent === frame.newId));
  assert.equal(new Set(parts.map(c => c.group)).size, 1);
  assert.ok(parts.every(c => Number.isFinite(c.x + c.y + c.w + c.h)));
  const text = parts.find(c => c.type === 'text');
  if (text) { board = apply(board, [{ op: 'update', id: text.id, set: { text: 'Editable' } }]); assert.equal(required(board.cards.find(c => c.id === text.id)).text, 'Editable'); }
});
test('website template creates its own screen on the loose board', () => {
  const board = apply(fresh(), pieceCommands('Hero', { x: 700, y: 900 }, []));
  const frame = required(board.cards[0]); assert.equal(frame.type, 'frame'); assert.equal(frame.w, 1200);
  assert.ok(board.cards.slice(1).every(c => c.parent === frame.id));
  assert.ok(board.cards.some(c => c.props?.img === 'Hero image'));
});
test('website columns scale to narrow devices without negative widths', () => {
  const frame = card('screen01', 0, 0, 393, 852, 'frame');
  for (const [name, _p] of Object.entries(PIECES).filter(([, p]) => p.web)) {
    const commands = pieceCommands(name, { x: 0, y: 50 }, [frame]);
    assert.ok(commands.filter(c => c.op === 'create').every(c => required(c.w) > 0 && required(c.h) > 0), name);
  }
});
test('frame drag includes owned children even outside its bounds and does not double move', () => {
  const f = card('screen01', 0, 0, 393, 852, 'frame'), c = card('child001', 900, 900, 100, 30, 'text', { parent: f.id }), outside = card('outside1', 500, 0);
  const board = { cards: [f, c, outside] };
  assert.deepEqual(expandDrag([f, c], board).map(c => c.id), [f.id, c.id]);
  assert.deepEqual(expandDrag([c], board).map(c => c.id), [c.id]);
});
test('section membership follows centres, carries nested screens, ignores hidden and larger sections', () => {
  const section = card('section1', 0, 0, 600, 600, 'section'), f = card('screen01', 20, 40, 100, 100, 'frame');
  const child = card('child001', 900, 900, 100, 100, 'note', { parent: f.id });
  const edge = card('edge0001', 550, 200, 80, 80), out = card('outside1', 610, 0), hidden = card('hidden01', 100, 100, 100, 100, 'box', { props: { hidden: true } });
  const larger = card('larger01', -10, -10, 800, 800, 'section');
  const board = { cards: [section, f, child, edge, out, hidden, larger] };
  assert.deepEqual(expandDrag([section], board).map(c => c.id), [section.id, f.id, child.id, edge.id]);
  edge.x = 601;
  assert.ok(!expandDrag([section], board).includes(edge));
});
test('piece drag expands its group and modifier permits an independent edit', () => {
  const a = card('aaaaaaa1', 0, 0, 100, 100, 'box', { group: 'piece' }), b = card('bbbbbbb1', 0, 0, 100, 100, 'text', { group: 'piece' });
  assert.equal(expandDrag([a], { cards: [a, b] }).length, 2);
  assert.deepEqual(expandDrag([a], { cards: [a, b] }, { metaKey: true }), [a]);
});
test('drop assigns and clears card.parent, and lifts a card above its screen', () => {
  const c = card('child001', 10, 10), f = card('screen01', 0, 0, 393, 852, 'frame');
  const _board = apply(fresh(), [wireCard({ type: 'box' }), screenCommand('iPhone', { x: 0, y: 0 })]);
  const commands = dropCommands([c], { cards: [c, f] });
  assert.equal(PropsSchema.parse(required(commands[0]).set).parent, f.id); assert.equal(required(commands[1]).op, 'order');
  c.parent = f.id; c.x = 600;
  assert.deepEqual(required(dropCommands([c], { cards: [f, c] })[0]).set, { parent: '' });
  assert.equal(PropsSchema.parse(PropsSchema.parse(required(dropCommands([f], { cards: [f] }, 'resize')[0]).set).props).device, 'Custom');
});
test('snapping aligns edges and centres in screen pixels, excludes moving and hidden cards', () => {
  const moving = card('moving01', 0, 0), target = card('target01', 200, 210);
  const start = [{ c: moving, x: 0, y: 0 }];
  const result = snapDrag(start, 97, 107, { cards: [moving, target] }, { z: 1 });
  assert.deepEqual([result.dx, result.dy], [100, 110]); assert.equal(result.guides.length, 2);
  const far = snapDrag(start, 93, 103, { cards: [moving, target] }, { z: 1 }); assert.deepEqual([far.dx, far.dy], [93, 103]);
  const zoomed = snapDrag(start, 97, 107, { cards: [moving, target] }, { z: 4 }); assert.equal(zoomed.guides.length, 0);
  target.props = { hidden: true };
  assert.equal(snapDrag(start, 97, 107, { cards: [moving, target] }, { z: 1 }).guides.length, 0);
});
test('grid snapping preserves multi-card spacing and alt bypasses snapping', () => {
  const a = card('aaaaaaa1', 10, 20), b = card('bbbbbbb1', 110, 20), start = [a, b].map(c => ({ c, x: c.x, y: c.y }));
  assert.deepEqual(snapDrag(start, 10, 10, { cards: [a, b] }, { z: 1 }, { grid: true }), { dx: 16, dy: 6, guides: [] });
  assert.deepEqual(snapDrag(start, 10, 10, { cards: [a, b] }, { z: 1 }, { grid: true, disabled: true }), { dx: 10, dy: 10, guides: [] });
});
test('removing a section leaves its contained cards in place', () => {
  let board = apply(fresh(), [wireCard({ type: 'box' }, 200, 200)]); const original = structuredClone(required(board.cards[0]));
  board = apply(board, sectionCommands(board.cards));
  const section = required(board.cards.find(c => c.type === 'section')); assert.equal(required(board.cards[0]).id, section.id);
  board = apply(board, [{ op: 'delete', id: section.id }]); assert.deepEqual(board.cards, [original]);
});
test('alignment uses a single card frame and distribution measures equal gaps', () => {
  const f = card('screen01', 0, 0, 400, 800, 'frame'), a = card('aaaaaaa1', 10, 30, 80, 40, 'box', { parent: f.id });
  assert.equal(required(alignmentCommands([a], [f, a], 'centre')[0]).x, 160);
  const b = card('bbbbbbb1', 150, 50, 60, 40), c = card('ccccccc1', 400, 80, 100, 40);
  const result = alignmentCommands([a, b, c], [a, b, c], 'across');
  assert.equal(required(result[1]).x - (required(result[0]).x + a.w), required(result[2]).x - (required(result[1]).x + b.w));
});
test('borders, image labels, typography and rotation persist and merge', () => {
  let board = apply(fresh(), [wireCard({ type: 'box', img: 'Portrait', fill: 'none', stroke: '#ff0000', sw: 2, sdash: 'dash', dl: 9, dg: 6 })]);
  const id = required(board.cards[0]).id;
  board = apply(board, [{ op: 'update', id, set: { rot: 15, props: { radius: 30, sdash: 'dot' } } }]);
  assert.equal(required(required(board.cards[0]).props).img, 'Portrait'); assert.equal(required(required(board.cards[0]).props).dg, 6); assert.equal(required(required(board.cards[0]).props).sdash, 'dot'); assert.equal(required(board.cards[0]).rot, 15);
});
test('source thin dividers retain their visual dimensions within the board hit area', () => {
  const board = apply(fresh(), [wireCard({ type: 'box', w: 200, h: 1 })]);
  assert.equal(required(board.cards[0]).h, 24); assert.equal(required(required(board.cards[0]).props).visualH, 1);
});

test('group selection reaches a single part with Command or Control even when already selected', () => {
  const a = card('aaaaaaa1', 0, 0, 100, 100, 'box', { group: 'piece' }), b = card('bbbbbbb1', 0, 0, 100, 100, 'text', { group: 'piece' });
  const board = { cards: [a, b] };
  assert.deepEqual(selectForDrag([a.id], a.id, board), [a.id, b.id]);
  assert.deepEqual(selectForDrag([], a.id, board, { metaKey: true }), [a.id]);
  assert.deepEqual(selectForDrag([a.id, b.id], a.id, board, { ctrlKey: true }), [a.id]);
  assert.deepEqual(selectForDrag([a.id], a.id, board, { shiftKey: true }), [a.id]);
});
test('section centres determine membership without pulling in outside group parts', () => {
  const section = card('section1', 0, 0, 200, 200, 'section');
  const inside = card('inside01', 10, 10, 100, 100, 'box', { group: 'piece' });
  const outside = card('outside1', 300, 300, 100, 100, 'text', { group: 'piece' });
  const orphan = card('orphan01', 20, 20, 100, 100, 'note', { parent: 'deletedframe' });
  const board = { cards: [section, inside, outside, orphan] };
  assert.deepEqual(expandDrag([section], board).map(c => c.id), [section.id, inside.id, orphan.id]);
});
