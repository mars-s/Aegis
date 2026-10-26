import { createMenu } from '../../lib/ui/menu.js';
import { colourEditor } from './colour-editor.js';
export { colourEditor } from './colour-editor.js';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { registerRenderer } from '../../canvas/engine.js';
import { colorName, normHex, boardColours } from './model.js';
import { installColourSettings } from './settings.js';
import { node, button } from '../media/dom.js';
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
    const rows = boardColours(board), sig = JSON.stringify([board.id, board.bg, board.palette, rows]); if (sig === signature) return;
    // A rebuild would replace the open menu's trigger and close it; rebuild once the menu closes.
    if (menuBoard && menuBoard === board.id && document.querySelector('.palette-menu')) return;
    signature = sig;
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
        document.body.append(menu);
        const actions = [['Add to the board', () => createSwatch(ctx, undefined, p.hex, p.name, false)], ['Rename', () => edit(true)], ['Change colour…', () => edit()], ['Remove from board colours', () => remove.click()]];
        const popup = createMenu({ trigger: dot, menu, bindTrigger: false, label: 'Palette colour', items: actions.map(([title, run]) => ({ title, run, destructive: title === 'Remove from board colours' })), onToggle(on) { if (!on) { menu.remove(); popup.destroy(); if (closeMenu === dismiss) closeMenu = () => {}; menuBoard = undefined; queueMicrotask(refresh); } } });
        const dismiss = () => popup.destroy(); closeMenu = dismiss;
        popup.open(event, { x: event.clientX, y: event.clientY });
        menu.querySelector('button').focus();
      };
    }
    el.append(node('small', '', 'Colours in use'));
    const used = node('div', 'colour-quick'); el.append(used);
    for (const p of rows) { const b = button('', () => createSwatch(ctx, undefined, p.hex, p.name, false), used); b.classList.add('colour-swatch'); b.dataset.hex = p.hex; b.style.background = p.hex; b.title = `${p.name} ${p.hex}`; b.setAttribute('aria-label', p.name); }
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
