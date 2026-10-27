// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { z } from 'zod/v4';
export const VectorPointSchema = z.object({ x: z.number(), y: z.number(), ix: z.number().optional(), iy: z.number().optional(), ox: z.number().optional(), oy: z.number().optional(), r: z.number().optional() });
export type VectorPoint = z.output<typeof VectorPointSchema>;
export const InkPointSchema = z.tuple([z.number(), z.number(), z.number()]);
export type InkPoint = z.output<typeof InkPointSchema>;
const outline = { sw: z.number().optional().catch(undefined), stroke: z.string().catch('ink'), fill: z.string().catch(''), sdash: z.enum(['solid', 'dash', 'dot', 'none']).optional().catch(undefined), dash: z.boolean().catch(false), dl: z.number().catch(8), dg: z.number().catch(6), radius: z.number().catch(0) };
export const DrawingProps = z.object({ ...outline, ow: z.number().positive().optional().catch(undefined), oh: z.number().positive().optional().catch(undefined), closed: z.boolean().catch(false), points: z.array(VectorPointSchema).catch([]), shape: z.enum(['rect', 'circle', 'tri', 'diamond', 'star', 'heart', 'arrow', 'hexagon', 'line']).catch('rect'), lineHeight: z.number().optional().catch(undefined), lw: z.number().optional().catch(undefined), squig: z.enum(['straight', 'wavy', 'zigzag', 'loopy']).catch('straight'), waves: z.number().catch(6), round: z.number().catch(60), wobble: z.number().catch(0) });
export const InkProps = z.object({ ow: z.number().positive().optional().catch(undefined), oh: z.number().positive().optional().catch(undefined), points: z.array(InkPointSchema).catch([]), pen: z.enum(['pen', 'marker', 'hi']).catch('pen'), size: z.number().positive().catch(9), ink: z.string().catch('ink') });
export const StampProps = z.object({ emoji: z.string().catch('⭐'), mv: z.string().catch('') });
export const SHAPES = { rect: 'Rectangle', circle: 'Ellipse', tri: 'Triangle', diamond: 'Diamond', star: 'Star', heart: 'Heart', arrow: 'Arrow', hexagon: 'Hexagon', line: 'Line' };
const inks = new Map(Object.entries({ ink: 'var(--text)', pink: '#f27aa8', coral: '#ff7f6b', butter: '#f3c84a', mint: '#3fbf86', sky: '#4aa3f0', lilac: '#9b7bff', white: '#ffffff' }));
export const colour = (value: string, fallback = 'var(--text)'): string => inks.get(value) ?? (/^#[0-9a-f]{6}$/i.test(value) || value === 'none' ? value : fallback);
export function outlineAttributes(props: z.output<typeof DrawingProps>, fallback = 2.5) {
  const style = props.sdash ?? (props.dash ? 'dash' : 'solid'), width = style === 'none' ? 0 : props.sw ?? fallback;
  return { stroke: colour(props.stroke), strokeWidth: width, strokeDasharray: style === 'dash' ? `${props.dl} ${props.dg}` : style === 'dot' ? `0 ${props.dg + width * 2}` : undefined, strokeLinecap: style === 'dot' ? 'round' : 'butt' } as const;
}
export function pathD(points: readonly VectorPoint[], closed: boolean, radius = 0, scale = 1): string {
  const first = points[0]; if (!first) return '';
  const at = (index: number): VectorPoint => points[(index + points.length) % points.length] ?? first;
  const f = (value: number) => +value.toFixed(2);
  const nodes = points.map((point, i) => {
    const r = (point.r ?? radius) * scale, previous = at(i - 1), next = at(i + 1);
    if (!(r > 0) || !(closed || i > 0) || !(closed || i < points.length - 1) || point.ix != null || point.ox != null || previous.ox != null || next.ix != null) return { p: point, s: point, e: point, round: false };
    const la = Math.hypot(point.x - previous.x, point.y - previous.y) || 1, lb = Math.hypot(next.x - point.x, next.y - point.y) || 1, k = Math.min(r, la / 2, lb / 2);
    return { p: point, round: true, s: { x: point.x + (previous.x - point.x) * k / la, y: point.y + (previous.y - point.y) * k / la }, e: { x: point.x + (next.x - point.x) * k / lb, y: point.y + (next.y - point.y) * k / lb } };
  });
  const start = nodes[0]; if (!start) return '';
  const segment = (a: typeof start, b: typeof start) => a.p.ox == null && b.p.ix == null ? ` L${f(b.s.x)} ${f(b.s.y)}` : ` C${f(a.p.ox ?? a.p.x)} ${f(a.p.oy ?? a.p.y)} ${f(b.p.ix ?? b.p.x)} ${f(b.p.iy ?? b.p.y)} ${f(b.p.x)} ${f(b.p.y)}`;
  const corner = (b: typeof start) => b.round ? ` Q${f(b.p.x)} ${f(b.p.y)} ${f(b.e.x)} ${f(b.e.y)}` : '';
  let result = `M${f(start.e.x)} ${f(start.e.y)}`, previous = start;
  for (const next of nodes.slice(1)) { result += segment(previous, next) + corner(next); previous = next; }
  if (closed && nodes.length > 2) result += segment(previous, start) + corner(start) + ' Z';
  return result;
}
export function centerline(points: readonly InkPoint[]): string {
  const first = points[0], last = points.at(-1); if (!first || !last) return '';
  if (points.length < 3) return `M${first[0]} ${first[1]} L${last[0] + .1} ${last[1]}`;
  let path = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) { const p = points[i], q = points[i + 1]; if (p && q) path += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)} ${((p[1] + q[1]) / 2).toFixed(1)}`; }
  return path + ` L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}
