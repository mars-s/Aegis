// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { createPopup } from '../../lib/ui/dropdown.js';
import { writingFonts, writingFont, fontName, fontFamily } from './writing-fonts.js';
export function fontPicker(anchor, cards, ctx, commit) {
  const popover = document.createElement('div'); popover.className = 'editing-font-picker'; popover.setAttribute('aria-label', 'Font picker');
  const input = document.createElement('input'); input.placeholder = 'Search fonts'; input.setAttribute('aria-label', 'Search fonts');
  const list = document.createElement('div'); list.className = 'editing-font-list'; list.setAttribute('role', 'menu'); list.setAttribute('aria-label', 'Fonts'); popover.append(input, list);
  const fonts = new Set(writingFonts(ctx.canvas.board.cards.flatMap(c => c.props?.font ? [c.props.font] : [])));
  const nodes = cards.map(c => ({ card: c, node: ctx.canvas.mountedEl(c.id) }));
  const preview = font => nodes.forEach(({ card, node }) => { if (node) node.style.fontFamily = font ?? card.props?.font ?? ''; });
  const popup = createPopup({ trigger: anchor, menu: popover, portal: true, role: 'dialog', bindTrigger: false, duration: 160, onToggle(on) { if (!on) { preview(); setTimeout(() => { if (!popup.opened) popup.destroy(); }, 160); } } });
  const close = () => popup.close(true);
  function render() {
    list.replaceChildren(); const search = input.value.trim();
    const matches = [...fonts].filter(font => fontName(font).toLowerCase().includes(search.toLowerCase()));
    if (search && writingFont(search) && !fonts.has(search) && !matches.length && document.fonts.check(`16px ${fontFamily(search)}`)) matches.push(search);
    for (const font of matches) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.tabIndex = -1; b.textContent = fontName(font); b.style.fontFamily = fontFamily(font); b.onpointerenter = () => preview(font); b.onpointerleave = () => preview(); b.onclick = () => { close(); commit(font); }; list.append(b); }
  }
  input.oninput = render; input.onkeydown = e => { e.stopPropagation(); if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('button')?.focus(); } if (e.key === 'Enter') { e.preventDefault(); list.querySelector('button')?.click(); } };
  render(); popup.open(); input.focus(); return close;
}
