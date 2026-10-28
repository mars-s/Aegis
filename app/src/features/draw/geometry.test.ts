import { describe, expect, it } from 'vitest';
import { decodeStoredBoard } from '@aegis/protocol/storage';
import { applyBatch as reduceBatch, emptyBoard } from '@aegis/domain/commands';
import { BoardIdSchema, CardSchema } from '@aegis/domain/schema';
import type { Board } from '@aegis/domain/schema';
import { routeLink } from '@aegis/scene';
import { DrawingProps, outlineAttributes, pathD, shapePoints, squigPath, SHAPES } from './art.js';
import { shapePathCommands } from './commands.js';
import { fitPoints, inkHit, localToWorld, pointOnSegment, splitSegment, worldToLocal } from './vector-geometry.js';

// Ported from checks/host/draw.test.ts: the drawing geometry cases, now run against the TypeScript modules the app uses.
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Expected fixture value');
  return value;
}
const run = (board: Board, commands: unknown[]) => { const result = reduceBatch(board, { commands }); return { ...result, board: decodeStoredBoard(result.board) }; };
function linked() {
  return run(emptyBoard(BoardIdSchema.parse('drawing')), [
    ...['aaaaaa', 'bbbbbb', 'cccccc'].map((newId, i) => ({ op: 'create', newId, x: i * 300, y: 0 })),
    { op: 'connect', a: 'aaaaaa', b: 'bbbbbb', newId: 'linkaa' },
  ]).board;
}
const ink = (fields: Record<string, unknown>) => CardSchema.parse({ id: 'inkaa', type: 'ink', text: '', color: 'plain', ...fields });
const outline = (props: Record<string, unknown>) => {
  const attributes = outlineAttributes(DrawingProps.parse(props));
  return { 'stroke-width': attributes.strokeWidth, 'stroke-dasharray': attributes.strokeDasharray, 'stroke-linecap': attributes.strokeLinecap };
};
const shapeNames = (name: string): keyof typeof SHAPES => {
  if (!(name in SHAPES)) throw new Error(`Unknown shape ${name}`);
  return Object.keys(SHAPES).find((key): key is keyof typeof SHAPES => key === name) ?? 'rect';
};

