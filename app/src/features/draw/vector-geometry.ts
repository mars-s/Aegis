import type { Card } from '@aegis/domain';
import { InkProps } from './art.js';
import type { VectorPoint } from './art.js';

interface Point { readonly x: number; readonly y: number }

/** Local drawing coordinates (in the card's original ow/oh space) to world coordinates, following resize and rotation. */
export function localToWorld(card: Pick<Card, 'x' | 'y' | 'w' | 'h' | 'rot' | 'props'>, point: Point): Point {
  const props = InkProps.parse(card.props ?? {}), ow = props.ow ?? card.w, oh = props.oh ?? card.h;
  const x = point.x * card.w / ow - card.w / 2, y = point.y * card.h / oh - card.h / 2, t = (card.rot ?? 0) * Math.PI / 180;
  return { x: card.x + card.w / 2 + x * Math.cos(t) - y * Math.sin(t), y: card.y + card.h / 2 + x * Math.sin(t) + y * Math.cos(t) };
}

export function worldToLocal(card: Pick<Card, 'x' | 'y' | 'w' | 'h' | 'rot' | 'props'>, point: Point): Point {
  const props = InkProps.parse(card.props ?? {}), ow = props.ow ?? card.w, oh = props.oh ?? card.h;
  const x = point.x - card.x - card.w / 2, y = point.y - card.y - card.h / 2, t = -(card.rot ?? 0) * Math.PI / 180;
  return { x: (x * Math.cos(t) - y * Math.sin(t) + card.w / 2) * ow / card.w, y: (x * Math.sin(t) + y * Math.cos(t) + card.h / 2) * oh / card.h };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Whether an eraser of this radius touches the painted stroke itself, including between samples, after resize and rotation. */
export function inkHit(card: Pick<Card, 'x' | 'y' | 'w' | 'h' | 'rot' | 'props'>, at: Point, radius: number): boolean {
  const props = InkProps.parse(card.props ?? {});
  const points = props.points.map(([x, y]) => localToWorld(card, { x, y }));
  const reach = radius + props.size / 2 * Math.max(card.w / (props.ow ?? card.w), card.h / (props.oh ?? card.h));
  return points.some((point, index) => {
    const previous = points[index - 1];
    return previous ? distanceToSegment(at, previous, point) <= reach : Math.hypot(at.x - point.x, at.y - point.y) <= reach;
  });
}

export function shiftPoint(point: VectorPoint, dx: number, dy: number): VectorPoint {
  return { ...point, x: point.x + dx, y: point.y + dy, ...(point.ix === undefined ? {} : { ix: point.ix + dx, iy: (point.iy ?? point.y) + dy }), ...(point.ox === undefined ? {} : { ox: point.ox + dx, oy: (point.oy ?? point.y) + dy }) };
}

export function worldPoints(card: Card, points: readonly VectorPoint[], ow = card.w, oh = card.h): VectorPoint[] {
  const angle = (card.rot ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const at = (x: number, y: number) => {
    const dx = x * card.w / ow - card.w / 2, dy = y * card.h / oh - card.h / 2;
    return { x: card.x + card.w / 2 + dx * cos - dy * sin, y: card.y + card.h / 2 + dx * sin + dy * cos };
  };
  return points.map(point => {
    const inside = point.ix === undefined ? null : at(point.ix, point.iy ?? point.y), outside = point.ox === undefined ? null : at(point.ox, point.oy ?? point.y);
    return { ...point, ...at(point.x, point.y), ...(inside ? { ix: inside.x, iy: inside.y } : {}), ...(outside ? { ox: outside.x, oy: outside.y } : {}) };
  });
}

export function fitPoints(points: readonly VectorPoint[]) {
  const x = Math.min(...points.map(point => Math.min(point.x, point.ix ?? point.x, point.ox ?? point.x))) - 8;
  const y = Math.min(...points.map(point => Math.min(point.y, point.iy ?? point.y, point.oy ?? point.y))) - 8;
  const w = Math.max(40, ...points.map(point => Math.max(point.x, point.ix ?? point.x, point.ox ?? point.x) - x + 8));
  const h = Math.max(24, ...points.map(point => Math.max(point.y, point.iy ?? point.y, point.oy ?? point.y) - y + 8));
  return { x, y, w, h, points: points.map(point => shiftPoint(point, -x, -y)) };
}

export function pointOnSegment(a: VectorPoint, b: VectorPoint, t: number) {
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * (a.ox ?? a.x) + 3 * u * t * t * (b.ix ?? b.x) + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * (a.oy ?? a.y) + 3 * u * t * t * (b.iy ?? b.y) + t ** 3 * b.y };
}

export function splitSegment(points: readonly VectorPoint[], index: number, t: number): VectorPoint[] {
  const result = points.map(point => ({ ...point })), a = result[index], b = result[(index + 1) % result.length];
  if (!a || !b) return result;
  const mix = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const ab = mix(a, { x: a.ox ?? a.x, y: a.oy ?? a.y }), bc = mix({ x: a.ox ?? a.x, y: a.oy ?? a.y }, { x: b.ix ?? b.x, y: b.iy ?? b.y }), cd = mix({ x: b.ix ?? b.x, y: b.iy ?? b.y }, b), abc = mix(ab, bc), bcd = mix(bc, cd);
  const point: VectorPoint = mix(abc, bcd);
  if (a.ox !== undefined || b.ix !== undefined) { a.ox = ab.x; a.oy = ab.y; b.ix = cd.x; b.iy = cd.y; Object.assign(point, { ix: abc.x, iy: abc.y, ox: bcd.x, oy: bcd.y }); }
  result.splice(index + 1, 0, point); return result;
}
