// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
export function fontPicker(anchor, cards, ctx, commit) {
  const popover = document.createElement('div'); popover.className = 'editing-font-picker';
  const input = document.createElement('input'); input.placeholder = 'Search fonts'; input.setAttribute('aria-label', 'Search fonts');
  const list = document.createElement('div'); list.className = 'editing-font-list'; popover.append(input, list);
  const fonts = new Set(['system-ui', 'serif', 'sans-serif', 'monospace']);
  ctx.canvas.board.cards.forEach(c => { if (c.props?.font) fonts.add(c.props.font); });
  document.fonts.forEach(f => fonts.add(f.family.replaceAll('"', '')));
  const nodes = cards.map(c => ({ card: c, node: ctx.canvas.mountedEl(c.id) }));
  const preview = font => nodes.forEach(({ card, node }) => { if (node) node.style.fontFamily = font ?? card.props?.font ?? ''; });
  const close = () => { preview(); popover.remove(); removeEventListener('pointerdown', outside, true); };
  const outside = e => { if (!popover.contains(e.target) && e.target !== anchor) close(); };
  function render() {
    list.replaceChildren(); const search = input.value.trim();
    const matches = [...fonts].filter(font => font.toLowerCase().includes(search.toLowerCase()));
    if (search && !fonts.has(search) && document.fonts.check(`16px "${search.replaceAll('"', '')}"`)) matches.push(search);
    for (const font of matches) { const b = document.createElement('button'); b.type = 'button'; b.textContent = font; b.style.fontFamily = font; b.onpointerenter = () => preview(font); b.onpointerleave = () => preview(); b.onclick = () => { close(); commit(font); }; list.append(b); }
  }
  input.oninput = render; input.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') close(); if (e.key === 'Enter') list.querySelector('button')?.click(); };
  const r = anchor.getBoundingClientRect(); Object.assign(popover.style, { left: `${Math.max(12, Math.min(innerWidth - 272, r.left))}px`, top: `${Math.max(52, Math.min(innerHeight - 300, r.bottom + 6))}px` }); document.body.append(popover); addEventListener('pointerdown', outside, true); render(); input.focus(); return close;
}
