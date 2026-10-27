import { describe, expect, test } from 'vitest';
import { LinkSchema, CardSchema } from '@aegis/domain/schema';
import { routeLink } from '../../../packages/scene/src/links.js';
import { SceneGraph } from '../../../packages/scene/src/graph.js';
import { board, card, delta } from './fixtures.js';

function crosses(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, r: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): boolean {
  return a.x === b.x ? a.x > r.x && a.x < r.x + r.width && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.height : a.y > r.y && a.y < r.y + r.height && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.width;
}

describe('cached link routes', () => {
  test('preserves an authored world-space bend across a real obstacle', () => {
    const source = { x: 0, y: 200, width: 200, height: 160 }, target = { ...source, x: 800 };
    const link = LinkSchema.parse({ id: 'bent', a: 'a', b: 'b', bend: 400 });
    const result = routeLink(link, source, target, 0, 0, 1, [{ x: 350, y: 160, width: 300, height: 400 }]);
    expect(result.p0).toEqual({ x: 200, y: 280 }); expect(result.p2).toEqual({ x: 800, y: 280 });
    expect(result.control).toEqual({ x: 500, y: 680 });
    expect(result.points).toEqual([]);
  });

  test('routes around a real intervening card and keeps explicit endpoint pins', () => {
    const source = { x: 0, y: 200, width: 200, height: 160 }, target = { ...source, x: 800 };
    const obstacle = { x: 350, y: 160, width: 300, height: 260 };
    const link = LinkSchema.parse({ id: 'route', a: 'a', b: 'b', bend: 0, pa: { u: 1, v: .5 }, pb: { u: 0, v: .5 } });
    const result = routeLink(link, source, target, 0, 0, 1, [obstacle]);
    expect(result.p0).toEqual({ x: 200, y: 280 }); expect(result.p2).toEqual({ x: 800, y: 280 });
    expect(result.points.length).toBeGreaterThan(2);
    for (let i = 1; i < result.points.length; i++) {
      const before = result.points[i - 1], after = result.points[i];
      if (before && after) expect(crosses(before, after, obstacle)).toBe(false);
    }
  });
  test('moving and hiding an unrelated obstacle invalidates the crossing route', () => {
    const a = CardSchema.parse({ ...card('a', 0, 200), w: 200, h: 160 });
    const b = CardSchema.parse({ ...a, id: 'b', x: 800 });
    const obstacle = CardSchema.parse({ ...card('obstacle', 350, 160), w: 300, h: 260 });
    const source = board([a, b, obstacle]); source.links.push(LinkSchema.parse({ id: 'route', a: a.id, b: b.id, bend: 0 }));
    const graph = new SceneGraph(source), key = source.links[0]?.id;
    if (!key) throw new Error('Missing fixture link');
    expect(graph.links.get(key)?.route.points.length).toBeGreaterThan(2);
    graph.apply(delta([CardSchema.parse({ ...obstacle, y: 1000 })]));
    expect(graph.links.get(key)?.route.points).toEqual([]);
    graph.apply(delta([obstacle]));
    expect(graph.links.get(key)?.route.points.length).toBeGreaterThan(2);
    graph.apply(delta([CardSchema.parse({ ...obstacle, props: { hidden: true } })]));
    expect(graph.links.get(key)?.route.points).toEqual([]);
  });
});
