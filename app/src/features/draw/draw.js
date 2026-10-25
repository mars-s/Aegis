// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { registerTool, registerPanel, registerCommand, registerCardMenu } from '../registry';
import { svg, SHAPES, INKS, colour } from './geometry.js';
import { inkTool, PEN_RANGE } from './ink.js';
import { vectorEditor } from './vector.js';
import { connectorEditor } from './connectors.js';
import './renderers.js';

const EMOJI = ['⭐', '❤️', '👍', '🎉', '🌱', '💡', '🔥', '✅', '😀', '😂', '🥹', '😍', '🤔', '😎', '😴', '👀', '👋', '👏', '🙌', '💪', '🧠', '✨', '💯', '❓', '❗', '🚀', '🎯', '🏆', '🎨', '📌', '📚', '☕', '🍎', '🍓', '🌈', '☀️', '🌙', '🌻', '🌳', '🍀', '🐈', '🐕', '🦊', '🐝', '🦋', '🐢', '🐙', '🦉', '🎵', '🎸', '⚽', '🏀', '🎲', '🎁', '🛠️', '🔑', '💎', '💬', '📍', '🏠', '🌏', '✈️', '🚲', '🧩'];
const defaultFavourites = EMOJI.slice(0, 8);
const state = { pen: 'pen', ink: 'ink', sizes: { pen: 9, marker: 8, hi: 24, eraser: 28 }, shape: 'rect', fill: '#aed3ff', stroke: 'ink', sw: 2.5, emoji: '⭐', favourites: [...defaultFavourites], recent: [] };
try {
  const saved = JSON.parse(localStorage.getItem('aegis:draw') || '{}');
  if (saved.pen in PEN_RANGE) state.pen = saved.pen;
  if (saved.ink in INKS || /^#[0-9a-f]{6}$/i.test(saved.ink)) state.ink = saved.ink;
  for (const k of Object.keys(PEN_RANGE)) { const n = saved.sizes?.[k], [a, b] = PEN_RANGE[k]; if (Number.isFinite(n)) state.sizes[k] = Math.max(a, Math.min(b, n)); }
  for (const k of ['favourites', 'recent']) if (Array.isArray(saved[k])) state[k] = saved[k].filter(e => EMOJI.includes(e)).slice(0, k === 'favourites' ? 8 : 12);
} catch { /* A damaged preference must not stop drawing. */ }
function save() { try { localStorage.setItem('aegis:draw', JSON.stringify({ pen: state.pen, ink: state.ink, sizes: state.sizes, favourites: state.favourites, recent: state.recent })); } catch { /* Drawing still works when storage is unavailable. */ } }
let ctx, ink, vector, connectors, inspector, live, ring;
const tools = ['draw-ink', 'draw-shape', 'vector', 'draw-stamp'];
function arm(id) { vector?.finish(); vector?.endEdit(); ctx.canvas.select([]); ctx.canvas.setTool(id); refresh(true); }
registerTool({ id: 'draw-ink', activate: () => arm('draw-ink'), title: 'Draw ink', key: 'p', group: 'draw', icon: '<path d="m3 11 8-8 2 2-8 8-3 1zM9 5l2 2"/>', pointer: { down: (...args) => ink.down(...args), move: (...args) => ink.move(...args), up: (...args) => ink.up(...args) } });
registerTool({ id: 'draw-shape', activate: () => arm('draw-shape'), title: 'Shapes', key: 's', group: 'draw', icon: '<rect x="2" y="2" width="8" height="8" rx="1"/><circle cx="10" cy="10" r="4"/>', place(at, context) {
  const line = state.shape === 'line', w = line ? 200 : 180, h = line ? 24 : 140;
  context.apply([{ op: 'create', type: 'shape', x: at.x - w / 2, y: at.y - h / 2, w, h, props: { shape: state.shape, fill: state.fill, stroke: state.stroke, sw: state.sw }, ref: 'shape' }], ids => context.canvas.select([ids.shape])); return true;
} });
registerTool({ id: 'vector', activate: () => arm('vector'), title: 'Vector Pen (Shift+P)', group: 'draw', icon: '<path d="m8 1 5 8-5 6-5-6zM8 1v7"/><circle cx="8" cy="9" r="1"/>', pointer: { down: (...args) => vector.pointer.down(...args), move: (...args) => vector.pointer.move(...args), up: (...args) => vector.pointer.up(...args) } });
registerTool({ id: 'draw-stamp', activate: () => arm('draw-stamp'), title: 'Emoji stamps', key: 'e', group: 'draw', icon: '<circle cx="8" cy="8" r="6"/><path d="M5 6h.1M11 6h.1M5 9q3 4 6 0"/>', place(at, context) {
  state.recent = [state.emoji, ...state.recent.filter(e => e !== state.emoji)].slice(0, 12); save();
  context.apply([{ op: 'create', type: 'stamp', x: at.x - 40, y: at.y - 40, w: 80, h: 80, props: { emoji: state.emoji }, ref: 'stamp' }], ids => context.canvas.select([ids.stamp])); refresh(true); return true;
} });
registerCommand({ id: 'draw-vector', title: 'Vector Pen', keys: 'shift+p', run: () => arm('vector') });
registerCardMenu({ id: 'draw-edit-points', title: 'Edit points', section: 'draw', when: (context, ids) => ids.length === 1 && context.canvas.board.cards.some(c => c.id === ids[0] && (c.type === 'path' || c.type === 'shape' && c.props?.shape !== 'line' && c.props?.shape !== 'heart')), run: (_context, ids) => vector.begin(ids[0]) });

function selectedCard() { return ctx?.canvas.board?.cards.find(c => ctx.selection().includes(c.id) && ['ink', 'shape', 'path', 'stamp'].includes(c.type)); }
function updateCard(props) { const c = selectedCard(); if (c) ctx.apply([{ op: 'update', id: c.id, set: { props } }]); }
function button(parent, text, run, title = text) { const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.title = title; el.setAttribute('aria-label', title); el.addEventListener('click', run); parent.append(el); return el; }
function label(parent, name) { const row = document.createElement('label'); row.className = 'draw-field'; const text = document.createElement('span'); text.textContent = name; row.append(text); parent.append(row); return row; }
function select(parent, name, values, value, change) {
  const row = label(parent, name), el = document.createElement('select'); el.setAttribute('aria-label', name);
  for (const [v, title] of Object.entries(values)) { const option = document.createElement('option'); option.value = v; option.textContent = title; el.append(option); }
  el.value = value; el.onchange = () => change(el.value); row.append(el); return el;
}
function input(parent, name, type, value, change, attrs = {}) {
  const row = label(parent, name), el = document.createElement('input'); el.type = type; el.value = String(value); el.setAttribute('aria-label', name); Object.assign(el, attrs);
  el.addEventListener(type === 'range' ? 'input' : 'change', () => change(el.value)); row.append(el); return el;
}
function number(parent, name, value, min, max, change) { return input(parent, name, 'number', value, v => change(Math.max(min, Math.min(max, Number(v) || 0))), { min: String(min), max: String(max), step: '1' }); }
function hint(parent, text) { const p = document.createElement('p'); p.className = 'draw-hint'; p.textContent = text; parent.append(p); }
let signature = '';
function refresh(force = false) {
  if (!inspector || !ctx.canvas.board) return;
  const c = selectedCard(), link = connectors.current(), active = ctx.canvas.tool;
  const mode = link ? 'connector' : active === 'draw-ink' ? 'ink' : active === 'draw-shape' ? 'shape' : active === 'vector' ? 'path' : active === 'draw-stamp' ? 'stamp' : c?.type;
  const show = !!mode;
  inspector.hidden = !show;
  document.getElementById('stage').classList.toggle('draw-active', tools.includes(active));
  ring.hidden = active !== 'draw-ink' || state.pen !== 'eraser';
  ring.style.width = ring.style.height = state.sizes.eraser + 'px';
  const key = JSON.stringify([mode, c?.id, link?.id, active, state.pen, vector.active, vector.selectionKey, state.favourites, state.recent]);
  if (!force && key === signature || inspector.contains(document.activeElement) && !force) return;
  signature = key; inspector.replaceChildren(); if (!show) return;
  const header = document.createElement('div'); header.className = 'draw-header';
  const title = document.createElement('strong'); title.textContent = link ? 'Connector' : ({ ink: 'Drawing', shape: 'Shapes', path: 'Vector Pen', stamp: 'Emoji stamps' }[mode] || 'Drawing'); header.append(title);
  button(header, 'Done', () => { vector.finish(); vector.endEdit(); connectors.select(null); ctx.canvas.setTool(null); ctx.canvas.select([]); refresh(); }); inspector.append(header);
  if (link) { connectorControls(inspector, link); return; }
  if (mode === 'ink') inkControls(inspector, c);
  if (mode === 'shape' || mode === 'path') shapeControls(inspector, c, mode);
  if (mode === 'stamp') stampControls(inspector, c);
  if (c && !vector.active) {
    number(inspector, 'Rotation', c.rot || 0, -180, 180, rot => ctx.apply([{ op: 'update', id: c.id, set: { rot } }]));
    if (c.type === 'stamp') number(inspector, 'Stamp size', c.w, 40, 600, size => ctx.apply([{ op: 'update', id: c.id, set: { w: size, h: size } }]));
  }
}
function inkControls(parent, c) {
  const row = document.createElement('div'); row.className = 'draw-buttons'; parent.append(row);
  for (const [id, name] of Object.entries({ pen: 'Pen', marker: 'Marker', hi: 'Highlighter', eraser: 'Eraser' })) {
    const b = button(row, name, () => { state.pen = id; save(); ctx.canvas.setTool('draw-ink'); refresh(true); }); b.setAttribute('aria-pressed', String(state.pen === id));
  }
  const [min, max] = PEN_RANGE[state.pen];
  const sizeRow = label(parent, 'Thickness'), range = document.createElement('input'), output = document.createElement('output'), dot = document.createElement('i');
  range.type = 'range'; range.min = '0'; range.max = '100'; range.setAttribute('aria-label', 'Ink thickness'); const preview = document.createElement('div'), previewDot = document.createElement('i'); preview.className = 'draw-size-preview'; preview.append(previewDot); sizeRow.append(preview); dot.className = 'draw-size-dot';
  function paint() { const size = state.sizes[state.pen]; range.value = String(100 * ((size - min) / (max - min)) ** (1 / 1.7)); range.setAttribute('aria-valuetext', size + ' pixels'); output.textContent = size + ' px'; dot.style.width = dot.style.height = Math.min(26, Math.max(3, size * .6)) + 'px'; dot.style.background = state.pen === 'eraser' ? 'transparent' : colour(state.ink); dot.style.opacity = state.pen === 'hi' ? '.38' : '1'; ring.style.width = ring.style.height = state.sizes.eraser + 'px'; const previewSize = Math.min(110, state.pen === 'eraser' ? size : size * ctx.canvas.view.z); previewDot.style.width = previewDot.style.height = previewSize + 'px'; previewDot.style.background = state.pen === 'eraser' ? 'transparent' : colour(state.ink); previewDot.style.opacity = state.pen === 'hi' ? '.38' : '1'; }
  range.oninput = () => { state.sizes[state.pen] = Math.round(min + (max - min) * (Number(range.value) / 100) ** 1.7); save(); paint(); };
  range.addEventListener('keydown', e => { const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!step) return; e.preventDefault(); state.sizes[state.pen] = Math.max(min, Math.min(max, state.sizes[state.pen] + step)); save(); paint(); });
  range.addEventListener('wheel', e => { e.preventDefault(); state.sizes[state.pen] = Math.max(min, Math.min(max, state.sizes[state.pen] + (e.deltaY < 0 ? 1 : -1))); save(); paint(); }, { passive: false });
  sizeRow.append(dot, range, output); paint();
  const colours = document.createElement('div'); colours.className = 'draw-swatches'; parent.append(colours);
  for (const [id, value] of Object.entries(INKS)) { const b = button(colours, '', () => { state.ink = id; save(); if (c?.type === 'ink') updateCard({ ink: id }); paint(); }, id); b.setAttribute('aria-label', 'Ink colour ' + id); b.style.background = value; }
  input(parent, 'Ink colour', 'color', /^#/.test(state.ink) ? state.ink : '#494848', value => { state.ink = value; save(); if (c?.type === 'ink') updateCard({ ink: value }); paint(); });
  if (c?.type === 'ink') button(parent, 'Apply thickness to stroke', () => updateCard({ size: state.sizes[state.pen], pen: state.pen === 'eraser' ? 'pen' : state.pen }));
  hint(parent, 'Draw on the board. [ and ] change thickness. Eraser removes whole strokes.');
}
function shapeControls(parent, c, mode) {
  const p = c?.props || {}, shape = p.shape || state.shape, line = shape === 'line' && mode === 'shape';
  if (mode === 'shape') select(parent, 'Shape', SHAPES, shape, value => { state.shape = value; if (c?.type === 'shape') updateCard({ shape: value, points: null }); refresh(true); });
  input(parent, line ? 'Line colour' : 'Outline colour', 'color', /^#[0-9a-f]{6}$/i.test(p.stroke) ? p.stroke : (/^#/.test(state.stroke) ? state.stroke : '#494848'), value => { state.stroke = value; updateCard({ stroke: value }); });
  number(parent, 'Thickness', p.lw ?? p.sw ?? state.sw, 1, 24, value => { state.sw = value; updateCard({ sw: value, lw: value }); });
  select(parent, 'Outline', { solid: 'Solid', dashed: 'Dashed' }, p.dash ? 'dashed' : 'solid', value => updateCard({ dash: value === 'dashed' }));
  if (!line) {
    input(parent, 'Fill colour', 'color', /^#[0-9a-f]{6}$/i.test(p.fill) ? p.fill : (state.fill === 'none' ? '#aed3ff' : state.fill), value => { state.fill = value; updateCard({ fill: value }); });
    button(parent, 'No fill', () => { state.fill = 'none'; updateCard({ fill: 'none', sw: p.sw || state.sw, stroke: p.stroke && p.stroke !== 'none' ? p.stroke : state.stroke }); });
    number(parent, 'Corners', vector.active ? vector.radiusValue : p.radius || 0, 0, 300, value => { if (vector.active) vector.radius(value); else updateCard({ radius: value }); });
    if (c) {
      input(parent, 'Shape text', 'text', c.text, text => ctx.apply([{ op: 'update', id: c.id, set: { text } }]));
      if (shape !== 'heart' || mode === 'path') button(parent, 'Edit points', () => vector.begin(c.id));
    }
  } else {
    select(parent, 'Line style', { straight: 'Straight', wavy: 'Wavy', zigzag: 'Zigzag', loopy: 'Loopy' }, p.squig || 'straight', value => { updateCard({ squig: value, round: value === 'zigzag' ? 0 : 60 }); refresh(true); });
    number(parent, 'Tightness', p.waves ?? 6, 1, 30, value => updateCard({ waves: value }));
    number(parent, 'Roundness or loop size', p.round ?? (p.squig === 'zigzag' ? 0 : 60), 0, 100, value => updateCard({ round: value }));
    number(parent, 'Wobble', p.wobble || 0, 0, 100, value => updateCard({ wobble: value }));
    if (c) number(parent, 'Line height', p.lineHeight ?? c.h, 8, 300, h => { const now = selectedCard(), height = Math.max(24, h); if (now) ctx.apply([{ op: 'update', id: now.id, set: { y: now.y + (now.h - height) / 2, h: height, props: { lineHeight: h < 24 ? h : null } } }]); });
  }
  hint(parent, mode === 'path' ? 'Click points, or drag to pull curves. Shift snaps to 45°. Option bends one side. Enter finishes, or click the first point to close.' : 'Click the board to place. Double-click text to write, or double-click the outline to edit points.');
  if (vector.active) hint(parent, 'Shift-click selects points. Option-drag adds handles. Double-click a point switches sharp and smooth. Corners rounds selected points.');
}
function stampControls(parent, c) {
  const current = c?.props?.emoji || state.emoji;
  const choose = emoji => { state.emoji = emoji; if (c?.type === 'stamp' && !ctx.canvas.tool) updateCard({ emoji }); else ctx.canvas.setTool('draw-stamp'); refresh(true); };
  if (c?.type === 'stamp') select(parent, 'Stamp motion', { none: 'Still', wiggle: 'Wiggle', pulse: 'Pulse', spin: 'Spin', shake: 'Shake', float: 'Float', squish: 'Squish', hop: 'Hop' }, c.props?.mv || 'none', value => updateCard({ mv: value === 'none' ? null : value }));
  const wheel = document.createElement('div'); wheel.className = 'draw-stamp-wheel'; wheel.setAttribute('aria-label', 'Favourite emoji');
  state.favourites.forEach((emoji, i) => { const b = button(wheel, emoji, () => choose(emoji), 'Stamp ' + emoji); const angle = i * Math.PI / 4; b.style.left = 82 + Math.sin(angle) * 64 + 'px'; b.style.top = 82 - Math.cos(angle) * 64 + 'px'; });
  button(wheel, '+', () => parent.querySelector('details').open = true, 'All emoji').className = 'draw-wheel-centre'; parent.append(wheel);
  const favourite = state.favourites.includes(current);
  button(parent, favourite ? 'Remove favourite' : 'Add favourite', () => { state.favourites = favourite ? state.favourites.filter(e => e !== current) : [...state.favourites.slice(-7), current]; save(); refresh(true); });
  if (state.recent.length) { hint(parent, 'Recent'); const recent = document.createElement('div'); recent.className = 'draw-emoji-grid'; for (const emoji of state.recent) button(recent, emoji, () => choose(emoji), 'Recent ' + emoji); parent.append(recent); }
  const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'All emoji'; details.append(summary);
  const grid = document.createElement('div'); grid.className = 'draw-emoji-grid'; for (const emoji of EMOJI) button(grid, emoji, () => choose(emoji), 'Stamp ' + emoji); details.append(grid); parent.append(details);
  hint(parent, 'Click repeatedly to stamp. Esc, right-click or another tool finishes.');
}
function connectorControls(parent, link) {
  const row = document.createElement('div'); row.className = 'draw-buttons'; parent.append(row);
  button(row, 'Straight', () => connectors.update({ bend: 0 })); button(row, 'Curved', () => connectors.update({ bend: null }));
  select(parent, 'Connector line', { solid: 'Solid', dashed: 'Dashed' }, link.dash ? 'dashed' : 'solid', value => connectors.update({ dash: value === 'dashed' }));
  select(parent, 'Arrow heads', { none: 'None', end: 'End', both: 'Both' }, link.arrow || 'none', value => connectors.update({ arrow: value }));
  input(parent, 'Connector colour', 'color', link.colour || '#787878', value => connectors.update({ colour: value }));
  input(parent, 'Connector label', 'text', link.label || '', value => connectors.update({ label: value }), { maxLength: 200 });
  button(parent, 'Flip direction', () => connectors.flip()); button(parent, 'Auto ends', () => connectors.update({ pa: null, pb: null })); button(parent, 'Delete connector', () => connectors.remove());
  hint(parent, 'Drag the middle handle to bend. Drag an end onto another card to reconnect.');
}
registerPanel({ id: 'draw', title: 'Drawing', mount(el, context) {
  ctx = context; el.closest('.pbox').hidden = true;
  inspector = document.createElement('section'); inspector.className = 'draw-inspector'; inspector.setAttribute('aria-label', 'Drawing controls'); inspector.hidden = true; document.body.append(inspector);
  live = svg('svg', { class: 'draw-live' }); const vectorLayer = svg('svg', { class: 'draw-vector' }), linkLayer = svg('svg', { class: 'draw-link-editor' });
  const world = document.getElementById('world'), stage = document.getElementById('stage'); world.append(live, vectorLayer); stage.append(linkLayer);
  ring = document.createElement('div'); ring.className = 'draw-eraser-ring'; ring.hidden = true; document.body.append(ring);
  ink = inkTool(state, { live }); vector = vectorEditor(ctx, vectorLayer, state, () => refresh()); connectors = connectorEditor(ctx, linkLayer, () => refresh());
  let frame = 0, boardId = null;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; const id = ctx.canvas.board?.id; if (boardId && id !== boardId) { ink.cancel(ctx); vector.cancel(); connectors.select(null); } boardId = id; refresh(); vector.redraw(); connectors.redraw(); }); };
  const observer = new MutationObserver(records => { if (records.some(r => !r.target.closest?.('.draw-live, .draw-vector'))) schedule(); });
  observer.observe(world, { childList: true, attributes: true, subtree: true, attributeFilter: ['class', 'style'] }); observer.observe(document.getElementById('links'), { childList: true });
  stage.addEventListener('tool', e => { if (e.detail !== 'draw-ink') ink.cancel(ctx); refresh(); });
  addEventListener('pointermove', e => { ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; });
  let stampResize = null;
  stage.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.card.stamp .resize'); if (!handle || e.button !== 0) return;
    e.preventDefault(); e.stopImmediatePropagation(); stage.focus({ preventScroll: true });
    const card = ctx.canvas.board.cards.find(c => c.id === handle.parentElement.dataset.id);
    stampResize = { id: card.id, sx: e.clientX, sy: e.clientY, size: card.w, next: card.w };
    ctx.canvas.select([card.id]); stage.setPointerCapture(e.pointerId);
  }, true);
  stage.addEventListener('pointermove', e => {
    if (!stampResize) return; e.preventDefault(); e.stopImmediatePropagation();
    const d = stampResize, dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    d.next = Math.max(40, Math.min(4000, Math.round(d.size + (Math.abs(dx) > Math.abs(dy) ? dx : dy) / ctx.canvas.view.z)));
    const cardEl = ctx.canvas.mountedEl(d.id); if (cardEl) cardEl.style.width = cardEl.style.height = d.next + 'px';
  }, true);
  stage.addEventListener('pointerup', e => {
    if (!stampResize) return; e.preventDefault(); e.stopImmediatePropagation(); const d = stampResize; stampResize = null;
    ctx.apply([{ op: 'update', id: d.id, set: { w: d.next, h: d.next } }]);
  }, true);
  stage.addEventListener('pointercancel', () => { ink.cancel(ctx); if (stampResize) { const el = ctx.canvas.mountedEl(stampResize.id); if (el) el.style.width = el.style.height = stampResize.size + 'px'; stampResize = null; } });
  stage.addEventListener('contextmenu', () => { if (ctx.canvas.tool === 'draw-stamp') ctx.canvas.setTool(null); });
  addEventListener('keydown', e => {
    if (ctx.canvas.tool !== 'draw-ink' || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === '[' || e.key === ']') { e.preventDefault(); const [a, b] = PEN_RANGE[state.pen]; state.sizes[state.pen] = Math.max(a, Math.min(b, state.sizes[state.pen] + (e.key === '[' ? -1 : 1))); save(); refresh(true); }
  }, true);
  refresh();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); inspector.remove(); live.remove(); vectorLayer.remove(); linkLayer.remove(); ring.remove(); };
} });
