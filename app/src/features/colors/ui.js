// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { registerRenderer } from '../../canvas/engine.js';
import { colorName, normHex, hex2hsv, hsv2rgb, rgb2hex, boardColours } from './model.js';
import { installColourSettings } from './settings.js';
import { node, button, field } from '../media/dom.js';
let closeEditor = () => {};
export function colourEditor({ hex = '#ff9ec4', name, autoName = true, at = null, apply, save = null, board, options = {} }) {
  closeEditor();
  let colour = normHex(hex) || '#ff9ec4', label = name || colorName(colour), automatic = autoName, hsv = hex2hsv(colour);
  const pop = node('div', 'colour-pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Colour editor');
  const title = node('strong', '', 'Colour editor'), wheelWrap = node('div', 'colour-wheel-wrap'), wheel = node('canvas', 'colour-wheel'), ring = node('i', 'colour-ring');
  wheel.width = wheel.height = 220; wheel.tabIndex = 0; wheel.setAttribute('role', 'slider'); wheel.setAttribute('aria-label', 'Hue and saturation');
  wheel.title = 'Drag to choose hue and saturation. Arrow keys change hue; Shift and arrows change saturation.';
  wheelWrap.append(wheel, ring); pop.append(title, wheelWrap);
  const brightness = field('Brightness', 'range', String(hsv.v * 100), pop); brightness.min = '0'; brightness.max = '100';
  const hexInput = field('Hex', 'text', colour.toUpperCase(), pop), nameInput = name === null ? null : field('Colour name', 'text', label, pop);
  const quick = node('div', 'colour-quick'); pop.append(quick);
  let all = false;
  const quickRows = () => {
    quick.replaceChildren();
    const rows = [{ hex: '#000000', name: 'Black' }, { hex: '#ffffff', name: 'White' }, ...boardColours(board())].filter((p, i, a) => a.findIndex(v => v.hex === p.hex) === i);
    for (const p of all ? rows : rows.slice(0, 16)) { const b = button('', () => setHex(p.hex), quick); b.style.background = p.hex; b.title = p.name; b.setAttribute('aria-label', p.name); }
    if (rows.length > 16) button(all ? 'Fewer' : 'All board colours', () => { all = !all; quickRows(); }, quick);
  };
  const draw = () => {
    const g = wheel.getContext('2d'), img = g.createImageData(220, 220);
    for (let y = 0; y < 220; y++) for (let x = 0; x < 220; x++) {
      const dx = x - 109.5, dy = y - 109.5, radius = Math.hypot(dx, dy), i = (y * 220 + x) * 4;
      if (radius > 110) continue;
      img.data.set([...hsv2rgb((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, Math.min(1, radius / 110), hsv.v), 255], i);
    }
    g.putImageData(img, 0, 0);
    const a = hsv.h * Math.PI / 180;
    Object.assign(ring.style, { left: 110 + Math.cos(a) * hsv.s * 110 + 'px', top: 110 + Math.sin(a) * hsv.s * 110 + 'px', background: colour });
    brightness.value = String(hsv.v * 100); wheel.setAttribute('aria-valuenow', String(Math.round(hsv.h))); hexInput.value = colour.toUpperCase(); if (nameInput) nameInput.value = label;
  };
  const commit = () => apply({ hex: colour, label, autoName: automatic });
  const setHex = h => {
    colour = h; hsv = hex2hsv(h);
    const named = board().palette?.find(p => p.hex === h);
    if (automatic) label = named?.name || colorName(h);
    draw(); commit();
  };
  const fromHSV = () => { colour = rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)); if (automatic) label = board().palette?.find(p => p.hex === colour)?.name || colorName(colour); draw(); };
  const point = e => { const r = wheel.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2; hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; hsv.s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2)); if (hsv.v < .05) hsv.v = 1; fromHSV(); };
  wheel.onpointerdown = e => { wheel.setPointerCapture(e.pointerId); point(e); e.preventDefault(); };
  wheel.onpointermove = e => { if (wheel.hasPointerCapture(e.pointerId)) point(e); };
  wheel.onpointerup = e => { if (wheel.hasPointerCapture(e.pointerId)) { wheel.releasePointerCapture(e.pointerId); commit(); } };
  wheel.onkeydown = e => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return; e.preventDefault(); const d = ['ArrowRight','ArrowUp'].includes(e.key) ? 1 : -1; if (e.shiftKey) hsv.s = Math.max(0, Math.min(1, hsv.s + d * .02)); else hsv.h = (hsv.h + d * 3 + 360) % 360; fromHSV(); commit(); };
  brightness.oninput = () => { hsv.v = Number(brightness.value) / 100; fromHSV(); }; brightness.onchange = commit;
  hexInput.onchange = () => { const hex = normHex(hexInput.value); if (hex) { hexInput.setCustomValidity(''); setHex(hex); } else { hexInput.setCustomValidity('Enter a three or six-digit hex colour'); hexInput.reportValidity(); } };
  if (nameInput) nameInput.oninput = () => { label = nameInput.value.trim() || colorName(colour); automatic = false; commit(); };
  if (options.swatch) for (const [key, text] of [['hideName', 'Show name'], ['hideHex', 'Show hex']]) {
    const check = field(text, 'checkbox', '', pop); check.checked = !options.swatch[key]; check.onchange = () => options.toggle(key, !check.checked);
  }
  if (save) button('Save to board colours', () => save({ hex: colour, name: label }), pop);
  button('Done', () => closeEditor(), pop);
  document.body.append(pop);
  const r = at || { right: innerWidth / 2, top: 100 };
  pop.style.left = Math.max(8, Math.min(innerWidth - 280, r.right + 12)) + 'px';
  pop.style.top = Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, r.top)) + 'px';
  const outside = e => { if (!pop.contains(e.target)) closeEditor(); };
  const key = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); closeEditor(); } };
  const boardId = board().id;
  const timer = setInterval(() => { if (board().id !== boardId) closeEditor(); }, 300);
  closeEditor = () => { pop.remove(); clearInterval(timer); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); closeEditor = () => {}; };
  queueMicrotask(() => document.addEventListener('pointerdown', outside, true)); document.addEventListener('keydown', key, true);
  quickRows(); draw(); hexInput.focus();
}
export function openSwatch(c, api) {
  const current = () => api.board.cards.find(v => v.id === c.id);
  colourEditor({ ...c.props, name: c.props?.label, at: document.querySelector(`[data-id="${c.id}"]`)?.getBoundingClientRect(), board: () => api.board,
    apply: props => { if (current()) api.setProps(c.id, props); },
    save: p => api.apply([{ op: 'board_set', set: { palette: [...(api.board.palette || []).filter(v => v.hex !== p.hex), p] } }]),
    options: { swatch: c.props || {}, toggle: (key, value) => api.setProps(c.id, { [key]: value }) },
  });
}
export function createSwatch(ctx, at = ctx.canvas.centre(), hex = '#ff9ec4', name, edit = true) {
  ctx.apply([{ op: 'create', type: 'swatch', x: at.x, y: at.y, props: { hex, label: name || colorName(hex), autoName: !name }, ref: 'swatch' }], ids => {
    ctx.canvas.select([ids.swatch]);
    if (edit) requestAnimationFrame(() => openSwatch(ctx.canvas.board.cards.find(c => c.id === ids.swatch), { get board() { return ctx.canvas.board; }, apply: ctx.apply, setProps: (id, props) => ctx.apply([{ op: 'update', id, set: { props } }]) }));
  });
}
export function mountColours(el, ctx) {
  const cleanSettings = installColourSettings(ctx);
  el.classList.add('board-colours'); let signature = '', closeMenu = () => {};
  let menuBoard;
  const refresh = () => {
    const board = ctx.canvas.board; if (!board) return;
    if (menuBoard && menuBoard !== board.id) closeMenu();
    const rows = boardColours(board), sig = JSON.stringify([board.id, board.bg, board.palette, rows]); if (sig === signature) return; signature = sig;
    el.replaceChildren();
    const controls = node('div', 'colour-actions'); el.append(controls);
    button('Add colour', () => createSwatch(ctx), controls);
    button('Background', () => colourEditor({ hex: board.bg || '#ffffff', name: null, board: () => ctx.canvas.board, apply: p => ctx.apply([{ op: 'board_set', set: { bg: p.hex } }]) }), controls);
    if (board.bg) button('Default background', () => ctx.apply([{ op: 'board_set', set: { bg: null } }]), controls);
    const saved = board.palette || []; el.append(node('small', '', 'Saved palette'));
    if (!saved.length) el.append(node('p', 'muted', 'Save a swatch here from its colour editor.'));
    for (const p of saved) {
      const row = node('div', 'palette-row'), dot = button(p.name, () => createSwatch(ctx, undefined, p.hex, p.name, false), row); dot.style.setProperty('--palette-colour', p.hex); dot.title = p.hex;
      const edit = (rename = false) => {
        let oldHex = p.hex;
        colourEditor({ hex: p.hex, name: p.name, autoName: false, board: () => ctx.canvas.board, apply: value => {
          const b = ctx.canvas.board, palette = (b.palette || []).map(p => p.hex === oldHex ? { hex: value.hex, name: value.label } : p);
          const commands = b.cards.filter(c => c.type === 'swatch' && c.props?.hex === oldHex).map(c => ({ op: 'update', id: c.id, set: { props: { hex: value.hex, label: value.label, autoName: false } } }));
          ctx.apply([{ op: 'board_set', set: { palette } }, ...commands]); oldHex = value.hex; refresh();
        } });
        if (rename) { const input = document.querySelector('.colour-pop [aria-label="Colour name"]'); input?.focus(); input?.select(); }
      };
      button('Edit', () => edit(), row);
      const remove = button('×', () => ctx.apply([{ op: 'board_set', set: { palette: (ctx.canvas.board.palette || []).filter(v => v.hex !== p.hex) } }]), row); remove.title = `Remove ${p.name} from board colours`; remove.setAttribute('aria-label', remove.title); el.append(row);
      row.title = 'Click to add to the board. Right-click to rename, change or remove.';
      row.oncontextmenu = event => {
        event.preventDefault(); event.stopPropagation(); closeMenu(); menuBoard = board.id;
        const menu = node('div', 'palette-menu'); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Palette colour');
        const outside = e => { if (!menu.contains(e.target)) dismiss(); };
        const escape = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dismiss(); dot.focus(); } };
        const dismiss = () => {
          menu.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true);
          if (closeMenu === dismiss) closeMenu = () => {};
        };
        closeMenu = dismiss;
        const actions = [['Add to the board', () => createSwatch(ctx, undefined, p.hex, p.name, false)], ['Rename', () => edit(true)], ['Change colour…', () => edit()], ['Remove from board colours', () => remove.click()]];
        for (const [label, action] of actions) { const item = button(label, () => { closeMenu(); action(); }, menu); item.setAttribute('role', 'menuitem'); }
        menu.onkeydown = e => {
          const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
        };
        document.body.append(menu);
        document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true);
        menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, event.clientX)) + 'px';
        menu.style.top = Math.max(8, Math.min(innerHeight - menu.offsetHeight - 8, event.clientY)) + 'px';
        menu.querySelector('button').focus();
      };
    }
    el.append(node('small', '', 'Colours in use'));
    const used = node('div', 'colour-quick'); el.append(used);
    for (const p of rows) { const b = button('', () => createSwatch(ctx, undefined, p.hex, p.name, false), used); b.style.background = p.hex; b.title = `${p.name} ${p.hex}`; b.setAttribute('aria-label', p.name); }
  };
  const timer = setInterval(refresh, 250); refresh(); return () => { closeMenu(); clearInterval(timer); cleanSettings?.(); };
}
export function installSwatch() {
  registerRenderer('swatch', { interactive: 'button', render(el, c, api) {
    const p = c.props || {}, hex = normHex(p.hex) || '#ff9ec4';
    const chip = button('', () => openSwatch(c, api), el); chip.className = 'swatch-chip'; chip.style.background = hex; chip.setAttribute('aria-label', 'Change colour');
    if (!p.hideName) el.append(node('strong', 'swatch-name', p.role && p.autoName ? p.role : p.label || colorName(hex)));
    if (!p.hideHex) el.append(node('small', '', hex.toUpperCase()));
  }, open: openSwatch });
}
