import { createDropdown } from '../../lib/ui/dropdown.js';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import '../wireframe/icons/names.js';
import { DEVICES, PIECES, TYPES, uid, wireCard, screenCommand, frameAt, pieceCommands, sectionCommands, alignmentCommands, expandDrag, snapDrag } from './model.js';
import { requestImage } from './render.js';
import { mountSectionBehaviour } from './sections.js';

const labels = { frame: 'Screen', box: 'Box', text: 'Text', icon: 'Icon', font: 'Font specimen', section: 'Section', title: 'Title' };
const propertyTypes = [...TYPES, 'title'];
let activePanel;
let mode = { type: 'frame', device: 'iPhone' };
let gesture;
export const snapSettings = { grid: false };
export function snapConfigured(cards, dx, dy, board, view, event) { return snapDrag(cards, dx, dy, board, view, { grid: snapSettings.grid, disabled: event.metaKey || event.ctrlKey }); }
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
const button = (text, run, title = text) => { const b = node('button', '', text); b.type = 'button'; b.title = title; b.onclick = run; return b; };
function selected(ctx) { return (ctx.canvas.board?.cards || []).filter(c => ctx.selection().includes(c.id)); }
function applyCreated(ctx, commands) {
  if (!commands.length) return;
  const ids = commands.filter(c => c.op === 'create').map(c => c.newId);
  ctx.apply(commands, () => { ctx.canvas.select(ids.filter(id => ctx.canvas.board.cards.find(c => c.id === id)?.type !== 'frame' || ids.length === 1)); if (commands[0].type === 'text') ctx.canvas.edit(ids[0]); });
}
function stamp(at, ctx, size) {
  const cards = ctx.canvas.board.cards;
  if (snapSettings.grid) at = { x: Math.round(at.x / 26) * 26, y: Math.round(at.y / 26) * 26 };
  if (mode.type === 'piece') return applyCreated(ctx, pieceCommands(mode.name, at, cards));
  let command;
  if (mode.type === 'frame') command = screenCommand(mode.device, at);
  else if (mode.type === 'box') command = wireCard({ type: 'box', w: size?.w || 160, h: size?.h || 100, fill: '#e4e4e7', radius: 8, sw: 0 }, at.x, at.y);
  else if (mode.type === 'text') command = wireCard({ type: 'text', text: 'Type something', w: 240, h: 28, font: 'Arial', size: 18, weight: 500, color: '#27272a' }, at.x, at.y);
  else if (mode.type === 'icon') command = wireCard({ type: 'icon', name: mode.name || 'star', w: 40, h: 40, color: '#27272a' }, at.x, at.y);
  else if (mode.type === 'font') command = wireCard({ type: 'font', text: 'The quick brown fox jumps over the lazy dog.', w: 320, h: 190, font: 'Georgia' }, at.x, at.y);
  else command = wireCard({ type: 'section', text: 'Section', w: 560, h: 360, fill: '#cbd5e1', radius: 24 }, at.x, at.y);
  const f = frameAt(cards, command);
  if (f && !['frame', 'section'].includes(command.type)) command.parent = f.id;
  const commands = [command];
  if (command.type === 'section') commands.push({ op: 'order', id: command.newId, to: 'back' });
  if (command.type === 'frame') {
    for (const c of cards) if (!['frame', 'section'].includes(c.type) && frameAt([{ ...command, id: command.newId }], c)) commands.push({ op: 'update', id: c.id, set: { parent: command.newId } });
    commands.push({ op: 'order', id: command.newId, to: 'back' });
  }
  applyCreated(ctx, commands);
}
export const placementPointer = {
  down(e, at, ctx) {
    gesture = { start: at, last: at };
    if (mode.type === 'box') {
      const preview = node('div', 'wf-box-preview'); document.getElementById('world').append(preview); gesture.preview = preview;
    }
  },
  move(e, at) {
    if (!gesture) return; gesture.last = at;
    if (gesture.preview) Object.assign(gesture.preview.style, { left: Math.min(at.x, gesture.start.x) + 'px', top: Math.min(at.y, gesture.start.y) + 'px', width: Math.abs(at.x - gesture.start.x) + 'px', height: Math.abs(at.y - gesture.start.y) + 'px' });
  },
  up(e, at, ctx) {
    if (!gesture) return;
    const g = gesture; gesture = null; g.preview?.remove();
    const drawn = mode.type === 'box' && Math.hypot(at.x - g.start.x, at.y - g.start.y) * ctx.canvas.view.z > 4;
    stamp(drawn ? { x: Math.min(at.x, g.start.x), y: Math.min(at.y, g.start.y) } : g.start, ctx, drawn ? { w: Math.max(40, Math.abs(at.x - g.start.x)), h: Math.max(24, Math.abs(at.y - g.start.y)) } : undefined);
    ctx.canvas.setTool(null);
  },
};
export function openPanel() { activePanel?.show(); }
export function beginTool(type) { activePanel?.show(); activePanel?.arm({ type, ...(type === 'frame' ? { device: 'iPhone' } : {}) }); }
export function createSection(ctx) {
  const cards = selected(ctx); if (!cards.length) { ctx.toast('Select cards to put a section around them.'); return; }
  applyCreated(ctx, sectionCommands(cards)); openPanel();
}
export function setGroup(ctx, ids, on) {
  const group = on ? uid() : '';
  const groups = new Set(ctx.canvas.board.cards.filter(c => ids.includes(c.id) && c.group).map(c => c.group));
  const targets = on ? ids : ctx.canvas.board.cards.filter(c => ids.includes(c.id) || groups.has(c.group)).map(c => c.id);
  ctx.apply(targets.map(id => ({ op: 'update', id, set: { group } })));
}
export function mountPanel(hostEl, ctx) {
  activePanel?.dispose();
  hostEl.append(button('Open design panel', openPanel));
  const panel = node('aside', 'wf-design'); panel.hidden = true; panel.setAttribute('aria-label', 'Wireframe design panel');
  const header = node('div', 'wf-panel-head'); header.append(node('strong', '', 'Wireframe'), button('Close', () => { panel.hidden = true; ctx.canvas.setTool(null); }));
  const content = node('div', 'wf-panel-body'); panel.append(header, content); document.body.append(panel);
  const status = node('p', 'wf-hint', 'Pick a tool, then click the canvas. Drag to draw a box.');
  function arm(next) { mode = next; ctx.canvas.setTool('wireframe'); status.textContent = `Place ${next.type === 'piece' ? next.name.toLowerCase() : labels[next.type].toLowerCase()} on the canvas. Press Escape to cancel.`; }
  const tools = node('div', 'wf-tool-grid'), presets = node('div', 'wf-presets');
  for (const type of ['frame', 'box', 'text', 'icon', 'font', 'section']) {
    const b = button(labels[type], () => {
      if (type === 'icon') { showIcons(); return; }
      if (type === 'section' && selected(ctx).length) { createSection(ctx); return; }
      arm({ type, ...(type === 'frame' ? { device: device.value } : {}) });
    }); b.dataset.wf = type; tools.append(b);
  }
  const device = createDropdown({ label: 'Screen preset', options: Object.keys(DEVICES).map(name => [name, name]) });
  device.onchange = () => arm({ type: 'frame', device: device.value }); presets.append(device);
  const gridLabel = node('label', 'wf-grid-toggle'); const gridCheck = node('input'); gridCheck.type = 'checkbox'; gridCheck.setAttribute('aria-label', 'Snap to grid');
  snapSettings.grid = localStorage.getItem('aegis:wireframe-grid') === 'on'; gridCheck.checked = snapSettings.grid;
  gridCheck.onchange = () => { snapSettings.grid = gridCheck.checked; localStorage.setItem('aegis:wireframe-grid', gridCheck.checked ? 'on' : 'off'); };
  gridLabel.append(gridCheck, 'Snap to 26 px grid');
  const propsEl = node('div', 'wf-properties');
  content.append(tools, presets, status, gridLabel, propsEl);
  const pieces = node('details', 'wf-pieces'); pieces.append(node('summary', '', 'Pieces'));
  const pieceGrid = node('div', 'wf-piece-grid'), webGrid = node('div', 'wf-piece-grid');
  for (const [name, piece] of Object.entries(PIECES)) { const b = button(name, () => arm({ type: 'piece', name })); b.dataset.piece = name; (piece.web ? webGrid : pieceGrid).append(b); }
  pieces.append(pieceGrid, node('p', 'wf-hint', 'Website sections. Text, prices and quotes are sample content.'), webGrid); content.append(pieces);
  const popover = node('div', 'wf-icon-picker'); popover.hidden = true; popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', 'Choose icon');
  const search = node('input'); search.placeholder = 'Search icons'; search.setAttribute('aria-label', 'Search icons');
  const iconGrid = node('div', 'wf-icon-grid'); let swap;
  function renderIcons() {
    const q = search.value.trim().toLowerCase().replace(/\s+/g, '_');
    const hits = (window.MATERIAL_ICONS || []).filter(name => name.includes(q)); iconGrid.replaceChildren();
    for (const name of hits.slice(0, 180)) {
      const b = button('', () => {
        if (swap && ctx.canvas.board.cards.some(c => c.id === swap)) { ctx.apply([{ op: 'update', id: swap, set: { props: { name } } }]); swap = null; }
        else arm({ type: 'icon', name });
        popover.hidden = true;
      }, name.replaceAll('_', ' ')); b.dataset.icon = name; b.setAttribute('aria-label', name.replaceAll('_', ' ')); const glyph = node('span', 'wf-mi', name); b.append(glyph); iconGrid.append(b);
    }
    if (hits.length > 180) iconGrid.append(node('small', 'wf-icon-more', `${hits.length - 180} more. Keep typing to narrow the search.`));
    if (!hits.length) iconGrid.append(node('small', '', 'No matching icons.'));
  }
  function showIcons(id) { swap = id; search.value = ''; popover.hidden = false; renderIcons(); search.focus(); }
  search.oninput = renderIcons; search.onkeydown = e => { if (e.key === 'Escape') { popover.hidden = true; swap = null; ctx.canvas.setTool(null); } e.stopPropagation(); };
  popover.append(search, button('Close icon search', () => { popover.hidden = true; swap = null; }), iconGrid); panel.append(popover);
  function updateProperty(key, value) {
    const cards = selected(ctx).filter(c => propertyTypes.includes(c.type)), commands = [];
    for (const c of cards) {
      const base = ['x', 'y', 'w', 'h', 'rot', 'text'].includes(key), props = { [key]: value }, set = base ? { [key]: value } : { props };
      if ((key === 'w' || key === 'h') && c.type === 'frame') set.props = { device: 'Custom' };
      if (key === 'w' || key === 'h') set.props = { ...set.props, [key === 'w' ? 'visualW' : 'visualH']: null };
      if (key === 'device' && DEVICES[value]) { const [w, h, radius] = DEVICES[value]; Object.assign(set, { w, h, props: { device: value, radius } }); }
      if (key === 'iconSize') Object.assign(set, { w: value, h: value, props: { visualW: null, visualH: null, iconSize: null } });
      if (key === 'hollow' && value && !(c.props?.sw > 0)) Object.assign(props, { sw: 1, stroke: c.props?.stroke || c.props?.ink || '#27272a' });
      if (key === 'fill' && value === 'none' && (!(c.props?.sw > 0) || c.props?.sdash === 'none')) Object.assign(props, { sw: 1, sdash: 'solid', stroke: c.props?.stroke || '#a1a1aa' });
      // Moving a container in the numeric fields carries the same contents as a drag.
      if (key === 'x' || key === 'y') for (const child of expandDrag([c], ctx.canvas.board, { metaKey: true }).filter(k => k.id !== c.id && !cards.includes(k))) commands.push({ op: 'move', id: child.id, [key]: child[key] + value - c[key] });
      commands.push({ op: 'update', id: c.id, set });
    }
    if (commands.length) ctx.apply(commands);
  }
  function field(grid, key, label, value, type = 'text', options) {
    const wrap = node('label', 'wf-field'), name = node('span', '', label);
    const input = options ? createDropdown({ label, options: options.map(item => Array.isArray(item) ? item : [item, item]) }) : node('input'); input.dataset.prop = key; input.setAttribute('aria-label', label);
    if (!options) { input.type = type; if (type === 'number') { input.step = key === 'lh' || key === 'opacity' ? '0.1' : '1'; if (!['x', 'y', 'rot'].includes(key)) input.min = '0'; } }
    input.value = String(value ?? '');
    input.onchange = () => updateProperty(key, type === 'number' ? Number(input.value) : input.value);
    if (key === 'font') { input.setAttribute('list', 'wf-browser-fonts'); }
    wrap.append(name, input); grid.append(wrap); return input;
  }
  const fontList = node('datalist'); fontList.id = 'wf-browser-fonts';
  const fonts = new Set(['Arial', 'Helvetica Neue', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New', 'system-ui', 'sans-serif', 'serif', 'monospace']);
  document.fonts.forEach(f => fonts.add(f.family.replaceAll('"', ''))); for (const font of fonts) { const opt = node('option'); opt.value = font; fontList.append(opt); } panel.append(fontList);
  function renderProperties() {
    lastSignature = JSON.stringify(selected(ctx)); lastSelection = ctx.canvas.board?.id + ':' + ctx.selection().join(',');
    const cards = selected(ctx).filter(c => propertyTypes.includes(c.type)); propsEl.replaceChildren();
    if (!cards.length) return;
    propsEl.append(node('h3', '', cards.length === 1 ? labels[cards[0].type] : `${cards.length} selected`));
    const c = cards[0], p = c.props || {}, grid = node('div', 'wf-property-grid'); propsEl.append(grid);
    if (cards.length === 1) {
      field(grid, 'text', c.type === 'frame' || c.type === 'section' ? 'Name' : 'Words', c.text);
      for (const key of ['x', 'y', 'w', ...(c.type === 'text' ? [] : ['h']), ...(['frame', 'section'].includes(c.type) ? [] : ['rot'])]) field(grid, key, { x: 'X', y: 'Y', w: 'Width', h: 'Height', rot: 'Rotation' }[key], c[key] || 0, 'number');
      if (c.type === 'frame') field(grid, 'device', 'Device', p.device || 'Custom', 'text', ['Custom', ...Object.keys(DEVICES)]);
    }
    if (cards.every(c => ['frame', 'box', 'section'].includes(c.type))) {
      field(grid, 'fill', 'Fill', p.fill || '#e4e4e7');
      const noFill = button('No fill', () => updateProperty('fill', 'none')); grid.append(noFill);
      field(grid, 'radius', 'Corner radius', p.radius || 0, 'number');
      grid.append(button('Pill corners', () => updateProperty('radius', Math.min(c.w, c.h) / 2)));
      if (c.type !== 'section') {
        field(grid, 'stroke', 'Border colour', p.stroke || '#a1a1aa', 'color'); field(grid, 'sw', 'Border width', p.sw || 0, 'number');
        field(grid, 'sdash', 'Border style', p.sdash || 'solid', 'text', [['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted'], ['none', 'None']]);
        field(grid, 'dl', 'Dash length', p.dl ?? 8, 'number'); field(grid, 'dg', 'Dash gap', p.dg ?? 5, 'number'); field(grid, 'opacity', 'Opacity', p.opacity ?? 1, 'number');
      }
      if (cards.length === 1 && c.type === 'box') {
        field(grid, 'img', 'Image placeholder label', p.img || ''); field(grid, 'src', 'Image URL', p.src || '');
        if (p.img) propsEl.append(button('Fill image', () => requestImage(c, ctx)));
      }
    }
    if (cards.every(c => ['text', 'font'].includes(c.type))) {
      field(grid, 'font', 'Font family', p.font || 'Arial');
      if (c.type === 'text') {
        field(grid, 'size', 'Font size', p.size || 18, 'number'); field(grid, 'weight', 'Font weight', p.weight || 500, 'number', [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semi bold'], [700, 'Bold'], [800, 'Extra bold']]);
        field(grid, 'lh', 'Line height', p.lh || 1.3, 'number'); field(grid, 'align', 'Text alignment', p.align || 'left', 'text', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]);
      }
    }
    if (cards.every(c => ['text', 'title', 'icon'].includes(c.type))) {
      field(grid, 'ink', 'Text or icon colour', p.ink || '#27272a', 'color');
      field(grid, 'stroke', 'Letter outline colour', p.stroke || p.ink || '#27272a', 'color');
      field(grid, 'sw', 'Letter outline width', p.sw ?? 1, 'number');
      propsEl.append(button(p.hollow ? 'Filled letters' : 'Hollow letters', () => updateProperty('hollow', !p.hollow)));
    }
    if (cards.length === 1 && c.type === 'icon') { field(grid, 'iconSize', 'Icon size', c.w, 'number'); propsEl.append(button('Change icon', () => showIcons(c.id))); }
    const actions = node('div', 'wf-actions');
    if (cards.length > 1) actions.append(button('Group', () => setGroup(ctx, cards.map(c => c.id), true)), button('Ungroup', () => setGroup(ctx, cards.map(c => c.id), false)));
    if (cards.length === 1 && c.group) actions.append(button('Ungroup', () => setGroup(ctx, [c.id], false)));
    actions.append(button('Create section', () => createSection(ctx)));
    if (c.type === 'section') actions.append(button('Remove section', () => { ctx.apply([{ op: 'delete', ids: cards.filter(c => c.type === 'section').map(c => c.id) }]); ctx.canvas.select([]); }));
    for (const [to, title] of [['front', 'Bring to front'], ['back', 'Send to back']]) actions.append(button(title, () => ctx.apply([{ op: 'order', ids: expandDrag(cards, ctx.canvas.board).map(c => c.id), to }])));
    propsEl.append(actions);
    if (cards.length > 1 || c.parent) {
      const align = node('div', 'wf-actions');
      for (const direction of ['left', 'centre', 'right', 'top', 'middle', 'bottom', ...(cards.length >= 3 ? ['across', 'down'] : [])]) align.append(button(direction === 'across' || direction === 'down' ? 'Space ' + direction : 'Align ' + direction, () => { const cmds = alignmentCommands(cards, ctx.canvas.board.cards, direction); if (cmds.length) ctx.apply(cmds); }));
      propsEl.append(align);
    }
  }
  let lastSignature = '', lastSelection = '';
  const timer = setInterval(() => {
    if (panel.hidden || ctx.canvas.busy()) return;
    const selectionKey = ctx.canvas.board?.id + ':' + ctx.selection().join(',');
    if (selectionKey === lastSelection && (propsEl.contains(document.activeElement) && document.activeElement.matches('input, .aegis-dropdown, textarea, [contenteditable]') || document.activeElement.closest('.aegis-dropdown-menu'))) return;
    const signature = JSON.stringify(selected(ctx)); if (signature !== lastSignature || selectionKey !== lastSelection) { lastSignature = signature; lastSelection = selectionKey; renderProperties(); }
    if (!ctx.canvas.tool && !popover.hidden) return;
    if (!ctx.canvas.tool) status.textContent = 'Pick a tool, then click the canvas. Drag to draw a box.';
  }, 180);
  function escape(e) { if (e.key === 'Escape') { popover.hidden = true; swap = null; gesture?.preview?.remove(); gesture = null; } }
  function cancel() { gesture?.preview?.remove(); gesture = null; }
  document.addEventListener('keydown', escape); document.addEventListener('pointercancel', cancel);
  const disposeSections = mountSectionBehaviour(ctx);
  const dispose = () => { disposeSections(); clearInterval(timer); document.removeEventListener('keydown', escape); document.removeEventListener('pointercancel', cancel); panel.remove(); activePanel = null; };
  activePanel = { show() { panel.hidden = false; renderProperties(); }, arm, dispose };
  return dispose;
}
