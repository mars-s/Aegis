// R4 orientation: collect at most 30 names during the existing visible-card pass.
export function createOrientation(stage, getView, schedule, onPick) {
  // Keep the engine importable by host geometry checks, which do not load stylesheets.
  const style = document.createElement('style');
  // PM4.3: only names accept input. The matching outline and leader pass it through.
  style.textContent = `.canvas-orientation { position: absolute; inset: 0; z-index: 100005; pointer-events: none; overflow: hidden; }
    .canvas-orientation span { position: absolute; box-sizing: border-box; max-width: 160px; padding: 2px 4px; border-radius: 3px; background: rgb(0 0 0 / .8); color: var(--muted); font: 400 11px/16px var(--font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .8; pointer-events: auto; }
    .canvas-orientation span:focus-visible { outline: 1px solid var(--text); outline-offset: 1px; }
    .canvas-orientation span:is(:hover, :focus) { color: var(--text); opacity: 1; }
    .canvas-orientation .orientation-more { position: absolute; min-width: 64px; min-height: 44px; padding: 8px 12px; pointer-events: auto; background: var(--pill); border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font: 400 12px/16px var(--font); }
    .canvas-orientation .orientation-more:is(:hover, :focus-visible) { color: var(--text); border-color: var(--line-strong); }
    .canvas-orientation .orientation-more:focus-visible { outline: 1px solid var(--text); outline-offset: 2px; }
    .orientation-aid { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; color: var(--data); }
    .orientation-aid rect, .orientation-aid line { fill: none; stroke: currentColor; stroke-width: 1; }
    @media (pointer: coarse) { .canvas-orientation span { min-height: 44px; padding-block: 14px; } }`;
  stage.append(style);
  const layer = document.createElement('div'); layer.className = 'canvas-orientation'; layer.hidden = true;
  layer.setAttribute('role', 'group'); layer.setAttribute('aria-label', 'Window names'); stage.append(layer);
  const aid = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); aid.classList.add('orientation-aid'); aid.setAttribute('aria-hidden', 'true'); aid.innerHTML = '<rect/><line/>'; aid.style.display = 'none'; layer.append(aid);
  const labels = new Map();
  let edge = false, near = false, hovered, layout = [], active = false, candidates = [], minimum = 0;
  let visible = [], moreMenu;
  const nameOf = card => String(card.props?.layerName || card.heading || card.text?.split('\n').find(Boolean) || card.kind || card.type).slice(0, 80);
  const more = document.createElement('button'); more.type = 'button'; more.className = 'orientation-more aegis-button aegis-button--quiet'; more.hidden = true; layer.append(more);
  more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false');
  // PM5.6: load the shared menu only on demand, keeping host geometry imports free of CSS.
  async function showMore(event) {
    if (event.type === 'click' && moreMenu?.opened) { moreMenu.close(); return; }
    if (!moreMenu) {
      const { createMenu } = await import('../lib/ui/menu.js');
      if (more.hidden || layer.hidden) return;
      moreMenu = createMenu({ trigger: more, bindTrigger: false, label: 'More window names', heading: 'More windows',
        items: () => visible.filter(card => !labels.has(card.id)).map(card => ({ title: nameOf(card), run: event => { stage.focus({ preventScroll: true }); onPick?.(card.id, event.detail === 0); } })),
        onToggle: () => schedule(),
      });
    }
    if (!more.hidden && !layer.hidden) {
      moreMenu.open(event);
      if (['ArrowUp', 'End'].includes(event.key)) moreMenu.menu.querySelector('button:last-of-type')?.focus({ preventScroll: true });
    }
  }
  more.addEventListener('click', showMore);
  more.addEventListener('keydown', event => { if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); showMore(event); } });
  let width = 0, height = 0, view;
  const labelHeight = () => matchMedia('(pointer: coarse)').matches ? 44 : 20;
  function paintAid() {
    const id = hovered || (layer.contains(document.activeElement) ? document.activeElement.dataset.cardId : undefined);
    const entry = layout.find(item => item.card.id === id);
    aid.style.display = entry ? '' : 'none';
    if (!entry) { delete aid.dataset.cardId; return; }
    aid.dataset.cardId = id;
    const { x, y, w, h, left, top, label } = entry, rect = aid.querySelector('rect'), line = aid.querySelector('line');
    for (const [key, value] of Object.entries({ x, y, width: w, height: h })) rect.setAttribute(key, String(value));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lx = clamp(x + w / 2, left, left + label.offsetWidth), ly = clamp(y + h / 2, top, top + labelHeight());
    for (const [key, value] of Object.entries({ x1: lx, y1: ly, x2: clamp(lx, x, x + w), y2: clamp(ly, y, y + h) })) line.setAttribute(key, String(value));
  }
  addEventListener('pointermove', event => {
    // PM5.3: actual pointer movement takes ownership back, even within a parked label.
    hovered = event.buttons ? undefined : event.target.closest?.('.canvas-orientation span')?.dataset.cardId;
    if (active) paintAid();
    const next = !event.buttons && Math.min(event.clientX, event.clientY, innerWidth - event.clientX, innerHeight - event.clientY) < 48;
    if (getView().z >= .2) { edge = next; near = false; return; }
    const bounds = stage.getBoundingClientRect(), px = event.clientX - bounds.left, py = event.clientY - bounds.top;
    const approach = !event.buttons && (event.target === more || layout.some(r => px >= r.left - 24 && px <= r.left + r.label.offsetWidth + 24 && py >= r.top - 24 && py <= r.top + labelHeight() + 24));
    if (next !== edge || approach !== near) { edge = next; near = approach; if (getView().z < .2) schedule(); }
  }, { passive: true });
  layer.addEventListener('pointerover', event => { hovered = event.target.closest('span')?.dataset.cardId; paintAid(); });
  layer.addEventListener('pointerout', event => { if (!event.target.contains(event.relatedTarget)) { hovered = undefined; paintAid(); } });
  layer.addEventListener('pointerdown', event => event.stopPropagation());
  layer.addEventListener('click', event => event.stopPropagation());
  layer.addEventListener('focusin', paintAid);
  layer.addEventListener('focusout', () => { paintAid(); schedule(); });
  stage.addEventListener('focus', () => schedule());
  stage.addEventListener('blur', () => schedule());
  stage.addEventListener('keydown', () => { hovered = undefined; paintAid(); if (getView().z < .2) schedule(); });
  addEventListener('blur', () => { edge = near = false; hovered = undefined; if (getView().z < .2) schedule(); });
  return {
    get active() { return active; },
    begin() {
      active = stage.dataset.zoomTier !== 'cluster' && getView().z < .2 && document.hasFocus() && (edge || near || moreMenu?.opened || layer.contains(document.activeElement) || document.activeElement === stage && stage.matches(':focus-visible'));
      candidates = []; visible = []; minimum = 0;
      if (active) { width = stage.clientWidth; height = stage.clientHeight; view = getView(); }
    },
    consider(card) {
      const x = card.x * view.z + view.x, y = card.y * view.z + view.y;
      const w = card.w * view.z, h = card.h * view.z, area = w * h;
      if (x + w <= 0 || y + h <= 0 || x >= width || y >= height) return;
      visible.push(card);
      if (area <= minimum) return;
      candidates.push({ card, x, y, w, h, area });
      candidates.sort((a, b) => b.area - a.area);
      if (candidates.length > 30) candidates.pop();
      if (candidates.length === 30) minimum = candidates[29].area;
    },
    paint() {
      layer.hidden = !active;
      if (!active) { moreMenu?.close(false, true); hovered = undefined; aid.style.display = 'none'; delete aid.dataset.cardId; return; }
      const occupied = [];
      layout = candidates.flatMap(({ card, x, y, w: cardWidth, h }) => {
        const label = labels.get(card.id) || document.createElement('span'); label.dataset.cardId = card.id; label.tabIndex = 0;
        label.textContent = nameOf(card);
        const left = Math.max(8, Math.min(width - 168, x)), w = Math.min(160, label.textContent.length * 6.5 + 8);
        const lh = labelHeight();
        const top = [0, -1, 1, -2, 2, -3, 3].map(offset => Math.max(8, Math.min(height - lh - 4, y - lh - 8 + offset * lh))).find(top => (top + lh <= y - 4 || top >= y + h + 4) && !occupied.some(r => left < r.x + r.w && left + w > r.x && top < r.y + lh && top + lh > r.y));
        if (top === undefined) return [];
        occupied.push({ x: left, y: top, w });
        label.style.left = `${left}px`; label.style.top = `${top}px`;
        if (!labels.has(card.id)) { labels.set(card.id, label); layer.append(label); }
        return [{ card, x, y, w: cardWidth, h, left, top, label }];
      });
      for (const [id, label] of labels) if (!layout.some(r => r.card.id === id)) { label.remove(); labels.delete(id); }
      // Keep the chip after labels in the keyboard order. Its list also includes names beyond the label cap.
      const omitted = visible.length - layout.length;
      more.hidden = !omitted; more.textContent = `+${omitted} more`; more.setAttribute('aria-label', `Show ${omitted} more windows`);
      if (layer.lastChild !== more) layer.append(more);
      // PM6.6: put omitted names beside the displayed cluster, then clamp to the stage.
      if (omitted) {
        const bounds = layout.length ? layout.map(r => ({ left: r.left, top: r.top, right: r.left + r.label.offsetWidth, bottom: r.top + labelHeight() })) : candidates.map(r => ({ left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h }));
        const left = Math.min(...bounds.map(r => r.left)), right = Math.max(...bounds.map(r => r.right));
        const top = Math.min(...bounds.map(r => r.top)), bottom = Math.max(...bounds.map(r => r.bottom));
        const w = more.offsetWidth, h = more.offsetHeight, gap = 12;
        const x = right + gap + w <= width - 8 ? right + gap : left - gap - w >= 8 ? left - gap - w : left;
        const y = x === left ? bottom + gap : (top + bottom - h) / 2;
        more.style.left = `${Math.max(8, Math.min(width - w - 8, x))}px`;
        more.style.top = `${Math.max(8, Math.min(height - h - 8, y))}px`;
      }
      if (!omitted) moreMenu?.close(false, true);
      paintAid();
    },
  };
}
