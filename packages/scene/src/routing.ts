import type { Point, Rect } from './geometry.js';

const clearance = 12;
const inflate = (r: Rect): Rect => ({ x: r.x - clearance, y: r.y - clearance, width: r.width + clearance * 2, height: r.height + clearance * 2 });
const inside = (p: Point, r: Rect): boolean => p.x > r.x + .01 && p.x < r.x + r.width - .01 && p.y > r.y + .01 && p.y < r.y + r.height - .01;
function blocked(a: Point, b: Point, rectangles: readonly Rect[]): boolean {
  return rectangles.some(r => a.x === b.x
    ? a.x > r.x + .01 && a.x < r.x + r.width - .01 && Math.max(a.y, b.y) > r.y + .01 && Math.min(a.y, b.y) < r.y + r.height - .01
    : a.y > r.y + .01 && a.y < r.y + r.height - .01 && Math.max(a.x, b.x) > r.x + .01 && Math.min(a.x, b.x) < r.x + r.width - .01);
}
function escape(p: Point, r: Rect): Point {
  const sides = [{ d: Math.abs(p.x - r.x), x: -1, y: 0 }, { d: Math.abs(p.x - r.x - r.width), x: 1, y: 0 }, { d: Math.abs(p.y - r.y), x: 0, y: -1 }, { d: Math.abs(p.y - r.y - r.height), x: 0, y: 1 }];
  const side = sides.reduce((a, b) => a.d <= b.d ? a : b);
  return { x: side.x < 0 ? r.x - clearance : side.x > 0 ? r.x + r.width + clearance : p.x, y: side.y < 0 ? r.y - clearance : side.y > 0 ? r.y + r.height + clearance : p.y };
}
interface Vertex extends Point { readonly key: number; readonly neighbours: Edge[] }
interface Edge { readonly node: Vertex; readonly distance: number; readonly axis: 'x' | 'y' }
interface Step { readonly node: Vertex; readonly cost: number; readonly axis: 'x' | 'y' | 'start'; readonly previous: Step | null }