export function butter(raw: readonly InkPoint[], finished: boolean, base: number): string {
  const points: { x: number; y: number; v?: number }[] = []; let acc = 0;
  let previousRaw: InkPoint | undefined;
  for (const b of raw) {
    const a = previousRaw; previousRaw = b;
    if (!a) { points.push({ x: b[0], y: b[1] }); continue; }
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), dt = Math.max(1, b[2] - a[2]);
    let distance = acc; while (distance < length) { const k = distance / length; points.push({ x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, v: length / dt }); distance += 3; }
    acc = distance - length;
  }
  const first = points[0]; if (!first || points.length < 2) return '';
  const end = points.at(-1);
  if (finished && points.length > 6 && end && Math.hypot(first.x - end.x, first.y - end.y) < 14) points.splice(-2, 2);
  let speed = points[1]?.v || .3, total = 0;
  const lengths: number[] = [0]; let last = first;
  for (const point of points.slice(1)) { total += Math.hypot(point.x - last.x, point.y - last.y); lengths.push(total); last = point; }
  const min = Math.max(1, base / 9), ramp = Math.min(54, base * 6), left: [number, number][] = [], right: [number, number][] = [];
  for (const [i, point] of points.entries()) {
    const before = points[Math.max(0, i - 1)] ?? first, after = points[Math.min(points.length - 1, i + 1)] ?? last;
    let nx = -(after.y - before.y), ny = after.x - before.x; const normal = Math.hypot(nx, ny) || 1; nx /= normal; ny /= normal;
    speed += ((point.v ?? speed) - speed) * .08;
    const slow = Math.max(0, Math.min(1, 1 - speed / 1.8)), length = lengths[i] ?? 0;
    const width = ((min + (base - min) * (.22 + .78 * slow * slow)) * Math.pow(Math.min(1, length / ramp), .8) * Math.pow(finished ? Math.min(1, (total - length) / ramp) : 1, .8) * (1 + .12 * Math.sin(length / 11)) + .4) / 2;
    left.push([point.x + nx * width, point.y + ny * width]); right.push([point.x - nx * width, point.y - ny * width]);
  }
  const sequence = left.concat(right.reverse()), start = sequence[0]; if (!start) return '';
  let path = `M${start[0].toFixed(1)} ${start[1].toFixed(1)}`, before = start;
  for (const current of sequence.slice(1)) { path += ` Q${before[0].toFixed(1)} ${before[1].toFixed(1)} ${((before[0] + current[0]) / 2).toFixed(1)} ${((before[1] + current[1]) / 2).toFixed(1)}`; before = current; }
  return path + ' Z';
}
const outlines: Readonly<Partial<Record<keyof typeof SHAPES, readonly (readonly [number, number])[]>>> = { rect: [[0, 0], [100, 0], [100, 100], [0, 100]], tri: [[50, 2], [98, 98], [2, 98]], diamond: [[50, 0], [100, 50], [50, 100], [0, 50]], star: [[50, 3], [62, 36], [97, 37], [69, 58], [79, 93], [50, 72], [21, 93], [31, 58], [3, 37], [38, 36]], arrow: [[0, 30], [60, 30], [60, 0], [100, 50], [60, 100], [60, 70], [0, 70]], hexagon: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]] };
export function shapePoints(shape: keyof typeof SHAPES, width = 100, height = 100): VectorPoint[] {
  if (shape === 'circle') {
    const k = .5523;
    const circle: readonly (readonly [number, number, number, number, number, number])[] = [[50, 0, 50 - 50 * k, 0, 50 + 50 * k, 0], [100, 50, 100, 50 - 50 * k, 100, 50 + 50 * k], [50, 100, 50 + 50 * k, 100, 50 - 50 * k, 100], [0, 50, 0, 50 + 50 * k, 0, 50 - 50 * k]];
    return circle.map(([x, y, ix, iy, ox, oy]) => ({ x: x * width / 100, y: y * height / 100, ix: ix * width / 100, iy: iy * height / 100, ox: ox * width / 100, oy: oy * height / 100 }));
  }
  return (outlines[shape] ?? outlines.rect ?? []).map(([x, y]) => ({ x: x * width / 100, y: y * height / 100 }));
}
export function squigPath(props: Pick<z.output<typeof DrawingProps>, 'waves' | 'round' | 'wobble' | 'squig'> & { id: string }): string {
  const n = Math.max(.5, props.waves), round = props.round / 100, wobble = props.wobble / 100;
  let seed = [...props.id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const p1 = random() * 6.28, p2 = random() * 6.28, p3 = random() * 6.28;
  const amplitude = (u: number) => 1 + wobble * .55 * (Math.sin(6.28 * .37 * u + p1) * .6 + Math.sin(6.28 * .83 * u + p2) * .4);
  const drift = (u: number) => wobble * 46 * .22 * Math.sin(6.28 * .21 * u + p3), points: string[] = [], count = Math.ceil(4 * n) * 14;
  for (let i = 0; i <= count; i++) { const t = i / count, u = n * t, theta = 6.28318 * u, sine = Math.sin(theta), triangle = 2 / Math.PI * Math.asin(sine); const x = props.squig === 'loopy' ? (theta - (1 + round * 1.8) * sine) / (6.28318 * n) * 100 : t * 100; const y = props.squig === 'loopy' ? 50 - 46 * .8 * Math.cos(theta) * amplitude(u) + drift(u) : 50 - 46 * (triangle * (1 - round) + sine * round) * amplitude(u) + drift(u); points.push(x.toFixed(2) + ' ' + y.toFixed(2)); }
  return 'M' + points.join(' L');
}
