// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
const intersects = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
export function selectionOverflow(bar, changed = () => {}) {
  const items = [...bar.children], more = document.createElement('details'), trigger = document.createElement('summary'), menu = document.createElement('div');
  more.className = 'selection-more'; trigger.textContent = 'More'; trigger.setAttribute('aria-label', 'More selection controls'); menu.className = 'selection-overflow'; more.append(trigger, menu); bar.append(more);
  more.addEventListener('toggle', () => { if (!more.open) changed(); });
  let frame;
  const widths = new Map();
  function fit() {
    frame = 0;
    // Measure controls together, then move them. Open controls keep their nodes, focus and listeners.
    for (const item of items) if (item.parentElement === bar) widths.set(item, item.getBoundingClientRect().width + 4);
    const room = bar.clientWidth - 80; let used = 0;
    const keep = new Set();
    const priority = item => item.tagName === 'STRONG' ? -2 : /^(Bold|Italic|Underline|Text alignment|Align selection|Tilt|Hide header|Show header)$/.test(item.getAttribute('aria-label') || '') || item.dataset.selectionControl ? -1 : 0;
    for (const item of [...items].sort((a, b) => priority(a) - priority(b))) { const width = widths.get(item) || 100; if (used + width <= room) { keep.add(item); used += width; } }
    for (const item of items) if (keep.has(item)) bar.insertBefore(item, more); else menu.append(item);
    more.hidden = !menu.childElementCount;
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
  const observer = new ResizeObserver(schedule); observer.observe(bar); schedule();
  const outside = e => { if (!more.contains(e.target)) more.open = false; };
  const escape = e => { if (e.key === 'Escape' && more.open) { e.stopPropagation(); more.open = false; trigger.focus(); } };
  addEventListener('pointerdown', outside); more.addEventListener('keydown', escape);
  return () => { cancelAnimationFrame(frame); observer.disconnect(); removeEventListener('pointerdown', outside); };
}

export function selectionPosition(canvas, bar, outline) {
  let frame, chromeDirty = true, leftEdge = 12, rightEdge = innerWidth - 12, composerTop = innerHeight - 90, barWidth = 600, barHeight = 44;
  const strips = [...outline.querySelectorAll('.selection-move')], rotation = outline.querySelector('.rotation-handle'), resize = outline.querySelector('.selection-resize');
  const observer = new ResizeObserver(() => { chromeDirty = true; schedule(); });
  for (const el of [bar, ...document.querySelectorAll('.side,.tools,.panel,#composer')]) observer.observe(el);
  addEventListener('resize', () => { chromeDirty = true; schedule(); });
  let current = [], locked = false, indexedCards, byId = new Map();
  function position() {
    frame = 0; if (!current.length || bar.hidden) return;
    if (chromeDirty) {
      const left = [...document.querySelectorAll('.side:not(.side-right):not([hidden]) .pbox,.tools')].map(el => el.getBoundingClientRect()).filter(r => r.width);
      const right = [...document.querySelectorAll('.side-right:not([hidden]) .pbox,.panel:not([hidden])')].map(el => el.getBoundingClientRect()).filter(r => r.width);
      leftEdge = Math.max(12, ...left.map(r => r.right + 12)); rightEdge = Math.min(innerWidth - 12, ...right.map(r => r.left - 12));
      if (rightEdge - leftEdge < 240) { leftEdge = 12; rightEdge = innerWidth - 12; }
      composerTop = document.getElementById('composer')?.getBoundingClientRect().top ?? innerHeight - 90;
      const r = bar.getBoundingClientRect(); barWidth = r.width; barHeight = r.height; chromeDirty = false;
    }
    const project = c => { const p = canvas.worldToScreen(c.x, c.y), q = canvas.worldToScreen(c.x + c.w, c.y + c.h); return { left: p.x, top: p.y, right: q.x, bottom: q.y }; };
    const rects = current.map(c => canvas.mountedEl(c.id)?.getBoundingClientRect()).filter(r => r?.width);
    const boxes = rects.length === current.length ? rects : current.map(project);
    const p = { x: Math.min(...boxes.map(r => r.left)), y: Math.min(...boxes.map(r => r.top)) }, q = { x: Math.max(...boxes.map(r => r.right)), y: Math.max(...boxes.map(r => r.bottom)) };
    const width = Math.min(barWidth, rightEdge - leftEdge), left = Math.max(leftEdge, Math.min(rightEdge - width, (p.x + q.x - width) / 2)), above = p.y - barHeight - 42;
    const floatingBox = { left, right: left + width, top: above, bottom: above + barHeight }, selectionBox = { left: p.x - 10, right: q.x + 10, top: p.y - 10, bottom: q.y + 10 };
    const chosen = new Set(current.map(c => c.id)), nearby = [];
    if (indexedCards !== canvas.board.cards) { indexedCards = canvas.board.cards; byId = new Map(indexedCards.map(c => [c.id, c])); }
    // Only mounted roots can cover the bar or a grab strip. Never visit their descendants.
    for (const el of document.getElementById('world').children) {
      if (!el.classList.contains('card') || chosen.has(el.dataset.id)) continue;
      const c = byId.get(el.dataset.id); if (!c) continue;
      const projected = project(c), margin = c.rot ? Math.hypot(c.w, c.h) * canvas.view.z / 2 : 24 * canvas.view.z;
      const broad = { left: projected.left - margin, right: projected.right + margin, top: projected.top - margin, bottom: projected.bottom + margin };
      if (!intersects(broad, floatingBox) && !intersects(broad, selectionBox)) continue;
      const r = el.getBoundingClientRect();
      if (r.width && (intersects(r, floatingBox) || intersects(r, selectionBox))) nearby.push({ r, z: Number(el.style.zIndex) || 0 });
    }
    const selectedZ = Math.min(...current.map(c => Number(canvas.mountedEl(c.id)?.style.zIndex) || 0));
    const stripBoxes = [
      { left: p.x + 8, right: q.x - 8, top: p.y - 9, bottom: p.y - 1 },
      { left: p.x + 8, right: q.x - 8, top: q.y + 1, bottom: q.y + 9 },
      { left: p.x - 9, right: p.x - 1, top: p.y + 8, bottom: q.y - 8 },
      { left: q.x + 1, right: q.x + 9, top: p.y + 8, bottom: q.y - 8 },
    ];
    const blocked = stripBoxes.map(r => nearby.some(n => n.z > selectedZ && intersects(n.r, r)));
    const dock = composerTop - barHeight - 12, floating = above >= 50 && !nearby.some(n => intersects(n.r, floatingBox));
    const top = floating ? above : dock >= q.y + 8 || dock + barHeight <= p.y - 32 ? dock : 50;
    // All geometry reads finish before these writes.
    Object.assign(outline.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${q.x - p.x}px`, height: `${q.y - p.y}px` });
    strips.forEach((strip, i) => { strip.style.pointerEvents = blocked[i] ? 'none' : ''; strip.hidden = locked; });
    rotation.hidden = locked || current.some(c => ['frame', 'section', 'coll', 'ink'].includes(c.type)); resize.hidden = locked;
    Object.assign(bar.style, { maxWidth: `${rightEdge - leftEdge}px`, left: `${left}px`, top: `${top}px` }); bar.classList.toggle('docked', !floating); bar.classList.toggle('menu-below', top < innerHeight / 2);
  }
  function schedule() { if (current.length && !frame) frame = requestAnimationFrame(position); }
  return (cards, isLocked) => { current = cards; locked = isLocked; schedule(); };
}
