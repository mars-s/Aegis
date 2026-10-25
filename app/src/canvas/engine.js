// The canvas: cards as DOM in one transformed layer, only the visible ones mounted.
// Pan and zoom change one transform; a card re-renders only when its own data changes.
const MARGIN = 400;          // px of world kept mounted beyond the viewport
const FAR = 0.4;             // below this zoom, cards show as outlines
const MIN_Z = 0.05, MAX_Z = 4;

export function createCanvas({ stage, world, grid, links, marquee, onBatch, onSelect, onOpenUrl, onPlace, resolveUrl = u => u, renderObject, dropObject }) {
  let board = null;
  let view = { x: 0, y: 0, z: 1 };
  const mounted = new Map();      // id -> { el, sig }
  const selected = new Set();
  const rings = new Map();        // card id -> colour, cards an agent touched recently
  let frame = 0, dirtyAll = true;
  let tool = null;                // armed tool: the next click on empty canvas places it
  const ctx = grid.getContext('2d');

  // ---------- view ----------
  function schedule(all = false) { dirtyAll ||= all; if (!frame) frame = requestAnimationFrame(paint); }
  function screenToWorld(sx, sy) { return { x: (sx - view.x) / view.z, y: (sy - view.y) / view.z }; }
  function setView(v, save = true) {
    view = { x: v.x, y: v.y, z: Math.min(MAX_Z, Math.max(MIN_Z, v.z)) };
    schedule(); if (save) saveViewSoon();
  }
  let viewT = 0;
  const saveViewSoon = () => { clearTimeout(viewT); viewT = setTimeout(() => board && onBatch?.view?.(view), 500); };

  function paint() {
    frame = 0;
    world.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.z})`;
    const far = view.z < FAR;
    stage.classList.toggle('far', far);
    drawGrid();
    // Far out, cards are drawn as shapes on the grid canvas instead of mounted as DOM.
    if (far) { unmountAll(); drawShapes(); } else mountVisible();
    drawLinks();
    dirtyAll = false;
  }
  function removeEl(el) { if (el.classList.contains('object')) dropObject?.(el.querySelector('.object-host')); el.remove(); }
  function unmountAll() {
    for (const [id, m] of mounted) { if (m.el.contains(document.activeElement)) continue; removeEl(m.el); mounted.delete(id); }
  }
  function drawShapes() {
    if (!board) return;
    const css = getComputedStyle(document.documentElement);
    const r = visibleRect(), z = view.z;
    const fills = { plain: css.getPropertyValue('--card'), gray: css.getPropertyValue('--c-gray'), blue: css.getPropertyValue('--c-blue'), green: css.getPropertyValue('--c-green'),
      yellow: css.getPropertyValue('--c-yellow'), orange: css.getPropertyValue('--c-orange'), red: css.getPropertyValue('--c-red'), purple: css.getPropertyValue('--c-purple') };
    const line = css.getPropertyValue('--line-strong'), text = css.getPropertyValue('--text');
    ctx.lineWidth = 1;
    for (const c of board.cards) {
      if (c.x > r.x1 || c.x + c.w < r.x0 || c.y > r.y1 || c.y + c.h < r.y0) continue;
      const x = c.x * z + view.x, y = c.y * z + view.y, w = c.w * z, h = (c.type === 'title' ? 56 : c.h) * z;
      if (c.type === 'title') { ctx.fillStyle = text; ctx.fillRect(x, y + h * 0.3, Math.min(w, (c.text.length || 4) * 14 * z), Math.max(2, h * 0.4)); continue; }
      ctx.fillStyle = fills[c.color] || fills.plain; ctx.fillRect(x, y, w, h);
      if (w > 6) { ctx.strokeStyle = line; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
      if (selected.has(c.id)) { ctx.strokeStyle = css.getPropertyValue('--focus'); ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); ctx.lineWidth = 1; }
    }
  }

  function drawGrid() {
    const dpr = devicePixelRatio || 1, w = stage.clientWidth, h = stage.clientHeight;
    if (grid.width !== w * dpr || grid.height !== h * dpr) { grid.width = w * dpr; grid.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    let step = 24 * view.z; while (step < 14) step *= 2; while (step > 48) step /= 2;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--dot');
    const ox = ((view.x % step) + step) % step, oy = ((view.y % step) + step) % step;
    const r = Math.max(0.6, Math.min(1.1, view.z));
    for (let x = ox; x < w; x += step) for (let y = oy; y < h; y += step) { ctx.fillRect(x - r / 2, y - r / 2, r, r); }
  }

  // ---------- cards ----------
  function visibleRect() {
    const a = screenToWorld(-MARGIN, -MARGIN), b = screenToWorld(stage.clientWidth + MARGIN, stage.clientHeight + MARGIN);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }
  function mountVisible() {
    if (!board) return;
    const r = visibleRect(); const keep = new Set();
    board.cards.forEach((c, z) => {
      if (c.x > r.x1 || c.x + c.w < r.x0 || c.y > r.y1 || c.y + c.h < r.y0) return;
      keep.add(c.id);
      const sig = signature(c), geo = geometry(c);
      let m = mounted.get(c.id);
      if (!m) { m = { el: renderCard(c), sig, geo: '', z: -1 }; world.appendChild(m.el); mounted.set(c.id, m); }
      else if (m.sig !== sig && !(m.el.contains(document.activeElement) && document.activeElement.isContentEditable)) {
        // Content changed: redraw the card. Moves and resizes only re-place it, so a playing video keeps playing.
        const refocus = m.el.contains(document.activeElement) && document.activeElement.matches('.add-item');
        const el = renderCard(c); if (m.el.classList.contains('object')) dropObject?.(m.el.querySelector('.object-host')); m.el.replaceWith(el); m.el = el; m.geo = ''; m.z = -1;
        if (refocus) el.querySelector('.add-item')?.focus();
      }
      m.sig = sig;
      if (m.geo !== geo) { place(m.el, c); m.geo = geo; }
      if (m.z !== z) { m.el.style.zIndex = z; m.z = z; }
      const el = m.el;
      el.classList.toggle('selected', selected.has(c.id));
      if (rings.has(c.id)) { el.classList.add('agent-ring'); el.style.setProperty('--ring', rings.get(c.id)); } else el.classList.remove('agent-ring');
    });
    for (const [id, m] of mounted) if (!keep.has(id)) { if (m.el.contains(document.activeElement)) continue; removeEl(m.el); mounted.delete(id); }
  }
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const signature = c => JSON.stringify([c.type, c.text, c.heading, c.badge, c.color, c.items, c.url, c.kind, c.ver, c.type === 'object' ? c.data : null]);
  const geometry = c => `${c.x},${c.y},${c.w},${c.h}`;
  function place(el, c) { el.style.transform = `translate(${c.x}px, ${c.y}px)`; el.style.width = c.w + 'px'; el.style.height = c.type === 'title' ? 'auto' : c.h + 'px'; }

  function renderCard(c) {
    const el = document.createElement('div');
    el.className = `card ${c.type}`; el.dataset.id = c.id; el.dataset.color = c.color || 'plain';
    place(el, c);
    const ghost = '<div class="ghost"><i style="width:70%"></i><i style="width:90%"></i><i style="width:50%"></i></div>';
    if (c.type === 'object') {
      // A typed object: Svelte draws it into the host element; the canvas still owns drag, resize and select.
      el.classList.add(`kind-${c.kind}`);
      el.innerHTML = '<div class="drag-strip" title="Drag to move"></div><div class="object-host"></div><div class="resize"></div>';
      renderObject?.(el.querySelector('.object-host'), c);
      return el;
    }
    if (c.badge || c.heading) el.classList.add('has-head');
    if (c.badge) { const b = document.createElement('span'); b.className = 'badge'; b.contentEditable = 'plaintext-only'; b.textContent = c.badge; el.appendChild(b); }
    if (c.heading) { const h = document.createElement('div'); h.className = 'heading'; h.contentEditable = 'plaintext-only'; h.textContent = c.heading; el.appendChild(h); }
    if (c.type === 'todo') {
      el.insertAdjacentHTML('beforeend', `<div class="label body" contenteditable="plaintext-only"></div><div class="items"></div><input class="add-item" placeholder="Add item" aria-label="Add checklist item">${ghost}`);
      el.querySelector('.label').textContent = c.text;
      const items = el.querySelector('.items');
      (c.items ?? []).forEach((it, i) => {
        const row = document.createElement('label'); row.className = 'todo-item' + (it.done ? ' done' : '');
        row.innerHTML = '<input type="checkbox"><span></span>'; row.querySelector('span').textContent = it.text;
        const box = row.querySelector('input'); box.checked = it.done;
        box.addEventListener('change', () => { const next = c.items.map((x, j) => j === i ? { ...x, done: box.checked } : x); onBatch.apply([{ op: 'update', id: c.id, set: { items: next } }]); });
        items.appendChild(row);
      });
      const add = el.querySelector('.add-item');
      add.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') add.blur();
        if (e.key !== 'Enter' || !add.value.trim()) return;
        onBatch.apply([{ op: 'update', id: c.id, set: { items: [...(c.items ?? []), { text: add.value.trim(), done: false }] } }]);
      });
    } else if (c.type === 'link' && !c.url) {
      // A new link card asks for its address.
      el.innerHTML = `<input class="url-input" placeholder="Paste a link" aria-label="Link address" spellcheck="false">${ghost}`;
      const input = el.querySelector('input');
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') input.blur();
        if (e.key === 'Enter' && input.value.trim()) { const v = input.value.trim(); onBatch.apply([{ op: 'update', id: c.id, set: { url: /^[a-z]+:/i.test(v) ? v : 'https://' + v } }]); }
      });
    } else if (c.type === 'link') {
      el.innerHTML = `<div class="body" contenteditable="plaintext-only"></div><a href="#"></a>${ghost}`;
      el.querySelector('.body').textContent = c.text || hostOf(c.url); const a = el.querySelector('a'); a.textContent = c.url;
      a.addEventListener('click', e => { e.preventDefault(); onOpenUrl?.(c.url); });
    } else if (c.type === 'image') {
      el.innerHTML = `<img alt="" draggable="false" decoding="async" loading="lazy">`;
      const img = el.querySelector('img'); img.src = resolveUrl(c.url); img.alt = c.text || 'Image';
    } else if (c.type === 'video') {
      el.innerHTML = `<div class="media-head"><span></span></div><video controls preload="metadata" playsinline></video>`;
      el.querySelector('.media-head span').textContent = c.text || 'Video';
      el.querySelector('video').src = resolveUrl(c.url);
    } else if (c.type === 'web') {
      el.innerHTML = `<div class="web-head"><span class="url"></span></div><div class="web-body"><div class="body" contenteditable="plaintext-only"></div><small>Live pages arrive in a later build.</small></div>${ghost}`;
      el.querySelector('.url').textContent = c.url; el.querySelector('.body').textContent = c.text;
    } else {
      el.insertAdjacentHTML('beforeend', `<div class="body" contenteditable="plaintext-only"></div>${ghost}`);
      el.querySelector('.body').textContent = c.text;
    }
    if (c.type !== 'title') el.insertAdjacentHTML('beforeend', '<div class="resize"></div>');
    el.querySelectorAll('.body, .heading, .badge').forEach(body => {
      const field = body.classList.contains('heading') ? 'heading' : body.classList.contains('badge') ? 'badge' : 'text';
      body.addEventListener('blur', () => {
        const value = field === 'text' ? body.textContent : body.textContent.trim(); const cur = board.cards.find(x => x.id === c.id);
        if (cur && value !== (cur[field] ?? '')) onBatch.apply([{ op: 'update', id: c.id, set: { [field]: value } }]);
      });
      body.addEventListener('keydown', e => { if (e.key === 'Escape') body.blur(); e.stopPropagation(); });
    });
    return el;
  }

  function drawLinks() {
    if (!board) return;
    const parts = [];
    const by = new Map(board.cards.map(c => [c.id, c]));
    for (const l of board.links) {
      const a = by.get(l.a), b = by.get(l.b); if (!a || !b) continue;
      // Leave from the side facing the other card, so lines never run under cards.
      const horizontal = Math.abs((b.x + b.w / 2) - (a.x + a.w / 2)) * a.h >= Math.abs((b.y + b.h / 2) - (a.y + a.h / 2)) * a.w;
      const s = p => ({ x: p.x * view.z + view.x, y: p.y * view.z + view.y });
      let p1, p2;
      if (horizontal) {
        const right = b.x + b.w / 2 > a.x + a.w / 2;
        p1 = s({ x: right ? a.x + a.w : a.x, y: a.y + Math.min(a.h, 120) / 2 }); p2 = s({ x: right ? b.x : b.x + b.w, y: b.y + Math.min(b.h, 120) / 2 });
        const mx = (p1.x + p2.x) / 2;
        parts.push(`<path d="M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}"/>`);
      } else {
        const down = b.y > a.y;
        p1 = s({ x: a.x + a.w / 2, y: down ? a.y + a.h : a.y }); p2 = s({ x: b.x + b.w / 2, y: down ? b.y : b.y + b.h });
        const my = (p1.y + p2.y) / 2;
        parts.push(`<path d="M${p1.x},${p1.y} C${p1.x},${my} ${p2.x},${my} ${p2.x},${p2.y}"/>`);
      }
    }
    links.innerHTML = parts.join('');
  }

  // ---------- input ----------
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 1) return;
    const cardEl = e.target.closest('.card');
    // Inside an object, controls (buttons, inputs, sort headers) and text selection work as normal.
    if (cardEl?.classList.contains('object') && !e.target.closest('.drag-strip, .resize') && e.target.closest('button, input, select, a, summary, details, th, .sheet, pre')) return;
    if (e.target.isContentEditable && document.activeElement === e.target) return;
    if (e.target.closest('input, a, video')) return;
    stage.focus({ preventScroll: true });
    if (cardEl && e.button === 0) {
      const id = cardEl.dataset.id;
      if (e.shiftKey || e.metaKey) { selected.has(id) ? selected.delete(id) : selected.add(id); }
      else if (!selected.has(id)) { selected.clear(); selected.add(id); }
      onSelect?.([...selected]);
      const start = screenToWorld(e.clientX, e.clientY);
      const resize = e.target.classList.contains('resize');
      const cards = [...selected].map(sid => board.cards.find(c => c.id === sid)).filter(Boolean);
      drag = { kind: resize ? 'resize' : 'move', start, sx: e.clientX, sy: e.clientY, moved: false, cards: cards.map(c => ({ c, x: c.x, y: c.y, w: c.w, h: c.h })), target: id };
      if (!resize && e.target.closest('.body, .heading, .badge')) drag.maybeEdit = e.target.closest('.body, .heading, .badge');
      stage.setPointerCapture(e.pointerId); schedule(); e.preventDefault(); return;
    }
    if (e.button === 1 || spaceHeld) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; stage.classList.add('panning'); stage.setPointerCapture(e.pointerId); return; }
    if (tool) { const t = tool; setTool(null); onPlace?.(t, screenToWorld(e.clientX, e.clientY)); e.preventDefault(); return; }
    // empty canvas: marquee select
    selected.clear(); onSelect?.([]);
    drag = { kind: 'marquee', sx: e.clientX, sy: e.clientY };
    stage.setPointerCapture(e.pointerId); schedule();
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (drag.kind === 'pan') { setView({ x: drag.vx + dx, y: drag.vy + dy, z: view.z }); return; }
    if (drag.kind === 'marquee') {
      const x = Math.min(e.clientX, drag.sx), y = Math.min(e.clientY, drag.sy), w = Math.abs(dx), h = Math.abs(dy);
      Object.assign(marquee.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); marquee.hidden = w + h < 4;
      const a = screenToWorld(x, y), b = screenToWorld(x + w, y + h);
      selected.clear(); for (const c of board.cards) if (c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y) selected.add(c.id);
      schedule(); return;
    }
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    const wdx = dx / view.z, wdy = dy / view.z;
    for (const d of drag.cards) {
      if (drag.kind === 'move') { d.c.x = Math.round(d.x + wdx); d.c.y = Math.round(d.y + wdy); }
      else if (d.c.id === drag.target) { d.c.w = Math.max(80, Math.round(d.w + wdx)); d.c.h = Math.max(40, Math.round(d.h + wdy)); }
      const m = mounted.get(d.c.id); if (m) { place(m.el, d.c); m.el.classList.add('dragging'); m.geo = geometry(d.c); }
    }
    drawLinks();
  });
  stage.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null; stage.classList.remove('panning'); marquee.hidden = true;
    if (d.kind === 'move' || d.kind === 'resize') {
      for (const x of d.cards) mounted.get(x.c.id)?.el.classList.remove('dragging');
      if (d.moved) {
        const cmds = d.kind === 'move' ? d.cards.map(x => ({ op: 'move', id: x.c.id, x: x.c.x, y: x.c.y }))
          : d.cards.filter(x => x.c.id === d.target).map(x => ({ op: 'update', id: x.c.id, set: { w: x.c.w, h: x.c.h } }));
        onBatch.apply(cmds);
      } else if (d.maybeEdit) { d.maybeEdit.focus(); placeCaret(d.maybeEdit); }
    }
    onSelect?.([...selected]); schedule();
  });
  stage.addEventListener('dblclick', e => {
    if (e.target.closest('.card')) return;
    const p = screenToWorld(e.clientX, e.clientY);
    onBatch.apply([{ op: 'create', type: 'note', text: '', x: Math.round(p.x - 120), y: Math.round(p.y - 30), ref: 'n' }], created => {
      requestAnimationFrame(() => mounted.get(created.n)?.el.querySelector('.body')?.focus());
    });
  });
  stage.addEventListener('wheel', e => {
    const scroller = !e.ctrlKey && !e.metaKey && e.target.closest?.('.card.object.selected .content');
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) return; // a selected object scrolls its own content
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {           // pinch or ⌘-scroll: zoom about the pointer
      const z = Math.min(MAX_Z, Math.max(MIN_Z, view.z * Math.exp(-e.deltaY * 0.01)));
      const p = screenToWorld(e.clientX, e.clientY);
      setView({ x: e.clientX - p.x * z, y: e.clientY - p.y * z, z });
    } else setView({ x: view.x - e.deltaX, y: view.y - e.deltaY, z: view.z });
  }, { passive: false });
  let spaceHeld = false;
  addEventListener('keydown', e => {
    if (e.target.closest?.('textarea, input, [contenteditable], select')) return;
    if (e.code === 'Space') { spaceHeld = true; e.preventDefault(); }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selected.size) { onBatch.apply([{ op: 'delete', ids: [...selected] }]); selected.clear(); }
    if (e.key === '0') fit();
    if ((e.key === ']' || e.key === '[') && selected.size) onBatch.apply([{ op: 'order', ids: board.cards.filter(c => selected.has(c.id)).map(c => c.id), to: e.key === ']' ? 'front' : 'back' }]);
    if (e.key === 'Escape') { if (tool) setTool(null); else if (selected.size) { selected.clear(); onSelect?.([]); schedule(); } }
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); board.cards.forEach(c => selected.add(c.id)); schedule(); }
  });
  addEventListener('keyup', e => { if (e.code === 'Space') spaceHeld = false; });
  addEventListener('resize', () => schedule(true));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => schedule(true));

  function setTool(t) { tool = t; stage.classList.toggle('placing', !!t); stage.dispatchEvent(new CustomEvent('tool', { detail: t })); }
  function placeCaret(el) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

  // ---------- camera ----------
  let anim = 0;
  function glideTo(target, ms = 420) {
    cancelAnimationFrame(anim);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(target); return; }
    const from = { ...view }, t0 = performance.now(); const ease = t => 1 - Math.pow(1 - t, 3);
    const step = now => { const t = Math.min(1, (now - t0) / ms), k = ease(t);
      setView({ x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, z: from.z + (target.z - from.z) * k }, t === 1);
      if (t < 1) anim = requestAnimationFrame(step); };
    anim = requestAnimationFrame(step);
  }
  function frameIds(ids, maxZ = 1) {
    const cards = board.cards.filter(c => ids.includes(c.id)); if (!cards.length) return;
    const x0 = Math.min(...cards.map(c => c.x)), y0 = Math.min(...cards.map(c => c.y));
    const x1 = Math.max(...cards.map(c => c.x + c.w)), y1 = Math.max(...cards.map(c => c.y + c.h));
    // Frame inside the free area: right of the side bar and tool bar, above the composer.
    const left = Math.max(0, ...[...document.querySelectorAll('.side:not([hidden]) .pbox, .tools')].map(el => el.getBoundingClientRect().right)) + 24;
    const W = stage.clientWidth - left, H = stage.clientHeight - 160, pad = 56;
    const z = Math.min(maxZ, (W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0));
    glideTo({ x: left + W / 2 - ((x0 + x1) / 2) * z, y: 44 + H / 2 - ((y0 + y1) / 2) * z, z: Math.max(MIN_Z, z) });
  }
  function fit() { if (board?.cards.length) frameIds(board.cards.map(c => c.id)); else glideTo({ x: stage.clientWidth / 2, y: stage.clientHeight / 2, z: 1 }); }
  function glow(ids) {
    for (const id of ids) { const el = mounted.get(id)?.el; if (el) { el.classList.remove('glow'); void el.offsetWidth; el.classList.add('glow'); } }
  }

  return {
    setBoard(next, { keepView = true } = {}) {
      const first = !board || board.id !== next.id;
      board = next;
      if (first) { for (const m of mounted.values()) removeEl(m.el); mounted.clear(); selected.clear(); view = next.view ?? { x: 0, y: 0, z: 1 }; if (!next.view || (next.view.x === 0 && next.view.y === 0)) view = { x: stage.clientWidth / 2 - 200, y: stage.clientHeight / 3, z: 1 }; }
      schedule(true);
      return first;
    },
    get board() { return board; },
    get view() { return view; },
    selection: () => [...selected],
    frameIds, glow, fit, setTool,
    get tool() { return tool; },
    busy: () => !!drag,
    select(ids) { selected.clear(); for (const id of ids) selected.add(id); onSelect?.([...selected]); schedule(); },
    // Put the caret in a card's first editable field (or its link box).
    edit(id) { requestAnimationFrame(() => { const el = mounted.get(id)?.el; const f = el?.querySelector('.url-input, .body'); if (f) { f.focus(); if (f.isContentEditable) placeCaret(f); } }); },
    ring(ids, colour, ms = 4000) { for (const id of ids) rings.set(id, colour); schedule(); setTimeout(() => { for (const id of ids) if (rings.get(id) === colour) rings.delete(id); schedule(); }, ms); },
    centre: () => screenToWorld(stage.clientWidth / 2, stage.clientHeight / 2),
    stats: () => ({ mounted: mounted.size, cards: board?.cards.length ?? 0, z: view.z }),
  };
}
