import { decodeStoredBoard } from '@aegis/protocol/storage';
import type { Board } from '@aegis/domain/schema';
import { required } from './required.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBatch } from './batch.ts';
import { emptyBoard, describe } from '@aegis/domain/commands';
import { pathD, inkHit, fitPoints, shapePoints, splitSegment, pointOnSegment, localToWorld, worldToLocal, squigPath, outlineAttrs } from './adapters/draw.ts';
import { linkGeometry } from './adapters/draw.ts';
const run = (b: Board, commands: unknown[]) => applyBatch(b, { commands });
function linked() {
  return run(emptyBoard('drawing'), [
    ...['aaaaaa', 'bbbbbb', 'cccccc'].map((newId, i) => ({ op: 'create', newId, x: i * 300, y: 0 })),
    { op: 'connect', a: 'aaaaaa', b: 'bbbbbb', newId: 'linkaa' },
  ]).board;
}
test('drawing card props survive commands, description and JSON persistence', () => {
  const commands = [
    { op: 'create', type: 'ink', props: { points: [[0, 0, 1], [20, 30, 4]], pen: 'hi', size: 24, ink: '#ff0000', ow: 40, oh: 40 } },
    { op: 'create', type: 'shape', text: 'Decision', props: { shape: 'diamond', fill: 'none', stroke: '#123456' } },
    { op: 'create', type: 'path', props: { points: [{ x: 0, y: 0, ox: 30, oy: 20 }, { x: 70, y: 60, r: 10 }], closed: false } },
    { op: 'create', type: 'stamp', props: { emoji: '🌱' } },
  ];
  const result = run(emptyBoard('drawing'), commands); assert.equal(result.ok, true);
  const saved = decodeStoredBoard(JSON.parse(JSON.stringify(result.board)));
  for (const [i, _c] of saved.cards.entries()) assert.deepEqual(required(describe(saved).cards[i]).props, required(commands[i]).props);
});
test('link_update keeps stable ids, styles, label and pins visible to the host', () => {
  const b = linked(), style = { bend: -60, dash: true, arrow: 'both', colour: '#aabbcc', label: '<A & B>', pa: { u: 1, v: .25 }, pb: { u: 0, v: .75 } };
  assert.equal(required(b.links[0]).id, 'linkaa');
  const result = run(b, [{ op: 'link_update', id: 'linkaa', set: style }]); assert.equal(result.ok, true);
  assert.deepEqual(required(describe(result.board).links[0]), { id: 'linkaa', a: 'aaaaaa', b: 'bbbbbb', ...style });
  assert.equal(required(b.links[0]).bend, undefined);
  const auto = run(result.board, [{ op: 'link_update', id: 'linkaa', set: { pa: null, pb: null, bend: null } }]);
  assert.equal('pa' in required(auto.board.links[0]), false); assert.equal('bend' in required(auto.board.links[0]), false);
});
test('reconnect and removal are atomic, missing cards and invalid styles are refused', () => {
  const b = linked();
  const moved = run(b, [{ op: 'link_update', id: 'linkaa', set: { b: 'cccccc' } }]); assert.equal(required(moved.board.links[0]).b, 'cccccc');
  for (const set of [{ a: 'missing' }, { a: 'bbbbbb' }, { bend: NaN }, { dash: 'yes' }, { arrow: 'unknown' }, { colour: 'url(evil)' }, { pa: { u: .5, v: .5 } }]) {
    const result = run(b, [{ op: 'link_update', id: 'linkaa', set: { label: 'changed', ...set } }]); assert.equal(result.ok, false, JSON.stringify(set)); assert.equal(result.board, b);
  }
  assert.equal(run(b, [{ op: 'link_update', id: 'linkaa', remove: true }]).board.links.length, 0);
  assert.equal(run(b, [{ op: 'link_update', id: 'missing', set: {} }]).ok, false);
});
test('reconnection rejects duplicate undirected pairs and deletion still removes attached links', () => {
  const b = run(linked(), [{ op: 'connect', a: 'cccccc', b: 'aaaaaa', newId: 'linkbb' }]).board;
  assert.equal(run(b, [{ op: 'link_update', id: 'linkaa', set: { b: 'cccccc' } }]).ok, false);
  assert.equal(run(b, [{ op: 'delete', id: 'aaaaaa' }]).board.links.length, 0);
});
test('rounded corners and Bezier handles survive real geometry changes', () => {
  const p = [{ x: 0, y: 0 }, { x: 100, y: 0, r: 20 }, { x: 100, y: 100 }];
  assert.match(pathD(p, false), /Q100 0 100 20/);
  const curve = [{ x: 0, y: 0, ox: 10, oy: 100 }, { x: 100, y: 0, ix: 90, iy: 100 }];
  const split = splitSegment(curve, 0, .4);
  for (const t of [0, .1, .4, .75, 1]) {
    const expected = pointOnSegment(required(curve[0]), required(curve[1]), t), actual = t <= .4 ? pointOnSegment(required(split[0]), required(split[1]), t / .4) : pointOnSegment(required(split[1]), required(split[2]), (t - .4) / .6);
    assert.ok(Math.hypot(expected.x - actual.x, expected.y - actual.y) < 1e-8);
  }
});
test('eraser finds the painted stroke between samples after resizing and rotation', async () => {
  const c = { x: 20, y: 20, w: 200, h: 100, rot: 90, props: { points: [[0, 50, 0], [100, 50, 1]], ow: 100, oh: 100, size: 4 } };
  assert.equal(await inkHit(c, localToWorld(c, { x: 50, y: 50 }), 8), true);
  assert.equal(await inkHit(c, { x: 800, y: 800 }, 8), false);
  assert.deepEqual(await worldToLocal(c, localToWorld(c, { x: 50, y: 25 })), { x: 50, y: 25 });
});
test('shapes, flat paths and squiggles have finite usable bounds and geometry', () => {
  assert.deepEqual([fitPoints([{ x: 10, y: 20 }, { x: 200, y: 20 }]).w, fitPoints([[10, 20, 0]]).h], [206, 24]);
  for (const shape of ['rect', 'tri', 'circle', 'diamond', 'star', 'hexagon', 'arrow']) assert.ok(shapePoints(shape).length >= 3);
  const styles = ['wavy', 'zigzag', 'loopy'].map(squig => squigPath({ squig, round: squig === 'zigzag' ? 0 : 60, waves: 5, wobble: 20 }));
  assert.equal(new Set(styles).size, 3); assert.ok(styles.every(d => !/NaN|Infinity/.test(d)));
});
test('connector geometry tracks bend, pins, card moves and rotation', () => {
  const [a, b] = linked().cards;
  assert.ok(a && b);
  const g = linkGeometry({ bend: 0, pa: { u: 1, v: .5 }, pb: { u: 0, v: .5 } }, a, b);
  assert.deepEqual(g.handle, g.mid); assert.equal(g.p0.x, a.x + a.w);
  const curved = linkGeometry({ bend: 60 }, a, b); assert.ok(curved.handle.y > curved.mid.y);
  const turned = linkGeometry({ pa: { u: 1, v: .5 } }, { ...a, rot: 90 }, b);
  assert.ok(Math.abs(turned.p0.y - (a.y + a.h / 2 + a.w / 2)) < 1e-8);
});

