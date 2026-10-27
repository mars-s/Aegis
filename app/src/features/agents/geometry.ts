import type { Card } from '@aegis/domain/schema';
import type { Point } from '@aegis/scene';
export type WindowRect = Pick<Card, 'x' | 'y' | 'w' | 'h'>;

export const WINDOW_WIDTH = 340;
export const COLLAPSED_HEIGHT = 44;
const GAP = 24;
export const intersects = (a: WindowRect, b: WindowRect): boolean => a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x && a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y;
export function cardRect(card: Card): WindowRect {
  const radians = (card.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(radians)), s = Math.abs(Math.sin(radians));
  const w = card.w * c + card.h * s, h = card.w * s + card.h * c;
  return { x: card.x + (card.w - w) / 2, y: card.y + (card.h - h) / 2, w, h };
}
export function freeAgentRect(cards: readonly WindowRect[], neighbours: readonly WindowRect[], anchor: Point, height: number, preferred: Point | null, viewport: WindowRect, width = WINDOW_WIDTH): Point {
  const occupied = [...cards, ...neighbours], size = { w: width, h: height };
  const free = (p: Point): boolean => !occupied.some(card => intersects({ ...p, ...size }, card));
  const left = viewport.x, top = viewport.y, right = left + (viewport.w - width), bottom = top + (viewport.h - height);
  const inside = (p: Point): boolean => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (preferred && inside(preferred) && free(preferred)) return preferred;
  const start = { x: Math.max(left, Math.min(right, anchor.x)), y: Math.max(top, Math.min(bottom, anchor.y)) };
  const step = Math.max(24, viewport.w / 80, viewport.h / 80);
  const xs = new Set([left, right, start.x]), ys = new Set([top, bottom, start.y]);
  for (let x = left; x <= right; x += step) xs.add(x);
  for (let y = top; y <= bottom; y += step) ys.add(y);
  const candidates = [...xs].flatMap(x => [...ys].map(y => ({ x, y })));
  for (const card of occupied) for (const x of [card.x - width - GAP, card.x + card.w + GAP]) for (const y of [start.y, card.y - height - GAP, card.y + card.h + GAP]) candidates.push({ x, y });
  const nearest = (a: Point, b: Point): number => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y);
  candidates.sort(nearest);
  const found = candidates.find(p => inside(p) && free(p));
  if (found) return found;
  for (let ring = 1; ring <= 80; ring++) {
    const d = ring * 24, x0 = left - d, x1 = Math.max(left, right) + d, y0 = top - d, y1 = Math.max(top, bottom) + d;
    const edge: Point[] = [];
    for (let x = x0; x <= x1; x += step) edge.push({ x, y: y0 }, { x, y: y1 });
    for (let y = y0; y <= y1; y += step) edge.push({ x: x0, y }, { x: x1, y });
    edge.push({ x: start.x, y: y0 }, { x: start.x, y: y1 }, { x: x0, y: start.y }, { x: x1, y: start.y });
    edge.sort(nearest);
    const position = edge.find(free);
    if (position) return position;
  }
  return { x: occupied.reduce((end, card) => Math.max(end, card.x + card.w), start.x) + GAP, y: start.y };
}
export type EdgeSide = 'left' | 'right' | 'top' | 'bottom';
export interface EdgeEntry { readonly id: string; readonly created: number; readonly dx: number; readonly dy: number }
export interface EdgeGroup { readonly side: EdgeSide; readonly crowded: boolean; readonly x: number; readonly y: number; readonly entries: readonly { readonly id: string; readonly x: number; readonly y: number; readonly direction: number }[] }
export function edgeLayout(entries: readonly EdgeEntry[], width: number, height: number): readonly EdgeGroup[] {
  const sides: Record<EdgeSide, { entry: EdgeEntry; along: number }[]> = { left: [], right: [], top: [], bottom: [] };
  const halfX = Math.max(1, width / 2 - 32), halfY = Math.max(1, height / 2 - 76);
  for (const entry of entries) {
    const kx = halfX / Math.max(1, Math.abs(entry.dx)), ky = halfY / Math.max(1, Math.abs(entry.dy));
    const vertical = kx <= ky, k = Math.min(kx, ky);
    const side = vertical ? entry.dx < 0 ? 'left' : 'right' : entry.dy < 0 ? 'top' : 'bottom';
    sides[side].push({ entry, along: vertical ? height / 2 + entry.dy * k : width / 2 + entry.dx * k });
  }
  return (['left', 'right', 'top', 'bottom'] as const).map(side => {
    const group = sides[side], vertical = side === 'left' || side === 'right', length = vertical ? height : width;
    const low = Math.min(vertical ? 124 : 80, length / 2), high = length - low;
    const fixed = side === 'left' ? 32 : side === 'right' ? width - 32 : side === 'top' ? 76 : height - 76;
    group.sort((a, b) => a.along - b.along || a.entry.created - b.entry.created || a.entry.id.localeCompare(b.entry.id));
    const crowded = group.length > Math.min(4, Math.floor((high - low) / 48) + 1);
    const clamp = (value: number): number => Math.max(low, Math.min(high, value));
    const positions = group.map(item => clamp(item.along));
    for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i] ?? low, (positions[i - 1] ?? low) + 48);
    if ((positions.at(-1) ?? low) > high) {
      positions[positions.length - 1] = high;
      for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.min(positions[i] ?? low, (positions[i + 1] ?? high) - 48);
    }
    const centre = clamp(group[Math.floor(group.length / 2)]?.along ?? length / 2);
    return { side, crowded, x: vertical ? fixed - 22 : centre - 22, y: vertical ? centre - 22 : fixed - 22,
      entries: group.map((item, i) => ({ id: item.entry.id, x: (vertical ? fixed : positions[i] ?? low) - 22, y: (vertical ? positions[i] ?? low : fixed) - 22, direction: Math.atan2(item.entry.dy, item.entry.dx) })) };
  });
}
