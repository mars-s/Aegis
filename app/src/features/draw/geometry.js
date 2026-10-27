// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
export { pathD, butter } from './art.ts';
import { pathD, butter, centerline } from './art.ts';

export function squigPath(c) {
    const n = Math.max(.5, c.waves ?? 6), r = (c.round ?? 60) / 100, wob = (c.wobble ?? 0) / 100, A = 46, st = c.squig;
    let seed = [...String(c.id || 'x')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const p1 = rnd() * 6.28, p2 = rnd() * 6.28, p3 = rnd() * 6.28;
    const wobAmp = u => 1 + wob * .55 * (Math.sin(6.28 * .37 * u + p1) * .6 + Math.sin(6.28 * .83 * u + p2) * .4), drift = u => wob * A * .22 * Math.sin(6.28 * .21 * u + p3);
    const pts = [], N = Math.ceil(4 * n) * 14;
    for (let i = 0; i <= N; i++) { const t = i / N, u = n * t; let x, y;
      if (st === 'loopy') { const k = 1 + r * 1.8, th = 6.28318 * u; x = (th - k * Math.sin(th)) / (6.28318 * n) * 100; y = 50 - A * .8 * Math.cos(th) * wobAmp(u) + drift(u); }
      else { const sn = Math.sin(6.28318 * u), tri = 2 / Math.PI * Math.asin(sn), mix = r; x = t * 100; y = 50 - A * (tri * (1 - mix) + sn * mix) * wobAmp(u) + drift(u); }
      pts.push(x.toFixed(2) + ' ' + y.toFixed(2)); }
    return 'M' + pts.join(' L');
  }

export const SHAPES = {
  rect: 'Rectangle', circle: 'Ellipse', tri: 'Triangle', diamond: 'Diamond', star: 'Star', heart: 'Heart', arrow: 'Arrow', hexagon: 'Hexagon', line: 'Line',
};
export const INKS = { ink: 'var(--text)', pink: '#f27aa8', coral: '#ff7f6b', butter: '#f3c84a', mint: '#3fbf86', sky: '#4aa3f0', lilac: '#9b7bff', white: '#ffffff' };
export const colour = (value, fallback = 'var(--text)') => INKS[value] || (/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : value === 'none' ? 'none' : fallback);
export const svg = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};
export function inkNode(points, pen, size, ink, finished = true) {
  const col = colour(ink), w = Number(size) || 9;
  if (points.length < 2 || points.every(p => Math.hypot(p[0] - points[0][0], p[1] - points[0][1]) < .5)) return svg('circle', { cx: points[0]?.[0] || 0, cy: points[0]?.[1] || 0, r: w / 2, fill: col, opacity: pen === 'hi' ? .38 : 1 });
  return pen === 'pen' ? svg('path', { d: butter(points, finished, w), fill: col }) : svg('path', { d: centerline(points), fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: pen === 'hi' ? .38 : 1 });
}
const outlines = {
  rect: [[0, 0], [100, 0], [100, 100], [0, 100]], tri: [[50, 2], [98, 98], [2, 98]],
  diamond: [[50, 0], [100, 50], [50, 100], [0, 50]],
  star: [[50, 3], [62, 36], [97, 37], [69, 58], [79, 93], [50, 72], [21, 93], [31, 58], [3, 37], [38, 36]],
  arrow: [[0, 30], [60, 30], [60, 0], [100, 50], [60, 100], [60, 70], [0, 70]],
  hexagon: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]],
};
export function shapePoints(shape, w = 100, h = 100) {
  if (shape === 'circle') {
    const k = .5523;
    return [[50, 0, 50 - 50 * k, 0, 50 + 50 * k, 0], [100, 50, 100, 50 - 50 * k, 100, 50 + 50 * k], [50, 100, 50 + 50 * k, 100, 50 - 50 * k, 100], [0, 50, 0, 50 + 50 * k, 0, 50 - 50 * k]].map(([x, y, ix, iy, ox, oy]) => ({ x: x * w / 100, y: y * h / 100, ix: ix * w / 100, iy: iy * h / 100, ox: ox * w / 100, oy: oy * h / 100 }));
  }
  return outlines[shape]?.map(([x, y]) => ({ x: x * w / 100, y: y * h / 100 }));
}
// Keep old boolean dash cards readable while sharing the same outline options.
export const outlineStyle = p => p.sdash ?? (p.dash ? 'dash' : 'solid');
export function outlineAttrs(p, fallback = 2.5) {
  const style = outlineStyle(p), width = style === 'none' ? 0 : p.sw ?? fallback;
  const attrs = { stroke: colour(p.stroke), 'stroke-width': width };
  if (style === 'dash') attrs['stroke-dasharray'] = `${p.dl ?? 8} ${p.dg ?? 6}`;
  if (style === 'dot') Object.assign(attrs, { 'stroke-dasharray': `0 ${(p.dg ?? 6) + width * 2}`, 'stroke-linecap': 'round' });
  return attrs;
}
export function shapeNode(card) {
  const p = card.props || {}, shape = p.shape || 'rect';
  const attrs = { fill: colour(p.fill, '#aed3ff'), ...outlineAttrs(p, 2), 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' };
  if (shape === 'line') return svg('path', { ...attrs, d: !p.squig || p.squig === 'straight' ? 'M0 50 L100 50' : squigPath({ ...p, id: card.id }), fill: 'none', stroke: colour(p.stroke), 'stroke-width': p.lw ?? p.sw ?? 4, 'stroke-linecap': 'round' });
  if (shape === 'heart') return svg('path', { ...attrs, d: 'M50 92 C20 72 3 55 3 33 C3 15 17 4 31 4 C40 4 47 9 50 16 C53 9 60 4 69 4 C83 4 97 15 97 33 C97 55 80 72 50 92 Z' });
  // Radius is stored in world pixels, then converted to this shape's view box.
  return svg('path', { ...attrs, d: pathD(shapePoints(shape) || shapePoints('rect'), true, (p.radius || 0) * 100 / Math.min(card.w, card.h)) });
}
export function fitPoints(points, padding = 8) {
  const xs = points.flatMap(q => Array.isArray(q) ? [q[0]] : [q.x, q.ix ?? q.x, q.ox ?? q.x]);
  const ys = points.flatMap(q => Array.isArray(q) ? [q[1]] : [q.y, q.iy ?? q.y, q.oy ?? q.y]);
  const x = Math.min(...xs) - padding, y = Math.min(...ys) - padding;
  const w = Math.max(40, Math.max(...xs) - x + padding), h = Math.max(24, Math.max(...ys) - y + padding);
  return { x, y, w, h, points: points.map(q => Array.isArray(q) ? [q[0] - x, q[1] - y, q[2]] : shiftPoint(q, -x, -y)) };
}
export function shiftPoint(q, dx, dy) {
  const p = { ...q, x: q.x + dx, y: q.y + dy };
  for (const k of ['i', 'o']) if (q[k + 'x'] != null) { p[k + 'x'] = q[k + 'x'] + dx; p[k + 'y'] = q[k + 'y'] + dy; }
  return p;
}
export function localToWorld(card, point) {
  const p = card.props || {}, x = point.x * card.w / (p.ow || card.w) - card.w / 2, y = point.y * card.h / (p.oh || card.h) - card.h / 2;
  const t = (card.rot || 0) * Math.PI / 180;
  return { x: card.x + card.w / 2 + x * Math.cos(t) - y * Math.sin(t), y: card.y + card.h / 2 + x * Math.sin(t) + y * Math.cos(t) };
}
export function worldToLocal(card, point) {
  const p = card.props || {}, x = point.x - card.x - card.w / 2, y = point.y - card.y - card.h / 2, t = -(card.rot || 0) * Math.PI / 180;
  return { x: (x * Math.cos(t) - y * Math.sin(t) + card.w / 2) * (p.ow || card.w) / card.w, y: (x * Math.sin(t) + y * Math.cos(t) + card.h / 2) * (p.oh || card.h) / card.h };
}
export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function inkHit(card, at, radius) {
  const points = (card.props?.points || []).map(q => localToWorld(card, { x: q[0], y: q[1] }));
  const r = radius + (card.props?.size || 9) / 2 * Math.max(card.w / (card.props?.ow || card.w), card.h / (card.props?.oh || card.h));
  return points.some((p, i) => i ? distanceToSegment(at, points[i - 1], p) <= r : Math.hypot(at.x - p.x, at.y - p.y) <= r);
}
export function pointOnSegment(a, b, t) {
  const u = 1 - t, ax = a.ox ?? a.x, ay = a.oy ?? a.y, bx = b.ix ?? b.x, by = b.iy ?? b.y;
  return { x: u ** 3 * a.x + 3 * u * u * t * ax + 3 * u * t * t * bx + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * ay + 3 * u * t * t * by + t ** 3 * b.y };
}
// Split the actual Bezier so inserting a point leaves its curve unchanged.
export function splitSegment(points, index, t) {
  const pts = structuredClone(points), a = pts[index], b = pts[(index + 1) % pts.length];
  const mix = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const c1 = { x: a.ox ?? a.x, y: a.oy ?? a.y }, c2 = { x: b.ix ?? b.x, y: b.iy ?? b.y };
  const ab = mix(a, c1), bc = mix(c1, c2), cd = mix(c2, b), abc = mix(ab, bc), bcd = mix(bc, cd), point = mix(abc, bcd);
  if (a.ox != null || b.ix != null) { a.ox = ab.x; a.oy = ab.y; b.ix = cd.x; b.iy = cd.y; Object.assign(point, { ix: abc.x, iy: abc.y, ox: bcd.x, oy: bcd.y }); }
  pts.splice(index + 1, 0, point);
  return pts;
}