test('shape-to-path conversion preserves card identity, stacking and styled connectors atomically', async () => {
  const { shapePathCommands } = await import('./adapters/draw.ts');
  const b = run(linked(), [{ op: 'create', type: 'shape', newId: 'shapeaa', props: { shape: 'star' } }, { op: 'connect', a: 'aaaaaa', b: 'shapeaa', newId: 'linkcc' }, { op: 'link_update', id: 'linkcc', set: { label: 'Star', bend: -40, dash: true, arrow: 'end', colour: '#ff00ff', pb: { u: 0, v: .5 } } }]).board;
  const shape = required(b.cards.at(-1)), converted = { ...shape, props: { ...shape.props, points: shapePoints('star'), closed: true, ow: 100, oh: 100 } };
  const result = run(b, shapePathCommands(b, converted));
  assert.equal(result.ok, true); assert.equal(required(result.board.cards.at(-1)).type, 'path'); assert.equal(required(result.board.cards.at(-1)).id, shape.id);
  assert.equal(required(required(result.board.cards.at(-1)).props).shape, undefined);
  assert.deepEqual(result.board.links, b.links);
});

test('legacy dashed outlines still render and explicit no-border overrides their flag', () => {
  assert.equal(outlineAttrs({ dash: true })['stroke-dasharray'], '8 6');
  const hidden = outlineAttrs({ dash: true, sdash: 'none', sw: 4 });
  assert.equal(hidden['stroke-width'], 0);
  assert.equal(hidden['stroke-dasharray'], undefined);
  assert.equal(outlineAttrs({ sw: 0 })['stroke-width'], 0);
});
test('dotted outlines leave room for round caps as thickness and custom gap change', () => {
  const dotted = outlineAttrs({ sdash: 'dot', sw: 3, dg: 9 });
  assert.equal(dotted['stroke-dasharray'], '0 15');
  assert.equal(dotted['stroke-linecap'], 'round');
  assert.equal(outlineAttrs({ sdash: 'dash', dl: 13, dg: 9 })['stroke-dasharray'], '13 9');
});
