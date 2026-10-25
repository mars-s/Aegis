// A small context menu: items grouped by section, keyboard friendly, closes on Escape or outside click.
export function createMenu() {
  const el = document.createElement('div'); el.className = 'ctx-menu'; el.setAttribute('role', 'menu'); el.hidden = true;
  document.body.appendChild(el);
  const close = () => { el.hidden = true; el.textContent = ''; };
  addEventListener('pointerdown', e => { if (!el.hidden && !el.contains(e.target)) close(); }, true);
  addEventListener('keydown', e => { if (!el.hidden && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
  addEventListener('blur', close);
  return {
    show(x, y, items) {
      el.textContent = '';
      let section;
      const sorted = [...items].sort((a, b) => (a.section ?? '').localeCompare(b.section ?? ''));
      for (const it of sorted) {
        if (section !== undefined && it.section !== section) { const sep = document.createElement('div'); sep.className = 'ctx-sep'; el.appendChild(sep); }
        section = it.section;
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = it.title;
        b.onclick = () => { close(); it.run(); };
        el.appendChild(b);
      }
      el.hidden = false;
      const r = el.getBoundingClientRect();
      el.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; el.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
      el.querySelector('button')?.focus();
    },
    close,
  };
}
