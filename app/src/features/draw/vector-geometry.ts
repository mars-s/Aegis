import type { Card } from '@aegis/domain';
import type { VectorPoint } from './art.js';

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
