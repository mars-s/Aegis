import { createPopup } from '../lib/ui/dropdown.js';
// A small context menu: items grouped by section, keyboard friendly, closes on Escape or outside click.
export function createMenu() {
  const el = document.createElement('div'); el.className = 'ctx-menu'; el.setAttribute('role', 'menu'); el.hidden = true;
  document.body.appendChild(el);
  const popup = createPopup({ menu: el });
  const close = () => popup.close();
  return {
    show(x, y, items, event) {
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
      popup.close(); popup.open(event, { x, y });
      el.querySelector('button')?.focus();
    },
    close,
  };
}
