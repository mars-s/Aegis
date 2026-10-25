// The side bar: a stack of panels that fold, resize and reorder. Layout is per device, kept in localStorage.
const KEY = 'aegis:panels';

export function createPanels({ side, onChange }) {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  const state = { hidden: !!saved.hidden, width: saved.width ?? 248, order: saved.order ?? [], folded: saved.folded ?? {}, heights: saved.heights ?? {} };
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const boxes = () => [...side.querySelectorAll(':scope > .pbox')];

  // Restore order, fold and height.
  for (const id of state.order) { const b = side.querySelector(`.pbox[data-panel="${id}"]`); if (b) side.insertBefore(b, side.querySelector('.side-resize')); }
  for (const box of boxes()) {
    const id = box.dataset.panel, body = box.querySelector('.pbody');
    if (state.folded[id]) box.classList.add('folded');
    if (state.heights[id]) body.style.height = state.heights[id] + 'px';
    const fold = box.querySelector('.fold');
    const sync = () => { fold.setAttribute('aria-expanded', String(!box.classList.contains('folded'))); fold.title = box.classList.contains('folded') ? 'Show' : 'Fold'; };
    sync();
    fold.onclick = () => { box.classList.toggle('folded'); state.folded[id] = box.classList.contains('folded'); sync(); save(); };
    // Resize from the bottom edge.
    box.querySelector('.resize-handle')?.addEventListener('pointerdown', e => {
      e.preventDefault(); const h0 = body.getBoundingClientRect().height, y0 = e.clientY, el = e.currentTarget;
      el.setPointerCapture(e.pointerId); box.classList.add('sizing');
      const move = ev => { body.style.height = Math.max(48, Math.min(innerHeight * 0.8, h0 + ev.clientY - y0)) + 'px'; };
      const up = () => { el.removeEventListener('pointermove', move); box.classList.remove('sizing'); state.heights[id] = Math.round(body.getBoundingClientRect().height); save(); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up, { once: true });
    });
    // Reorder by dragging the header.
    const head = box.querySelector('.phead');
    head.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button, input')) return;
      const y0 = e.clientY; let dragging = false;
      head.setPointerCapture(e.pointerId);
      const move = ev => {
        if (!dragging && Math.abs(ev.clientY - y0) < 4) return;
        dragging = true; box.classList.add('lifting');
        for (const other of boxes()) {
          if (other === box) continue;
          const r = other.getBoundingClientRect(), mid = r.top + r.height / 2;
          const before = box.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING;
          if (before && ev.clientY > mid) { other.after(box); break; }
          if (!before && ev.clientY < mid) { other.before(box); break; }
        }
      };
      const up = () => { head.removeEventListener('pointermove', move); box.classList.remove('lifting'); if (dragging) { state.order = boxes().map(b => b.dataset.panel); save(); } };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up, { once: true });
    });
  }

  // The side bar's right edge sets its width.
  const edge = side.querySelector('.side-resize');
  edge.addEventListener('pointerdown', e => {
    e.preventDefault(); const w0 = state.width, x0 = e.clientX; edge.setPointerCapture(e.pointerId);
    const move = ev => { state.width = Math.round(Math.max(200, Math.min(420, w0 + ev.clientX - x0))); apply(); };
    const up = () => { edge.removeEventListener('pointermove', move); save(); };
    edge.addEventListener('pointermove', move); edge.addEventListener('pointerup', up, { once: true });
  });

  function apply() {
    side.hidden = state.hidden;
    document.documentElement.style.setProperty('--side-w', state.hidden ? '0px' : state.width + 'px');
    onChange?.(state);
  }
  apply();
  return {
    toggle() { state.hidden = !state.hidden; apply(); save(); },
    get hidden() { return state.hidden; },
  };
}