/** Cached at geometry changes, never rebuilt during a camera pan. */
export function routeAround(p0: Point, p2: Point, source: Rect, target: Rect, obstacles: readonly Rect[]): readonly Point[] | null {
  const start = escape(p0, source), end = escape(p2, target);
  const rectangles = [source, target, ...obstacles].map(inflate);
  const left = Math.min(...rectangles.map(r => r.x)), right = Math.max(...rectangles.map(r => r.x + r.width));
  const top = Math.min(...rectangles.map(r => r.y)), bottom = Math.max(...rectangles.map(r => r.y + r.height));
  const simple = [
    [start, { x: end.x, y: start.y }, end], [start, { x: start.x, y: end.y }, end],
    [start, { x: start.x, y: top }, { x: end.x, y: top }, end],
    [start, { x: start.x, y: bottom }, { x: end.x, y: bottom }, end],
    [start, { x: left, y: start.y }, { x: left, y: end.y }, end],
    [start, { x: right, y: start.y }, { x: right, y: end.y }, end],
  ].filter(points => points.every((point, index) => { const previous = points[index - 1]; return !previous || !blocked(previous, point, rectangles); }));
  const length = (points: readonly Point[]): number => points.reduce((total, point, index) => { const previous = points[index - 1]; return total + (previous ? Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) : 0); }, 0);
  simple.sort((a, b) => length(a) - length(b));
  const detour = simple[0];
  if (detour) return [p0, ...detour, p2];
  const xs = [...new Set([start.x, end.x, ...rectangles.flatMap(r => [r.x, r.x + r.width])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...rectangles.flatMap(r => [r.y, r.y + r.height])])].sort((a, b) => a - b);
  // Keep a pathological overlap from building an unbounded Cartesian graph.
  // The caller retains its original curve when no bounded safe route is found.
  if (xs.length * ys.length > 4096) return null;
  const vertices = new Map<number, Vertex>();
  for (const [row, y] of ys.entries()) for (const [column, x] of xs.entries()) {
    const point = { x, y };
    if (!rectangles.some(r => inside(point, r))) { const key = row * xs.length + column; vertices.set(key, { ...point, key, neighbours: [] }); }
  }
  for (const vertex of vertices.values()) {
    for (const axis of ['x', 'y'] as const) {
      if (axis === 'x' && vertex.key % xs.length === xs.length - 1) continue;
      const next = vertices.get(vertex.key + (axis === 'x' ? 1 : xs.length));
      if (!next || blocked(vertex, next, rectangles)) continue;
      const distance = Math.abs(next.x - vertex.x) + Math.abs(next.y - vertex.y);
      vertex.neighbours.push({ node: next, distance, axis }); next.neighbours.push({ node: vertex, distance, axis });
    }
  }
  const first = vertices.get(ys.indexOf(start.y) * xs.length + xs.indexOf(start.x));
  const last = vertices.get(ys.indexOf(end.y) * xs.length + xs.indexOf(end.x));
  if (!first || !last) return null;
  const queue: Step[] = [{ node: first, cost: 0, axis: 'start', previous: null }], costs = new Map<string, number>();
  while (queue.length) {
    const score = (step: Step): number => step.cost + Math.abs(step.node.x - end.x) + Math.abs(step.node.y - end.y);
    queue.sort((a, b) => score(a) - score(b));
    const step = queue.shift(); if (!step) break;
    const key = `${step.node.key}:${step.axis}`, previousCost = costs.get(key);
    if (previousCost !== undefined && previousCost <= step.cost) continue;
    costs.set(key, step.cost);
    if (step.node === last) {
      const points: Point[] = [p2];
      for (let current: Step | null = step; current; current = current.previous) points.push({ x: current.node.x, y: current.node.y });
      points.push(p0); points.reverse();
      return points.filter((point, index) => {
        const before = points[index - 1], after = points[index + 1];
        return !before || !after || !(before.x === point.x && point.x === after.x || before.y === point.y && point.y === after.y);
      });
    }
    for (const edge of step.node.neighbours) queue.push({ node: edge.node, cost: step.cost + edge.distance + (step.axis !== 'start' && step.axis !== edge.axis ? 16 : 0), axis: edge.axis, previous: step });
  }
  return null;
}

export function quadraticIntersects(p0: Point, control: Point, p2: Point, rectangle: Rect): boolean {
  // A conservative control-hull test avoids routing curves that cannot meet an obstacle.
  const left = Math.min(p0.x, control.x, p2.x), top = Math.min(p0.y, control.y, p2.y);
  const right = Math.max(p0.x, control.x, p2.x), bottom = Math.max(p0.y, control.y, p2.y);
  if (right < rectangle.x || left > rectangle.x + rectangle.width || bottom < rectangle.y || top > rectangle.y + rectangle.height) return false;
  // Subdivision makes each line's hull converge on the exact quadratic.
  function crosses(a: Point, c: Point, b: Point, depth: number): boolean {
    if (Math.max(a.x, c.x, b.x) < rectangle.x || Math.min(a.x, c.x, b.x) > rectangle.x + rectangle.width || Math.max(a.y, c.y, b.y) < rectangle.y || Math.min(a.y, c.y, b.y) > rectangle.y + rectangle.height) return false;
    if (depth === 0 || inside(a, rectangle) || inside(b, rectangle)) return true;
    const ac = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, cb = { x: (c.x + b.x) / 2, y: (c.y + b.y) / 2 };
    const middle = { x: (ac.x + cb.x) / 2, y: (ac.y + cb.y) / 2 };
    return crosses(a, ac, middle, depth - 1) || crosses(middle, cb, b, depth - 1);
  }
  return crosses(p0, control, p2, 8);
}
