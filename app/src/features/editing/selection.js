// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// Position once in canvaspaint, using selected roots only and cached chrome sizes.
const intersects = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
export function selectionPosition(canvas, bar, outline) {
  let chromeDirty = true, barWidth = 280, barHeight = 38, hubTop = innerHeight - 80;
  const strips = [...outline.querySelectorAll('.selection-move')], rotation = outline.querySelector('.rotation-handle'), resize = outline.querySelector('.selection-resize');
  const observer = new ResizeObserver(() => { chromeDirty = true; schedule(); });
  for (const el of [bar, document.getElementById('mobileHub')].filter(Boolean)) observer.observe(el);
  addEventListener('resize', () => { chromeDirty = true; schedule(); });
  let current = [], locked = false, indexedCards, byId = new Map();
  function position() {
    if (!current.length) return;
    if (chromeDirty || !bar.hidden && (barWidth !== bar.offsetWidth || barHeight !== bar.offsetHeight)) {
      if (!bar.hidden) { barWidth = bar.offsetWidth; barHeight = bar.offsetHeight; }
      const hub = document.getElementById('mobileHub')?.getBoundingClientRect(); hubTop = hub?.height ? hub.top : innerHeight - 80;
      chromeDirty = false;
    }
    const project = c => { const p = canvas.worldToScreen(c.x, c.y), q = canvas.worldToScreen(c.x + c.w, c.y + c.h); return { left: p.x, top: p.y, right: q.x, bottom: q.y }; };
    const rects = current.map(c => canvas.representationRect(c.id)).filter(r => r?.width);
    const boxes = rects.length === current.length ? rects : current.map(project);
    const p = { x: Math.min(...boxes.map(r => r.left)), y: Math.min(...boxes.map(r => r.top)) }, q = { x: Math.max(...boxes.map(r => r.right)), y: Math.max(...boxes.map(r => r.bottom)) };
    const phone = innerWidth <= 700 || document.body.classList.contains('phone');
    const width = Math.min(barWidth, innerWidth - 24), left = Math.max(12, Math.min(innerWidth - width - 12, (p.x + q.x - width) / 2));
    const hasRotation = !locked && !current.some(c => ['frame', 'section', 'coll', 'ink'].includes(c.type));
    const gap = hasRotation ? 40 : 10;
    const above = p.y - barHeight - gap, below = q.y + 12;
    const top = phone ? hubTop - barHeight - 10 : Math.max(8, Math.min(innerHeight - barHeight - 12, above >= 8 ? above : below));
    const selectionBox = { left: p.x - 10, right: q.x + 10, top: p.y - 10, bottom: q.y + 10 };
    const chosen = new Set(current.map(c => c.id)), nearby = [];
    if (indexedCards !== canvas.board.cards) { indexedCards = canvas.board.cards; byId = new Map(indexedCards.map(c => [c.id, c])); }
    // Only mounted roots can cover a grab strip. Never visit their descendants.
    for (const el of document.getElementById('world').children) {
      if (!el.classList.contains('card') || chosen.has(el.dataset.id)) continue;
      const c = byId.get(el.dataset.id); if (!c) continue;
      const projected = project(c), margin = c.rot ? Math.hypot(c.w, c.h) * canvas.view.z / 2 : 24 * canvas.view.z;
      const broad = { left: projected.left - margin, right: projected.right + margin, top: projected.top - margin, bottom: projected.bottom + margin };
      if (!intersects(broad, selectionBox)) continue;
      const r = canvas.representationRect(c.id); if (!r) continue;
      if (r.width && intersects(r, selectionBox)) nearby.push({ r, z: Number(el.style.zIndex) || 0 });
    }
    const selectedZ = Math.min(...current.map(c => Number(canvas.mountedEl(c.id)?.style.zIndex) || 0));
    const stripBoxes = [
      { left: p.x + 8, right: q.x - 8, top: p.y - 9, bottom: p.y - 1 },
      { left: p.x + 8, right: q.x - 8, top: q.y + 1, bottom: q.y + 9 },
      { left: p.x - 9, right: p.x - 1, top: p.y + 8, bottom: q.y - 8 },
      { left: q.x + 1, right: q.x + 9, top: p.y + 8, bottom: q.y - 8 },
    ];
    const blocked = stripBoxes.map(r => nearby.some(n => n.z > selectedZ && intersects(n.r, r)));
    // All geometry reads finish before these writes.
    Object.assign(outline.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${q.x - p.x}px`, height: `${q.y - p.y}px` });
    strips.forEach((strip, i) => { strip.style.pointerEvents = blocked[i] ? 'none' : ''; strip.hidden = locked; });
    rotation.hidden = !hasRotation; resize.hidden = locked;
    Object.assign(bar.style, { left: `${phone ? 10 : left}px`, top: `${top}px` }); bar.classList.toggle('docked', phone);
  }
  function schedule() { if (current.length) canvas.redraw(); }
  return (cards, isLocked) => { current = cards; locked = isLocked; position(); };
}
