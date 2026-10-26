// Custom UI wears the app's palette. Generated CSS often hardcodes colours from another world (a pale panel, a
// green accent, white text), which turns unreadable on the board. Every literal colour is rewritten onto a theme
// token by its role in the declaration, so contrast follows the app in dark and light. Self-contained: the host
// imports this file, and it ships in the app bundle beside html-sandbox.js.

const NAMED = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', gray: '#808080', grey: '#808080', silver: '#c0c0c0', navy: '#000080', teal: '#008080', lime: '#00ff00', aqua: '#00ffff', cyan: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', maroon: '#800000', olive: '#808000', crimson: '#dc143c', tomato: '#ff6347', gold: '#ffd700', indigo: '#4b0082', violet: '#ee82ee', coral: '#ff7f50', salmon: '#fa8072', khaki: '#f0e68c', beige: '#f5f5dc', ivory: '#fffff0', whitesmoke: '#f5f5f5', gainsboro: '#dcdcdc', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', darkgrey: '#a9a9a9', dimgray: '#696969', dimgrey: '#696969', slategray: '#708090', slategrey: '#708090', seagreen: '#2e8b57', forestgreen: '#228b22', royalblue: '#4169e1', steelblue: '#4682b4', dodgerblue: '#1e90ff', skyblue: '#87ceeb', tan: '#d2b48c', brown: '#a52a2a', chocolate: '#d2691e', firebrick: '#b22222', darkred: '#8b0000', darkgreen: '#006400', darkblue: '#00008b', mintcream: '#f5fffa', honeydew: '#f0fff0', aliceblue: '#f0f8ff', ghostwhite: '#f8f8ff', snow: '#fffafa', linen: '#faf0e6', seashell: '#fff5ee' };
const COLOUR_SOURCE = `#[0-9a-f]{3,8}\\b|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\\([^()]*\\)|\\b(?:${Object.keys(NAMED).join('|')})\\b`;
const COLOUR = new RegExp(COLOUR_SOURCE, 'gi'), HAS_COLOUR = new RegExp(COLOUR_SOURCE, 'i');
// Deep, dark tints (a navy ink, a forest heading) are primary text, not accents.
const vivid = d => d.sat > 0.28 && d.light > 0.22 && d.light < 0.8;

function parse(literal) {
  const s = literal.toLowerCase();
  if (NAMED[s]) return parse(NAMED[s]);
  if (s[0] === '#') {
    const h = s.slice(1), full = h.length <= 4 ? [...h].map(c => c + c).join('') : h;
    if (![6, 8].includes(full.length)) return null;
    const n = i => parseInt(full.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) : 1 };
  }
  const parts = s.slice(s.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean);
  const num = (v, scale) => v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / scale;
  const alpha = parts[3] === undefined ? 1 : num(parts[3], 1);
  if (s.startsWith('rgb')) return { r: num(parts[0], 255), g: num(parts[1], 255), b: num(parts[2], 255), a: alpha };
  if (s.startsWith('hsl')) {
    const hue = parseFloat(parts[0]) / 360, sat = num(parts[1], 100), light = num(parts[2], 100);
    const k = n => (n + hue * 12) % 12, a = sat * Math.min(light, 1 - light);
    const f = n => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return { r: f(0), g: f(8), b: f(4), a: alpha };
  }
  // lab, lch and friends: lightness only, treated as a neutral.
  const l = num(parts[0], s.startsWith('ok') ? 1 : 100);
  const chroma = s.includes('lch') ? num(parts[1] ?? '0', s.startsWith('ok') ? 0.4 : 150) : 0;
  return { r: l, g: l, b: l, a: alpha, chroma };
}

function describe(c) {
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b), light = (max + min) / 2, d = max - min;
  const sat = c.chroma ?? (d === 0 ? 0 : d / (1 - Math.abs(2 * light - 1)));
  let hue = 0;
  if (d) hue = max === c.r ? ((c.g - c.b) / d + 6) % 6 : max === c.g ? (c.b - c.r) / d + 2 : (c.r - c.g) / d + 4;
  return { light, sat, hue: hue * 60, a: c.a };
}

// One accent world: red reads as danger, warm yellow as a warning, everything else saturated is the data blue.
const accent = ({ hue }) => hue < 18 || hue >= 335 ? 'var(--danger)' : hue >= 35 && hue < 62 ? 'var(--warn)' : 'var(--data)';