describe('drawing geometry', () => {
  it('rounded corners and Bezier handles survive real geometry changes', () => {
    const p = [{ x: 0, y: 0 }, { x: 100, y: 0, r: 20 }, { x: 100, y: 100 }];
    expect(pathD(p, false)).toMatch(/Q100 0 100 20/);
    const curve = [{ x: 0, y: 0, ox: 10, oy: 100 }, { x: 100, y: 0, ix: 90, iy: 100 }];
    const split = splitSegment(curve, 0, .4);
    for (const t of [0, .1, .4, .75, 1]) {
      const expected = pointOnSegment(required(curve[0]), required(curve[1]), t), actual = t <= .4 ? pointOnSegment(required(split[0]), required(split[1]), t / .4) : pointOnSegment(required(split[1]), required(split[2]), (t - .4) / .6);
      expect(Math.hypot(expected.x - actual.x, expected.y - actual.y) < 1e-8).toBe(true);
    }
  });

  it('eraser finds the painted stroke between samples after resizing and rotation', () => {
    const c = ink({ x: 20, y: 20, w: 200, h: 100, rot: 90, props: { points: [[0, 50, 0], [100, 50, 1]], ow: 100, oh: 100, size: 4 } });
    expect(inkHit(c, localToWorld(c, { x: 50, y: 50 }), 8)).toBe(true);
    expect(inkHit(c, { x: 800, y: 800 }, 8)).toBe(false);
    const back = worldToLocal(c, localToWorld(c, { x: 50, y: 25 }));
    expect(back.x).toBeCloseTo(50, 10); expect(back.y).toBeCloseTo(25, 10);
  });

  it('shapes, flat paths and squiggles have finite usable bounds and geometry', () => {
    expect([fitPoints([{ x: 10, y: 20 }, { x: 200, y: 20 }]).w, fitPoints([{ x: 10, y: 20 }]).h]).toEqual([206, 24]);
    for (const shape of ['rect', 'tri', 'circle', 'diamond', 'star', 'hexagon', 'arrow']) expect(shapePoints(shapeNames(shape)).length >= 3).toBe(true);
    const styles = (['wavy', 'zigzag', 'loopy'] as const).map(squig => squigPath({ id: 'squig', squig, round: squig === 'zigzag' ? 0 : 60, waves: 5, wobble: 20 }));
    expect(new Set(styles).size).toBe(3); expect(styles.every(d => !/NaN|Infinity/.test(d))).toBe(true);
  });

  it('connector geometry tracks bend, pins, card moves and rotation', () => {
    const [a, b] = linked().cards;
    if (!a || !b) throw new Error('Missing linked cards');
    const rect = (card: typeof a) => ({ x: card.x, y: card.y, width: card.w, height: card.h });
    const middle = (g: ReturnType<typeof routeLink>) => ({ x: (g.p0.x + g.p2.x) / 2, y: (g.p0.y + g.p2.y) / 2 });
    const handle = (g: ReturnType<typeof routeLink>) => { const m = middle(g); return { x: (m.x + g.control.x) / 2, y: (m.y + g.control.y) / 2 }; };
    const g = routeLink({ bend: 0, pa: { u: 1, v: .5 }, pb: { u: 0, v: .5 } }, rect(a), rect(b));
    expect(handle(g)).toEqual(middle(g)); expect(g.p0.x).toBe(a.x + a.w);
    const curved = routeLink({ bend: 60 }, rect(a), rect(b)); expect(handle(curved).y > middle(curved).y).toBe(true);
    const turned = routeLink({ pa: { u: 1, v: .5 } }, rect(a), rect(b), 90);
    expect(Math.abs(turned.p0.y - (a.y + a.h / 2 + a.w / 2)) < 1e-8).toBe(true);
  });

  it('shape-to-path conversion preserves card identity, stacking and styled connectors atomically', () => {
    const b = run(linked(), [{ op: 'create', type: 'shape', newId: 'shapeaa', props: { shape: 'star' } }, { op: 'connect', a: 'aaaaaa', b: 'shapeaa', newId: 'linkcc' }, { op: 'link_update', id: 'linkcc', set: { label: 'Star', bend: -40, dash: true, arrow: 'end', colour: '#ff00ff', pb: { u: 0, v: .5 } } }]).board;
    const shape = required(b.cards.at(-1)), converted = CardSchema.parse({ ...shape, props: { ...shape.props, points: shapePoints('star'), closed: true, ow: 100, oh: 100 } });
    const result = run(b, shapePathCommands(b, converted));
    expect(result.ok).toBe(true); expect(required(result.board.cards.at(-1)).type).toBe('path'); expect(required(result.board.cards.at(-1)).id).toBe(shape.id);
    expect(required(required(result.board.cards.at(-1)).props).shape).toBeUndefined();
    expect(result.board.links).toEqual(b.links);
  });

  it('legacy dashed outlines still render and explicit no-border overrides their flag', () => {
    expect(outline({ dash: true })['stroke-dasharray']).toBe('8 6');
    const hidden = outline({ dash: true, sdash: 'none', sw: 4 });
    expect(hidden['stroke-width']).toBe(0);
    expect(hidden['stroke-dasharray']).toBeUndefined();
    expect(outline({ sw: 0 })['stroke-width']).toBe(0);
  });

  it('dotted outlines leave room for round caps as thickness and custom gap change', () => {
    const dotted = outline({ sdash: 'dot', sw: 3, dg: 9 });
    expect(dotted['stroke-dasharray']).toBe('0 15');
    expect(dotted['stroke-linecap']).toBe('round');
    expect(outline({ sdash: 'dash', dl: 13, dg: 9 })['stroke-dasharray']).toBe('13 9');
  });
});
