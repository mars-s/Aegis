// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// Panel positions, visibility, folds and sizes are kept on this device.
const KEY = 'aegis:panels';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
export function createPanels({ side, onChange }) {
  const saved = read();
  const state = { hidden: saved.hidden ?? true, open: saved.open ?? { left: saved.hidden === false, right: false }, width: saved.width ?? 300, rightWidth: saved.rightWidth ?? 320,
    columns: saved.columns ?? { left: saved.order ?? [], right: [] }, off: saved.off ?? {}, folded: { keys: true, ...saved.folded }, heights: saved.heights ?? {} };
  const right = document.createElement('aside'); right.className = 'side side-right'; right.id = 'sideRight'; right.setAttribute('aria-label', 'Right side bar'); right.innerHTML = '<div class="side-resize" title="Drag to resize"></div>'; side.after(right);
  const agents = document.getElementById('agentsPanel'); agents.hidden = false; right.prepend(agents);
  const timers = {}, arrows = { left: document.getElementById('revealLeft'), right: document.getElementById('revealRight') };
  const close = document.createElement('button'); close.className = 'icon-btn'; close.id = 'closeRight'; close.textContent = '×'; close.setAttribute('aria-label', 'Hide agent activity and panels'); right.prepend(close);
  close.onclick = e => setOpen('right', false, e.detail === 0);
  document.getElementById('closeSide').onclick = e => setOpen('left', false, e.detail === 0);
  for (const key of ['left', 'right']) arrows[key].onclick = e => setOpen(key, true, e.detail === 0);
  let hoverTimers = {};
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    for (const key of ['left', 'right']) {
      const distance = key === 'left' ? e.clientX : innerWidth - e.clientX;
      const inZone = key === 'left' ? e.clientY >= 48 && e.clientY <= 104 : e.clientY < innerHeight - 96;
      if (distance < 20 && inZone && !hoverTimers[key] && !state.open[key] && !arrows[key].classList.contains('show')) hoverTimers[key] = setTimeout(() => { arrows[key].classList.add('show'); hoverTimers[key] = 0; }, 120);
      if (distance > 96 || !inZone) { clearTimeout(hoverTimers[key]); hoverTimers[key] = 0; arrows[key].classList.remove('show'); }
    }
  });
  addEventListener('blur', () => { for (const key of ['left', 'right']) { clearTimeout(hoverTimers[key]); hoverTimers[key] = 0; arrows[key].classList.remove('show'); } });
  const all = new Map(), defaults = [], save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const boxes = col => [...col.querySelectorAll(':scope > .pbox')];
  const persistOrder = () => { state.columns = { left: boxes(side).map(b => b.dataset.panel), right: boxes(right).map(b => b.dataset.panel) }; save(); };
  function apply() {
    // Round 3 navigation: Windows leads its board, with a compact Library beneath it.
    const windows = state.columns.left.includes('layers') ? ['layers'] : [];
    state.columns.left = [...windows, 'library', ...state.columns.left.filter(id => id !== 'library' && id !== 'layers')];
    state.columns.right = state.columns.right.filter(id => id !== 'library');
    for (const [key, col] of [['left', side], ['right', right]]) for (const id of state.columns[key] ?? []) {
      const box = all.get(id); if (box) col.insertBefore(box, col.querySelector('.side-resize'));
    }
    for (const [id, box] of all) {
      box.hidden = !!state.off[id]; box.classList.toggle('folded', !!state.folded[id]);
      box.querySelector('.fold')?.setAttribute('aria-expanded', String(!state.folded[id]));
      box.querySelector('.pbody').style.height = state.heights[id] ? `${state.heights[id]}px` : '';
    }
    syncSides(); onChange?.(state);
  }
  function syncSides(dragging = false, instant = false) {
    for (const [key, col, width] of [['left', side, state.width], ['right', right, state.rightWidth]]) {
      const open = dragging || state.open[key];
      clearTimeout(timers[key]);
      col.style.setProperty('--panel-w', `${width}px`);
      document.documentElement.style.setProperty(key === 'left' ? '--side-w' : '--right-side-w', open ? `${width}px` : '0px');
      col.classList.toggle('instant', instant);
      if (key === 'left') document.getElementById('tools').classList.toggle('instant', instant || dragging);
      if (open) { col.hidden = false; void col.offsetWidth; }
      col.inert = !open;
      col.setAttribute('aria-hidden', String(!open));
      col.classList.toggle('open', open);
      document.body.classList.toggle(`${key}-open`, open);
      arrows[key].setAttribute('aria-expanded', String(open)); arrows[key].classList.remove('show');
      if (!open) {
        if (col.contains(document.activeElement)) arrows[key].focus({ preventScroll: true });
        if (instant) col.hidden = true;
        else timers[key] = setTimeout(() => { if (!state.open[key]) col.hidden = true; }, 200);
      }
    }
    document.getElementById('boardName').setAttribute('aria-expanded', String(state.open.left));
    document.getElementById('agentsBtn').setAttribute('aria-pressed', String(state.open.right));
    state.hidden = !state.open.left && !state.open.right;
  }
  function setOpen(key, open, instant = false) {
    state.open[key] = open; syncSides(false, instant); onChange?.(state); save();
    if (open && instant) (key === 'left' ? side : right).querySelector('button, input')?.focus({ preventScroll: true });
  }
  for (const [key, col] of [['left', side], ['right', right]]) col.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); setOpen(key, false, true); }
  });
  const settings = document.getElementById('settings');
  const section = document.createElement('section'); section.className = 'sheet-sec';
  section.innerHTML = '<h3>Side bar panels</h3><div class="panel-layout-options"></div><button type="button" class="text-btn" data-reset-panels>Reset layout</button>';
  settings?.append(section);
  const options = section.querySelector('.panel-layout-options');
  section.querySelector('[data-reset-panels]').onclick = () => {
    state.columns = { left: [...defaults], right: [] }; state.off = {}; state.folded = { keys: true }; state.heights = {}; state.width = 300; state.rightWidth = 320; state.open = { left: true, right: false }; state.hidden = false;
    for (const id of all.keys()) state.folded[id] = !['layers', 'library', 'unsorted'].includes(id);
    options.querySelectorAll('input').forEach(input => { input.checked = true; }); apply(); save();
  };
  function register(box) {
    const id = box.dataset.panel; if (all.has(id)) return;
    all.set(id, box); defaults.push(id);
    // Secondary tool sections stay reachable without taking space from Windows on first use.
    if (state.folded[id] === undefined) state.folded[id] = !['layers', 'library', 'unsorted'].includes(id);
    if (![...state.columns.left, ...state.columns.right].includes(id)) state.columns.left.push(id);
    const head = box.querySelector('.phead'), body = box.querySelector('.pbody'), fold = box.querySelector('.fold');
    if (fold) fold.onclick = event => {
      const col = box.parentElement, before = new Map(boxes(col).map(b => [b, b.getBoundingClientRect()]));
      state.folded[id] = !box.classList.contains('folded'); apply(); save();
      if (!event.detail || document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      // Round 3 navigation: sections settle with transforms; their scrollers keep their position.
      for (const [section, rect] of before) {
        section.getAnimations().forEach(animation => animation.cancel());
        const y = rect.top - section.getBoundingClientRect().top;
        if (y) section.animate([{ transform: `translateY(${y}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.32,.72,0,1)' });
      }
      if (!state.folded[id]) body.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.23,1,.32,1)' });
    };
    const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = !state.off[id]; input.dataset.panelVisibility = id;
    label.append(input, document.createTextNode(head.querySelector('span')?.childNodes[0]?.textContent?.trim() || id)); options.append(label);
    input.onchange = () => { state.off[id] = !input.checked; apply(); save(); };
    box.querySelector('.resize-handle')?.addEventListener('pointerdown', e => {
      e.preventDefault(); const h0 = body.getBoundingClientRect().height, y0 = e.clientY, handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId); box.classList.add('sizing');
      const move = ev => { body.style.height = `${Math.max(48, Math.min(innerHeight * .8, h0 + ev.clientY - y0))}px`; };
      const up = () => { handle.removeEventListener('pointermove', move); box.classList.remove('sizing'); state.heights[id] = Math.round(body.getBoundingClientRect().height); save(); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up, { once: true });
    });
    head.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.pointerType === 'touch' || id === 'library' || e.target.closest('button, input')) return;
      const x0 = e.clientX, y0 = e.clientY, pointer = e.pointerId;
      const home = box.parentNode, next = box.nextSibling, style = box.style.cssText;
      let dragging = false, slots = [], pick;
      const lift = () => {
        const rect = box.getBoundingClientRect();
        dragging = true; box.classList.add('panel-lifted');
        Object.assign(box.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, maxHeight: '320px', overflow: 'hidden', zIndex: '400', pointerEvents: 'none', margin: '0' });
        document.body.append(box); document.body.classList.add('panel-arranging');
        syncSides(true); side.classList.add('panel-drop'); right.classList.add('panel-drop');
        for (const col of [side, right]) {
          const insertSlot = before => {
            const slot = document.createElement('div'); slot.className = 'panel-slot'; slot.setAttribute('aria-hidden', 'true');
            col.insertBefore(slot, before); slots.push(slot);
          };
          for (const other of boxes(col)) if (!other.hidden && other.dataset.panel !== 'library') insertSlot(other);
          insertSlot(col.querySelector('.side-resize'));
        }
        return { x: x0 - rect.left, y: y0 - rect.top };
      };
      let grip;
      const move = ev => {
        if (ev.pointerId !== pointer) return;
        if (!dragging) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
          grip = lift();
        }
        ev.preventDefault();
        box.style.left = `${ev.clientX - grip.x}px`; box.style.top = `${ev.clientY - grip.y}px`;
        const nearest = slots.reduce((best, slot) => {
          const r = slot.getBoundingClientRect(), distance = Math.hypot(ev.clientX - r.left - r.width / 2, ev.clientY - r.top - r.height / 2);
          return !best || distance < best.distance ? { slot, distance } : best;
        }, null)?.slot;
        if (pick !== nearest) { pick?.classList.remove('on'); pick = nearest; pick?.classList.add('on'); }
      };
      const end = keep => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel); removeEventListener('keydown', escape, true);
        if (!dragging) return;
        if (keep && pick) pick.before(box); else home.insertBefore(box, next?.parentNode === home ? next : home.querySelector('.side-resize'));
        slots.forEach(slot => slot.remove()); box.style.cssText = style;
        box.classList.remove('panel-lifted'); document.body.classList.remove('panel-arranging'); side.classList.remove('panel-drop'); right.classList.remove('panel-drop');
        if (keep) { state.open[box.parentNode === right ? 'right' : 'left'] = true; persistOrder(); } apply();
      };
      const up = ev => { if (ev.pointerId === pointer) end(true); }, cancel = ev => { if (ev.pointerId === pointer) end(false); };
      const escape = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); end(false); } };
      addEventListener('pointermove', move, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', cancel); addEventListener('keydown', escape, true);
    });
  }
  for (const box of boxes(side)) register(box);
  // Feature panels may be mounted after the shell starts.
  const observer = new MutationObserver(() => {
    let changed = false;
    for (const box of [...boxes(side), ...boxes(right)]) if (!all.has(box.dataset.panel)) { register(box); changed = true; }
    if (changed) apply();
  });
  observer.observe(side, { childList: true }); observer.observe(right, { childList: true });
  for (const [col, key, direction] of [[side, 'width', 1], [right, 'rightWidth', -1]]) {
    const edge = col.querySelector('.side-resize'); edge.addEventListener('pointerdown', e => {
      e.preventDefault(); const w0 = state[key], x0 = e.clientX; edge.setPointerCapture(e.pointerId);
      const move = ev => { state[key] = Math.round(Math.max(200, Math.min(420, w0 + direction * (ev.clientX - x0)))); syncSides(false, true); };
      const up = () => { edge.removeEventListener('pointermove', move); save(); };
      edge.addEventListener('pointermove', move); edge.addEventListener('pointerup', up, { once: true });
    });
  }
  apply(); syncSides(false, true);
  return { setOpen, isOpen: key => !!state.open[key], toggle(key = 'left', instant = false) { setOpen(key, !state.open[key], instant); }, get hidden() { return state.hidden; } };
}