function token(role, literal, context) {
  const c = parse(literal); if (!c) return literal;
  const d = describe(c), bright = vivid(d);
  if (d.a === 0) return 'transparent';
  if (role === 'background') {
    // The window supplies the surface. A page-level fill would fight it.
    if (context.root && !context.custom) return 'transparent';
    // A tinted chip sets its own text colour, so it takes the soft accent; a bare fill (a bar, a meter) is solid.
    if (bright) return context.text ? (accent(d) === 'var(--data)' ? 'var(--data-soft)' : `color-mix(in srgb, ${accent(d)} 18%, transparent)`) : accent(d);
    return d.a < 0.2 ? 'var(--hover)' : 'var(--inset)';
  }
  if (role === 'text') {
    if (bright) return accent(d);
    if (d.a < 0.55) return 'var(--faint)';
    if (d.a < 0.8) return 'var(--muted)';
    // Mid greys are secondary copy; near-black and near-white are primary copy in either theme.
    return d.light > 0.25 && d.light < 0.75 ? 'var(--muted)' : 'var(--text)';
  }
  if (role === 'border') return bright ? accent(d) : d.a < 0.35 ? 'var(--line)' : 'var(--line-strong)';
  if (role === 'shadow') return 'rgb(0 0 0 / .35)';
  // SVG paint and unknown custom properties: accents stay accents, light neutrals read as ink, dark ones as fills.
  return bright ? accent(d) : d.light >= 0.5 ? 'var(--ink-2)' : 'var(--inset)';
}

function roleOf(property) {
  const p = property.toLowerCase();
  if (p.startsWith('--')) {
    if (/bg|background|surface|panel|card|base|fill/.test(p)) return 'background';
    if (/text|ink|fg|foreground|muted|label|copy/.test(p)) return 'text';
    if (/border|line|rule|divider|stroke/.test(p)) return 'border';
    return 'custom';
  }
  if (/^background|^fill$/.test(p)) return 'background';
  if (/^(color|caret-color|-webkit-text-fill-color|text-decoration-color)$/.test(p)) return 'text';
  if (/^(border|outline|column-rule)|^stroke$|^text-emphasis-color$/.test(p)) return 'border';
  if (/shadow$/.test(p)) return 'shadow';
  if (p === 'accent-color') return 'accent';
  return null;
}

function rewriteDeclarations(body, context) {
  const declarations = [...body.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)];
  // Does this rule set its own text colour? Then a vivid background is a chip, not a bar fill.
  const text = declarations.some(([, p, v]) => roleOf(p) === 'text' && HAS_COLOUR.test(v));
  return body.replace(/([\w-]+)(\s*:\s*)([^;{}]+)/g, (all, property, colon, value) => {
    const role = roleOf(property); if (!role) return all;
    if (role === 'accent') return `${property}${colon}var(--data)`;
    return `${property}${colon}${value.replace(COLOUR, literal => token(role, literal, { ...context, text, custom: property.startsWith('--') }))}`;
  });
}

export function themeCss(css) {
  if (/\/\*\s*aegis:\s*own-colou?rs\s*\*\//i.test(css)) return css;
  // Walk rule bodies, keeping selectors (and nested at-rules) intact.
  return css.replace(/([^{}]*)\{([^{}]*)\}/g, (all, selector, body) => {
    const root = /(^|,)\s*(html|body|:root)\s*(?=,|$)/i.test(selector.trim());
    return `${selector}{${rewriteDeclarations(body, { root })}}`;
  });
}

// Inline styles get the same treatment. SVG paint attributes cannot hold var(), so they move into style.
const PAINT = /\s(fill|stroke|stop-color)\s*=\s*(["'])\s*([^"']*?)\s*\2/gi;
export function themeHtml(html, css = '') {
  if (/\/\*\s*aegis:\s*own-colou?rs\s*\*\//i.test(css)) return html;
  return html.replace(/<([a-z][\w:-]*)(\s[^<>]*?)?(\/?)>/gi, (tag, name, attributes = '', close) => {
    let moved = '';
    let rest = attributes.replace(PAINT, (all, attribute, quote, value) => {
      if (!HAS_COLOUR.test(value)) return all;
      moved += `${attribute.toLowerCase()}:${value.replace(COLOUR, literal => token('paint', literal, { root: false }))};`;
      return '';
    });
    let styled = false;
    rest = rest.replace(/\sstyle\s*=\s*(["'])(.*?)\1/is, (all, quote, style) => {
      styled = true;
      const inner = rewriteDeclarations(style, { root: false }) + (moved ? (style.trim().endsWith(';') || !style.trim() ? '' : ';') + moved : '');
      return ` style=${quote}${inner.replace(new RegExp(quote, 'g'), quote === '"' ? "'" : '"')}${quote}`;
    });
    if (moved && !styled) rest += ` style="${moved}"`;
    return `<${name}${rest}${close}>`;
  });
}
