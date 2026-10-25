// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
  const NAMED = { 'Black': '#000000', 'Charcoal': '#36454f', 'Slate': '#708090', 'Grey': '#808080', 'Silver': '#c0c0c0', 'Cloud': '#ecebef', 'White': '#ffffff', 'Ivory': '#fffff0', 'Cream': '#fff5c8', 'Butter': '#f3d96a', 'Lemon': '#fff44f', 'Gold': '#ffd700', 'Mustard': '#e1ad01', 'Amber': '#ffbf00', 'Tangerine': '#f28500', 'Orange': '#ff8c00', 'Peach': '#ffcba4', 'Apricot': '#fbceb1', 'Coral': '#ff7f50', 'Salmon': '#fa8072', 'Tomato': '#ff6347', 'Red': '#e0303a', 'Cherry': '#c2185b', 'Crimson': '#dc143c', 'Brick': '#b22222', 'Maroon': '#800000', 'Wine': '#722f37', 'Rose': '#ff66a3', 'Bubblegum': '#ff9ec4', 'Blush': '#ffd1dc', 'Pink': '#ffc0cb', 'Hot Pink': '#ff69b4', 'Magenta': '#ff00ff', 'Fuchsia': '#c154c1', 'Orchid': '#da70d6', 'Lilac': '#c8a2c8', 'Lavender': '#e6e6fa', 'Periwinkle': '#ccccff', 'Violet': '#8f00ff', 'Purple': '#800080', 'Plum': '#8e4585', 'Grape': '#6f2da8', 'Indigo': '#4b0082', 'Navy': '#000080', 'Midnight': '#191970', 'Royal Blue': '#4169e1', 'Cobalt': '#0047ab', 'Blue': '#1e6fff', 'Steel Blue': '#4682b4', 'Cornflower': '#6495ed', 'Sky': '#87ceeb', 'Baby Blue': '#bfdfff', 'Ice': '#dcedff', 'Powder': '#b0e0e6', 'Teal': '#008080', 'Turquoise': '#40e0d0', 'Aqua': '#00e5e5', 'Mint': '#98ff98', 'Seafoam': '#9fe2bf', 'Sage': '#9caf88', 'Pistachio': '#93c572', 'Lime': '#a4de02', 'Green': '#2e9e4f', 'Emerald': '#50c878', 'Forest': '#228b22', 'Olive': '#808000', 'Khaki': '#c3b091', 'Sand': '#e2c290', 'Tan': '#d2b48c', 'Camel': '#c19a6b', 'Caramel': '#af6f09', 'Brown': '#8b4513', 'Chocolate': '#5c3317', 'Espresso': '#3b2219' };
  export function colorName(hex) {
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), [r, g, b] = rgb(hex); let best = 'Colour', d = Infinity;
    for (const [n, h] of Object.entries(NAMED)) { const [r2, g2, b2] = rgb(h), rm = (r + r2) / 2, dd = (2 + rm / 256) * (r - r2) ** 2 + 4 * (g - g2) ** 2 + (2 + (255 - rm) / 256) * (b - b2) ** 2; if (dd < d) { d = dd; best = n; } }
    return best;
  }

export const normHex = v => {
  let h = String(v || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map(x => x + x).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : null;
};
export const hsv2rgb = (h, s, v) => {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)].map(x => Math.round(x * 255));
};
export const rgb2hex = rgb => '#' + rgb.map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
export const hex2hsv = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
};
export function paletteFromPixels(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = [data[i] >> 5, data[i + 1] >> 5, data[i + 2] >> 5].join(',');
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]; buckets.set(key, b);
  }
  const picks = [];
  for (const b of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const rgb = [b.r / b.n, b.g / b.n, b.b / b.n];
    if (picks.length < 5 && picks.every(p => Math.hypot(...p.map((v, i) => v - rgb[i])) > 48)) picks.push(rgb);
  }
  return picks.map(rgb2hex);
}
export function boardColours(board) {
  const rows = new Map();
  const add = (hex, name) => { hex = normHex(hex); if (hex && !rows.has(hex)) rows.set(hex, { hex, name: name || colorName(hex) }); };
  for (const p of board.palette || []) add(p.hex, p.name);
  for (const c of board.cards) if (c.type === 'swatch') add(c.props?.hex, c.props?.label);
  const counts = new Map();
  const named = { gray: '#808080', blue: '#1e6fff', green: '#2e9e4f', yellow: '#fff44f', orange: '#ff8c00', red: '#e0303a', purple: '#800080' };
  for (const c of board.cards) for (const v of [c.color, c.props?.color, c.props?.fill, c.props?.stroke]) {
    const hex = normHex(v) || named[v]; if (hex) counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  for (const [hex] of [...counts].sort((a, b) => b[1] - a[1])) add(hex);
  return [...rows.values()];
}
