// From Zephium (zephium-browser/Zephium @ 0eaad6d, frame/src/shared/ui/data/Chart/geometry.ts), MPL-2.0.
// Changes for Aegis: local imports. See https://mozilla.org/MPL/2.0/
/** The few pieces of plotting math the kit needs, in plain numbers. */

export type Linear = ((value: number) => number) & { invert: (pixel: number) => number };

/** Maps a domain onto a pixel range in a straight line; a flat domain lands mid-range. */
export function linear(
  domain: readonly [number, number],
  range: readonly [number, number],
): Linear {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = (value: number) =>
    span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0);
  scale.invert = (pixel: number) =>
    r1 === r0 ? d0 : d0 + ((pixel - r0) / (r1 - r0)) * (span || 1);
  return scale;
}

export type Band = { start: (index: number) => number; width: number; step: number };

/** Equal bands with gaps between them and half-gaps at the ends, centred in the range. */
export function band(
  count: number,
  range: readonly [number, number],
  inner = 0.28,
  outer = 0.1,
): Band {
  const [r0, r1] = range;
  const length = r1 - r0;
  const n = Math.max(1, count);
  const step = length / Math.max(1, n - inner + outer * 2);
  const first = r0 + (length - step * (n - inner)) / 2;
  return { start: (index) => first + step * index, width: step * (1 - inner), step };
}

export type Point = { x: number; y: number };

function sign(value: number) {
  return value < 0 ? -1 : 1;
}

/** The tangent at an inner point that keeps the curve from overshooting its neighbours. */
function innerSlope(a: Point, b: Point, c: Point): number {
  const h0 = b.x - a.x;
  const h1 = c.x - b.x;
  const s0 = (b.y - a.y) / (h0 || (h1 < 0 ? -0 : 0));
  const s1 = (c.y - b.y) / (h1 || (h0 < 0 ? -0 : 0));
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

function endSlope(a: Point, b: Point, tangent: number): number {
  const h = b.x - a.x;
  return h ? ((3 * (b.y - a.y)) / h - tangent) / 2 : tangent;
}

/**
 * A smooth curve through points ordered along x that never overshoots a
 * value (monotone cubic, Fritsch–Carlson), as path commands after its first M.
 */
export function monotone(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return "";
  const start = `M${round(first.x)},${round(first.y)}`;
  const second = points[1];
  if (!second) return start;
  if (points.length === 2) return `${start}L${round(second.x)},${round(second.y)}`;
  const tangents = points.map((point, index) => {
    const before = points[index - 1];
    const after = points[index + 1];
    return before && after ? innerSlope(before, point, after) : 0;
  });
  tangents[0] = endSlope(first, second, tangents[1] ?? 0);
  const last = points.at(-1);
  const penultimate = points.at(-2);
  if (last && penultimate) tangents[points.length - 1] = endSlope(penultimate, last, tangents[points.length - 2] ?? 0);
  let path = start;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    if (!a || !b) continue;
    const third = (b.x - a.x) / 3;
    path += `C${round(a.x + third)},${round(a.y + third * (tangents[index - 1] ?? 0))},${round(b.x - third)},${round(b.y - third * (tangents[index] ?? 0))},${round(b.x)},${round(b.y)}`;
  }
  return path;
}

