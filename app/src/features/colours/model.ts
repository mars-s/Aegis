// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import type { Board } from "@aegis/domain";
const NAMED = { 'Black': '#000000', 'Charcoal': '#36454f', 'Slate': '#708090', 'Grey': '#808080', 'Silver': '#c0c0c0', 'Cloud': '#ecebef', 'White': '#ffffff', 'Ivory': '#fffff0', 'Cream': '#fff5c8', 'Butter': '#f3d96a', 'Lemon': '#fff44f', 'Gold': '#ffd700', 'Mustard': '#e1ad01', 'Amber': '#ffbf00', 'Tangerine': '#f28500', 'Orange': '#ff8c00', 'Peach': '#ffcba4', 'Apricot': '#fbceb1', 'Coral': '#ff7f50', 'Salmon': '#fa8072', 'Tomato': '#ff6347', 'Red': '#e0303a', 'Cherry': '#c2185b', 'Crimson': '#dc143c', 'Brick': '#b22222', 'Maroon': '#800000', 'Wine': '#722f37', 'Rose': '#ff66a3', 'Bubblegum': '#ff9ec4', 'Blush': '#ffd1dc', 'Pink': '#ffc0cb', 'Hot Pink': '#ff69b4', 'Magenta': '#ff00ff', 'Fuchsia': '#c154c1', 'Orchid': '#da70d6', 'Lilac': '#c8a2c8', 'Lavender': '#e6e6fa', 'Periwinkle': '#ccccff', 'Violet': '#8f00ff', 'Purple': '#800080', 'Plum': '#8e4585', 'Grape': '#6f2da8', 'Indigo': '#4b0082', 'Navy': '#000080', 'Midnight': '#191970', 'Royal Blue': '#4169e1', 'Cobalt': '#0047ab', 'Blue': '#1e6fff', 'Steel Blue': '#4682b4', 'Cornflower': '#6495ed', 'Sky': '#87ceeb', 'Baby Blue': '#bfdfff', 'Ice': '#dcedff', 'Powder': '#b0e0e6', 'Teal': '#008080', 'Turquoise': '#40e0d0', 'Aqua': '#00e5e5', 'Mint': '#98ff98', 'Seafoam': '#9fe2bf', 'Sage': '#9caf88', 'Pistachio': '#93c572', 'Lime': '#a4de02', 'Green': '#2e9e4f', 'Emerald': '#50c878', 'Forest': '#228b22', 'Olive': '#808000', 'Khaki': '#c3b091', 'Sand': '#e2c290', 'Tan': '#d2b48c', 'Camel': '#c19a6b', 'Caramel': '#af6f09', 'Brown': '#8b4513', 'Chocolate': '#5c3317', 'Espresso': '#3b2219' };

export type RGB = readonly [number, number, number];
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
export function normHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let hex = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map(c => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(hex) ? '#' + hex.toLowerCase() : null;
}
export function colorName(hex: string): string {
  const [r, g, b] = rgb(hex); let best = 'Colour', distance = Infinity;
  for (const [name, value] of Object.entries(NAMED)) {
    const [r2, g2, b2] = rgb(value), mean = (r + r2) / 2;
    const next = (2 + mean / 256) * (r - r2) ** 2 + 4 * (g - g2) ** 2 + (2 + (255 - mean) / 256) * (b - b2) ** 2;
    if (next < distance) { distance = next; best = name; }
  }
  return best;
}
export function hsv2rgb(h: number, s: number, v: number): RGB {
  const f = (n: number) => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
  return [f(5), f(3), f(1)];
}
export const rgb2hex = (colour: readonly number[]): string => '#' + colour.map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
export function hex2hsv(hex: string) {
  const [red, green, blue] = rgb(hex), r = red / 255, g = green / 255, b = blue / 255;
  const max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
  const hue = !delta ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: (hue * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
}
export function paletteFromPixels(data: ArrayLike<number>): string[] {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (r === undefined || g === undefined || b === undefined || a === undefined || a < 128) continue;
    const key = [r >> 5, g >> 5, b >> 5].join(',');
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b; buckets.set(key, bucket);
  }
  const picks: RGB[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const next: RGB = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n];
    if (picks.length < 5 && picks.every(p => Math.hypot(p[0] - next[0], p[1] - next[1], p[2] - next[2]) > 48)) picks.push(next);
  }
  return picks.map(rgb2hex);
}
export function boardColours(board: Pick<Board, 'cards' | 'palette'>) {
  const rows = new Map<string, { hex: string; name: string }>();
  const add = (value: unknown, name?: string) => { const hex = normHex(value); if (hex && !rows.has(hex)) rows.set(hex, { hex, name: name || colorName(hex) }); };
  for (const row of board.palette ?? []) add(row.hex, row.name);
  for (const card of board.cards) if (card.type === 'swatch') add(card.props?.hex, card.props?.label);
  const counts = new Map<string, number>();
  const named = new Map(Object.entries({ gray: '#808080', blue: '#1e6fff', green: '#2e9e4f', yellow: '#fff44f', orange: '#ff8c00', red: '#e0303a', purple: '#800080' }));
  for (const card of board.cards) for (const value of [card.color, card.props?.color, card.props?.fill, card.props?.stroke]) {
    const hex = normHex(value) ?? (typeof value === 'string' ? named.get(value) : undefined);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  for (const [hex] of [...counts].sort((a, b) => b[1] - a[1])) add(hex);
  return [...rows.values()];
}
