import type { Link } from '@aegis/domain/schema';
import type { Bounds, Point, Rect } from './geometry.js';
import { fromBounds, rotatedBounds } from './geometry.js';
import { quadraticIntersects, routeAround } from './routing.js';

export interface LinkRoute {
  readonly p0: Point;
  readonly p2: Point;
  readonly control: Point;
  readonly label: Point;
  readonly points: readonly Point[];
}

function edge(rect: Rect, rotation: number, target: Point, pin: Link['pa']): Point {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  let x: number, y: number;
  if (pin) { x = (pin.u - 0.5) * rect.width; y = (pin.v - 0.5) * rect.height; }
  else {
    const dx = target.x - cx, dy = target.y - cy;
    x = dx * cos + dy * sin; y = -dx * sin + dy * cos;
    const scale = Math.min(x ? rect.width / 2 / Math.abs(x) : Infinity, y ? rect.height / 2 / Math.abs(y) : Infinity);
    const k = Number.isFinite(scale) ? scale : 0;
    x *= k; y *= k;
  }
  return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
}

export function routeLink(link: Pick<Link, 'pa' | 'pb' | 'bend'>, a: Rect, b: Rect, aRotation = 0, bRotation = 0, scale = 1, obstacles: readonly Rect[] = []): LinkRoute {
  const p0 = edge(a, aRotation, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, link.pa);
  const p2 = edge(b, bRotation, { x: a.x + a.width / 2, y: a.y + a.height / 2 }, link.pb);
  const dx = p2.x - p0.x, dy = p2.y - p0.y, length = Math.hypot(dx, dy) || 1;
  const bend = link.bend === undefined ? Math.min(80 * scale, length * 0.2) : link.bend * scale;
  const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
  const control = { x: mid.x - dy / length * bend, y: mid.y + dx / length * bend };
  const points = !link.bend && obstacles.some(rect => quadraticIntersects(p0, control, p2, rect)) ? routeAround(p0, p2, fromBounds(rotatedBounds(a, aRotation)), fromBounds(rotatedBounds(b, bRotation)), obstacles) ?? [] : [];
  const middle = points[Math.floor(points.length / 2)];
  return { p0, p2, control, points, label: middle ?? { x: (p0.x + 2 * control.x + p2.x) / 4, y: (p0.y + 2 * control.y + p2.y) / 4 } };
}

export function routeDistance(point: Point, route: LinkRoute): number {
  let previous = route.p0, nearest = Infinity;
  const steps = route.points.length ? route.points.length - 1 : 32;
  for (let index = 1; index <= steps; index++) {
    const t = index / steps, one = 1 - t;
    const next = route.points[index] ?? { x: one * one * route.p0.x + 2 * one * t * route.control.x + t * t * route.p2.x, y: one * one * route.p0.y + 2 * one * t * route.control.y + t * t * route.p2.y };
    const dx = next.x - previous.x, dy = next.y - previous.y;
    const along = Math.max(0, Math.min(1, ((point.x - previous.x) * dx + (point.y - previous.y) * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, Math.hypot(point.x - previous.x - dx * along, point.y - previous.y - dy * along));
    previous = next;
  }
  return nearest;
}

/** The quadratic lies in its control hull. Include the complete label too. */
export function linkBounds(route: LinkRoute, label: string): Bounds {
  // Labels stay screen-sized. The UI's minimum zoom is 0.05.
  const labelRadius = label ? (label.length * 6 + 16) / 0.05 : 16;
  const labelTop = label ? 28 / 0.05 : 16, labelBottom = label ? 12 / 0.05 : 16;
  return { minX: Math.min(route.p0.x, route.p2.x, route.control.x, route.label.x - labelRadius, ...route.points.map(point => point.x)) - 16,
    minY: Math.min(route.p0.y, route.p2.y, route.control.y, route.label.y - labelTop, ...route.points.map(point => point.y)) - 16,
    maxX: Math.max(route.p0.x, route.p2.x, route.control.x, route.label.x + labelRadius, ...route.points.map(point => point.x)) + 16,
    maxY: Math.max(route.p0.y, route.p2.y, route.control.y, route.label.y + labelBottom, ...route.points.map(point => point.y)) + 16 };
}