/** Straight by default; smoothing is an explicit saved choice. */
export function linePath(points: readonly Point[], smooth = false): string {
  return smooth ? monotone(points) : points.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)},${round(p.y)}`).join('');
}

/** Runs of consecutive defined points: a null is a gap the line does not cross. */
export function runs<T>(items: readonly (T | null)[]): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  for (const item of items) {
    if (item === null) {
      if (current.length) out.push(current);
      current = [];
    } else current.push(item);
  }
  if (current.length) out.push(current);
  return out;
}

/** The filled region between a curve and its floor (a line, or the curve beneath a stack). */
export function areaPath(top: readonly Point[], floor: readonly Point[], smooth = false): string {
  if (!top.length) return "";
  const upper = linePath(top, smooth);
  const lower = linePath([...floor].reverse(), smooth).replace(/^M/u, "L");
  return `${upper}${lower}Z`;
}

export type Corners = "end" | "all" | "none";
export type Direction = "up" | "down" | "right" | "left";

/**
 * A bar from its baseline toward its value. `end` rounds the data end only,
 * `all` both ends (a range), `none` neither (an inner segment of a stack).
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  corners: Corners,
  direction: Direction,
): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (!w || !h) return "";
  const r = corners === "none" ? 0 : Math.max(0, Math.min(radius, w / 2, h / 2));
  // Corners clockwise from the top left: which of them are rounded.
  const lit: [number, number, number, number] =
    corners === "all"
      ? [r, r, r, r]
      : corners === "none"
        ? [0, 0, 0, 0]
        : direction === "up"
          ? [r, r, 0, 0]
          : direction === "down"
            ? [0, 0, r, r]
            : direction === "right"
              ? [0, r, r, 0]
              : [r, 0, 0, r];
  const [tl, tr, br, bl] = lit;
  const right = x + w;
  const bottom = y + h;
  return (
    `M${round(x + tl)},${round(y)}` +
    `H${round(right - tr)}` +
    (tr ? `A${tr},${tr} 0 0 1 ${round(right)},${round(y + tr)}` : "") +
    `V${round(bottom - br)}` +
    (br ? `A${br},${br} 0 0 1 ${round(right - br)},${round(bottom)}` : "") +
    `H${round(x + bl)}` +
    (bl ? `A${bl},${bl} 0 0 1 ${round(x)},${round(bottom - bl)}` : "") +
    `V${round(y + tl)}` +
    (tl ? `A${tl},${tl} 0 0 1 ${round(x + tl)},${round(y)}` : "") +
    "Z"
  );
}

/** A point on a circle, angles clockwise from twelve o'clock. */
export function polar(cx: number, cy: number, radius: number, angle: number): Point {
  return { x: cx + Math.sin(angle) * radius, y: cy - Math.cos(angle) * radius };
}

/** An open arc along a circle, clockwise from one angle to another. */
export function arcPath(cx: number, cy: number, radius: number, from: number, to: number): string {
  const sweep = Math.min(to - from, Math.PI * 2 - 1e-4);
  const a = polar(cx, cy, radius, from);
  const b = polar(cx, cy, radius, from + sweep);
  return `M${round(a.x)},${round(a.y)}A${round(radius)},${round(radius)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${round(b.x)},${round(b.y)}`;
}

/**
 * A ring segment between two radii and two angles, drawn already inset by
 * `corner` on every side: stroked at twice that width with round joins, it
 * reads at its full size with softened corners.
 */
export function sectorPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  from: number,
  to: number,
  corner: number,
): string {
  const rIn = inner + corner;
  const rOut = Math.max(rIn, outer - corner);
  const inset = Math.min((to - from) / 2, corner / Math.max(1, rIn));
  const a0 = from + inset;
  const a1 = Math.max(a0, to - inset);
  const sweep = Math.min(a1 - a0, Math.PI * 2 - 1e-4);
  const large = sweep > Math.PI ? 1 : 0;
  const p0 = polar(cx, cy, rOut, a0);
  const p1 = polar(cx, cy, rOut, a0 + sweep);
  const p2 = polar(cx, cy, rIn, a0 + sweep);
  const p3 = polar(cx, cy, rIn, a0);
  return (
    `M${round(p0.x)},${round(p0.y)}` +
    `A${round(rOut)},${round(rOut)} 0 ${large} 1 ${round(p1.x)},${round(p1.y)}` +
    `L${round(p2.x)},${round(p2.y)}` +
    `A${round(rIn)},${round(rIn)} 0 ${large} 0 ${round(p3.x)},${round(p3.y)}Z`
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
