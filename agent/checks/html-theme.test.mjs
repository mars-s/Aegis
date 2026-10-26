import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeCss, themeHtml } from '../../app/src/objects/kinds/html-theme.js';
import { sandboxDocument } from '../../app/src/objects/kinds/html-sandbox.js';

// The widget from the owner's screenshot: a pale green page with white text on it and a green accent.
const capacity = `:root{--accent:#2f8f6a;--panel:#f4f6f2}body{background:#f4f6f2;color:#fff}.eyebrow{color:rgba(255,255,255,.35);letter-spacing:.2em}
h2{color:#fff}.tab{background:transparent;color:#cfe;border:1px solid #8fb5a3}.tab.on{background:#25604c;color:white;border-color:#25604c}
input[type=range]{accent-color:#58c9a0}.meter{background:#333}.meter i{background:#30d158}`;

test('literal colours become theme tokens by role, so a foreign palette cannot appear', () => {
  const out = themeCss(capacity);
  assert.doesNotMatch(out, /#[0-9a-f]{3,8}\b|rgba?\(|\bwhite\b/i, out);
  assert.match(out, /body\{background:transparent;color:var\(--text\)/, 'the page takes the window surface and primary text');
  assert.match(out, /\.eyebrow\{color:var\(--faint\)/, 'translucent text is tertiary');
  assert.match(out, /\.tab\.on\{background:var\(--data-soft\);color:var\(--text\);border-color:var\(--data\)/, 'a tinted chip with its own text gets the soft accent');
  assert.match(out, /\.meter i\{background:var\(--data\)/, 'a bare fill is the solid accent');
  assert.match(out, /accent-color:var\(--data\)/);
  assert.match(out, /--accent:var\(--data\)/); assert.match(out, /--panel:var\(--inset\)/);
});

test('red and amber keep their meaning; greys keep their rank; selectors and at-rules are untouched', () => {
  const out = themeCss('@media (max-width:400px){.err{color:#d33}.warn{border:1px solid #e5a93b}}p{color:#777}h1{color:#111}a:hover>b{color:#000}');
  assert.match(out, /@media \(max-width:400px\)\{\.err\{color:var\(--danger\)\}\.warn\{border:1px solid var\(--warn\)\}\}/);
  assert.match(out, /p\{color:var\(--muted\)\}h1\{color:var\(--text\)\}a:hover>b\{color:var\(--text\)\}/);
});

test('inline styles and SVG paint move onto theme tokens; an explicit opt-out keeps authored colours', () => {
  const html = themeHtml('<svg><rect fill="#30d158" width="4"/><path stroke=\'#ccc\' fill="none"/></svg><p style="color:#999">x</p>');
  assert.match(html, /<rect width="4" style="fill:var\(--data\);"\/>/);
  assert.match(html, /<path fill="none" style="stroke:var\(--ink-2\);"\/>/);
  assert.match(html, /<p style="color:var\(--muted\)">/);
  const keep = '/* aegis: own-colours */ body{color:#f0f}';
  assert.equal(themeCss(keep), keep); assert.equal(themeHtml('<b style="color:#f0f">x</b>', keep), '<b style="color:#f0f">x</b>');
});

test('the sandbox applies the theme and ships a styled base for unstyled markup', () => {
  const doc = sandboxDocument({ html: '<p style="color:#123456">x</p>', css: 'h2{color:#58c9a0}', js: '' }, 'channel', '--text:#fff;', '');
  assert.match(doc, /h2\{color:var\(--data\)\}/);
  assert.match(doc, /<p style="color:var\(--text\)">/);
  for (const element of ['button{', 'input[type=range]::-webkit-slider-thumb', 'progress::-webkit-progress-value', 'table{', 'output{']) assert.ok(doc.includes(element), element);
});
