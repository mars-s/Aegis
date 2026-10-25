// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// The canvas: cards as DOM in one transformed layer, only the visible ones mounted.
// Pan and zoom change one transform; a card re-renders only when its own data changes.
import { effectiveFlag } from '../features/editing/model.js';
import { drawGridMotif } from '../features/editing/grid.js';
import { mountTouch } from '../features/mobile/touch.js';
import { displayRotation, preference } from '../features/settings/preferences.js';

const MARGIN = 400;          // px of world kept mounted beyond the viewport
const FAR = 0.4;             // below this zoom, cards show as outlines
const MIN_Z = 0.05, MAX_Z = 4;
const WINDOWS = new Set(['object', 'doc', 'image', 'video', 'audio', 'spotify', 'link', 'web', 'frame', 'deck', 'slides', 'canvas', 'font']);

// Card renderers from feature modules: type -> { render(el, card, api), drop?(el), interactive?: css selector }.
// render fills `el` (already a positioned .card) and wires its own events; api lets it change the board.
const RENDERERS = new Map();
export function registerRenderer(type, renderer) { RENDERERS.set(type, renderer); }

// A feature resolves a board drag to an action. Accepted drops restore the source positions first.
const cardDropTargets = new Set();
export function registerCardDropTarget(resolve) { cardDropTargets.add(resolve); return () => cardDropTargets.delete(resolve); }
function resolveCardDrop(cards, event) {
  let action;
  for (const resolve of cardDropTargets) action = resolve({ cards, x: event.clientX, y: event.clientY }) || action;
  return action;
}

// Shared geometry for drawing links and their editing handles. Pins follow rotated cards.
export function linkGeometry(link, a, b) {
  const centre = c => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
  const rotate = (p, c, sign = 1) => { const m = centre(c), t = displayRotation(c) * Math.PI / 180 * sign, x = p.x - m.x, y = p.y - m.y; return { x: m.x + x * Math.cos(t) - y * Math.sin(t), y: m.y + x * Math.sin(t) + y * Math.cos(t) }; };
  const edge = (c, pin, target) => {
    if (pin) return rotate({ x: c.x + pin.u * c.w, y: c.y + pin.v * c.h }, c);
    const m = centre(c), q = rotate(target, c, -1), dx = q.x - m.x, dy = q.y - m.y;
    const k = Math.min(dx ? c.w / 2 / Math.abs(dx) : Infinity, dy ? c.h / 2 / Math.abs(dy) : Infinity);
    return rotate({ x: m.x + dx * (Number.isFinite(k) ? k : 0), y: m.y + dy * (Number.isFinite(k) ? k : 0) }, c);
  };
  const p0 = edge(a, link.pa, centre(b)), p2 = edge(b, link.pb, centre(a));
  const dx = p2.x - p0.x, dy = p2.y - p0.y, len = Math.hypot(dx, dy) || 1;
  const n = { x: -dy / len, y: dx / len }, mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 }, bend = link.bend ?? Math.min(80, len * .2);
  return { p0, p2, mid, n, control: { x: mid.x + n.x * bend, y: mid.y + n.y * bend }, handle: { x: mid.x + n.x * bend / 2, y: mid.y + n.y * bend / 2 } };
}

// Optional feature hooks. select/start expand a drag, snap adjusts its delta, end adds commands.
const DRAG_HANDLERS = new Map();
export function registerDragHandler(id, handler) { DRAG_HANDLERS.set(id, handler); return () => DRAG_HANDLERS.delete(id); }

export function createCanvas({ stage, world, grid, links, marquee, onBatch, onSelect, onOpenUrl, onPlace, onOpenCard, onContext, pointerTool, resolveUrl = u => u, renderObject, dropObject }) {
  let board = null;
  let view = { x: 0, y: 0, z: 1 };
  const guides = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  guides.classList.add('drag-guides');
  Object.assign(guides.style, { position: 'absolute', inset: '0', width: '1px', height: '1px', overflow: 'visible', pointerEvents: 'none', zIndex: '2147483647', color: 'var(--focus, #ed65a6)' });
  world.appendChild(guides);
  function drawGuides(lines = []) {
    guides.replaceChildren(...lines.map(g => {
      const line = document.createElementNS(guides.namespaceURI, 'line');
      for (const k of ['x1', 'y1', 'x2', 'y2']) line.setAttribute(k, String(g[k]));
      line.setAttribute('stroke', 'currentColor'); line.setAttribute('stroke-width', String(1 / view.z));
      return line;
    }));
  }
  const mounted = new Map();      // id -> { el, sig }
  const selected = new Set();
  let focusIds = null;
  let focusedId = null;
  const frameFocusStyle = document.createElement('style');
  world.appendChild(frameFocusStyle);
  let parents = new Map();
  function frameAncestors(card) {
    const ids = [], seen = new Set([card.id]);
    let id = card.parent;
    while (id && !seen.has(id)) { seen.add(id); ids.push(id); id = parents.get(id); }
    return ids.join(' ');
  }
  const flashes = new Map();
  const agentSvg = document.createElementNS(guides.namespaceURI, 'svg');
  agentSvg.setAttribute('class', 'agent-line');
  agentSvg.setAttribute('width', '1'); agentSvg.setAttribute('height', '1');
  agentSvg.setAttribute('aria-hidden', 'true');
  world.appendChild(agentSvg);
  let lineCards = new Map(), lineTimer = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function settleAgentLine() { agentSvg.getAnimations({ subtree: true }).forEach(a => a.finish()); }
  reduced.addEventListener('change', () => { if (reduced.matches) settleAgentLine(); });
  new MutationObserver(() => { if (document.body.classList.contains('motion-off')) settleAgentLine(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
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

  let crispTimer;
  function paint() {
    frame = 0;
    const crisp = localStorage.getItem('aegis:crisp') === 'on' && view.z > 1.02;
    if (!crisp || Number(world.style.zoom) !== view.z) { world.style.zoom = ''; world.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.z})`; }
    else world.style.transform = `translate(${view.x / view.z}px, ${view.y / view.z}px)`;
    clearTimeout(crispTimer);
    if (crisp) crispTimer = setTimeout(() => { world.style.zoom = String(view.z); world.style.transform = `translate(${view.x / view.z}px, ${view.y / view.z}px)`; }, 450);
    const far = view.z < FAR;
    stage.classList.toggle('far', far);
    stage.style.backgroundColor = board?.bg || '';
    drawGrid();
    // Far out, cards are drawn as shapes on the grid canvas instead of mounted as DOM.
    if (far) { unmountAll(); drawShapes(); } else mountVisible();
    drawLinks();
    stage.dispatchEvent(new CustomEvent('canvaspaint'));
    dirtyAll = false;
  }
  function removeEl(el) {
    if (el.classList.contains('object')) dropObject?.(el.querySelector('.object-host'));
    RENDERERS.get(el.dataset.type)?.drop?.(el);
    el.remove();
  }
  function unmountAll() {
    for (const [id, m] of mounted) { if (m.el.contains(document.activeElement)) continue; removeEl(m.el); mounted.delete(id); }
  }
  function drawShapes() {
    if (!board) return;
    const css = getComputedStyle(document.documentElement);
    const r = visibleRect(), z = view.z;
    const fills = { plain: css.getPropertyValue('--card'), gray: css.getPropertyValue('--c-gray'), blue: css.getPropertyValue('--c-blue'), green: css.getPropertyValue('--c-green'),
      yellow: css.getPropertyValue('--c-yellow'), orange: css.getPropertyValue('--c-orange'), red: css.getPropertyValue('--c-red'), purple: css.getPropertyValue('--c-purple') };
    const line = css.getPropertyValue('--line'), text = css.getPropertyValue('--text'), strip = css.getPropertyValue('--strip'), edge = css.getPropertyValue('--edge-top');
    ctx.lineWidth = 1;
    for (const c of board.cards) {
      if (effectiveFlag(board, c, 'hidden')) continue;
      if (c.x > r.x1 || c.x + c.w < r.x0 || c.y > r.y1 || c.y + c.h < r.y0) continue;
      const x = c.x * z + view.x, y = c.y * z + view.y, w = c.w * z, h = (c.type === 'title' ? 56 : c.h) * z;
      if (c.type === 'title') { ctx.fillStyle = text; ctx.fillRect(x, y + h * 0.3, Math.min(w, (c.text.length || 4) * 14 * z), Math.max(2, h * 0.4)); continue; }
      ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : fills[c.color] || fills.plain;
      const rounded = w > 24 && h > 12;
      if (rounded) { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(8 * z, h / 2)); ctx.fill(); }
      else ctx.fillRect(x, y, w, h);
      if (WINDOWS.has(c.type) && h > 12) { ctx.fillStyle = strip; ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), Math.min(36 * z, h - 2)); }
      if (w > 6) { ctx.strokeStyle = line; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
      if (w > 12) { ctx.fillStyle = edge; ctx.fillRect(x + 1, y + 1, w - 2, 1); }
      if (selected.has(c.id)) { ctx.strokeStyle = css.getPropertyValue('--focus'); ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); ctx.lineWidth = 1; }
    }
  }

  function drawGrid() {
    const dpr = devicePixelRatio || 1, w = stage.clientWidth, h = stage.clientHeight;
    if (grid.width !== w * dpr || grid.height !== h * dpr) { grid.width = w * dpr; grid.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    let step = 58.4 * view.z; while (step < 26) step *= 2;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--dot');
    const shape = localStorage.getItem('aegis:grid') || 'dots';
    if (shape === 'none') return;
    ctx.globalAlpha = Math.max(0.25, Math.min(1, (view.z - 0.18) / 0.4));
    if (shape === 'lines') { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.beginPath(); for (let x = view.x % step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); } for (let y = view.y % step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke(); }
    else {
      const ox = (((view.x + 16.5 * view.z) % step) + step) % step, oy = (((view.y + 25.5 * view.z) % step) + step) % step;
      for (let x = ox; x < w; x += step) for (let y = oy; y < h; y += step) { if (!drawGridMotif(ctx, shape, x, y)) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5); }
    }
    ctx.globalAlpha = 1;
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
      if (effectiveFlag(board, c, 'hidden')) return;
      if (c.x > r.x1 || c.x + c.w < r.x0 || c.y > r.y1 || c.y + c.h < r.y0) return;
      keep.add(c.id);
      const sig = signature(c), geo = geometry(c);
      let m = mounted.get(c.id);
      if (!m) { m = { el: renderCard(c), sig, geo: '', z: -1 }; world.appendChild(m.el); mounted.set(c.id, m); }
      else if (m.sig !== sig && !(m.el.contains(document.activeElement) && document.activeElement.isContentEditable)) {
        // Content changed: redraw the card. Moves and resizes only re-place it, so a playing video keeps playing.
        const refocus = m.el.contains(document.activeElement) && document.activeElement.matches('.add-item');
        const el = renderCard(c); if (m.el.classList.contains('object')) dropObject?.(m.el.querySelector('.object-host')); RENDERERS.get(m.el.dataset.type)?.drop?.(m.el); m.el.replaceWith(el); m.el = el; m.geo = ''; m.z = -1;
        if (refocus) el.querySelector('.add-item')?.focus();
      }
      m.sig = sig;
      if (m.geo !== geo) { place(m.el, c); m.geo = geo; }
      if (m.z !== z) { m.el.style.zIndex = z; m.el.style.setProperty('--card-order', z); m.z = z; }
      const el = m.el;
      el.classList.toggle('selected', selected.has(c.id));
      el.classList.toggle('locked', effectiveFlag(board, c, 'locked'));
      el.classList.toggle('focus-dim', !!focusIds && !focusIds.has(c.id));
    });
    for (const [id, m] of mounted) if (!keep.has(id)) { if (m.el.contains(document.activeElement)) continue; removeEl(m.el); mounted.delete(id); }
  }
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const signature = c => JSON.stringify([c.type, c.text, c.heading, c.badge, c.color, c.items, c.url, c.kind, c.ver, c.type === 'object' ? c.data : null, c.props, c.rot, c.parent]);
  const geometry = c => `${c.x},${c.y},${c.w},${c.h},${displayRotation(c)}`;
  function place(el, c) { el.style.transform = `translate(${c.x}px, ${c.y}px)${displayRotation(c) ? ` rotate(${displayRotation(c)}deg)` : ''}`; el.style.width = c.w + 'px'; el.style.height = c.type === 'title' ? 'auto' : c.h + 'px'; }
  // What a renderer may do to the board.
  const cardApi = {
    apply: (cmds, done) => onBatch.apply(cmds, done),
    setProps: (id, props) => onBatch.apply([{ op: 'update', id, set: { props } }]),
    resolveUrl: u => resolveUrl(u),
    openUrl: u => onOpenUrl?.(u),
    open: (card) => onOpenCard?.(card),
    get board() { return board; },
    get view() { return view; },
  };

  function renderCard(c) {
    const el = document.createElement('div');
    el.className = `card ${c.type}`; el.dataset.id = c.id; el.dataset.type = c.type;
    if (WINDOWS.has(c.type)) el.classList.add('window-card');
    if (c.id === focusedId) el.classList.add('window-focus');
    if (c.parent) el.dataset.ancestors = frameAncestors(c);
    if (flashes.has(c.id)) el.classList.add('glow');
    if (/^#/.test(c.color ?? '')) { el.dataset.color = 'custom'; el.style.setProperty('--card-fill', c.color); } else el.dataset.color = c.color || 'plain';
    place(el, c);
    const style = c.props ?? {};
    if (c.type === 'frame') el.style.setProperty('--frame-opacity', style.opacity ?? 1);
    for (const [key, value] of Object.entries({ fontWeight: style.bold === undefined ? ['title', 'coll'].includes(c.type) ? '650' : '' : style.bold ? '700' : '400', fontStyle: style.italic ? 'italic' : '', textDecoration: [style.under ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' '), textAlign: style.align || '', fontSize: style.size ? `${style.size}px` : ['note', 'todo', 'shape', 'coll'].includes(c.type) ? '15px' : '', fontFamily: style.font || '', lineHeight: style.lh || '', letterSpacing: style.ls ? `${style.ls}px` : '', textTransform: ({ upper: 'uppercase', lower: 'lowercase', title: 'capitalize' })[style.tcase] || '' })) el.style[key] = value;
    if (style.tag) { const tag = document.createElement('div'); tag.className = 'card-tag'; tag.contentEditable = 'plaintext-only'; tag.textContent = style.tag; tag.onblur = () => cardApi.setProps(c.id, { tag: tag.textContent.trim() || null }); tag.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); tag.blur(); } }; el.append(tag); }
    const custom = RENDERERS.get(c.type);
    if (custom) {
      try { custom.render(el, c, cardApi); } catch (err) { el.textContent = `Could not draw this ${c.type}: ${err.message}`; }
      if (!el.querySelector('.resize') && custom.resizable !== false) el.insertAdjacentHTML('beforeend', '<div class="resize"></div>');
      return el;
    }
    const ghost = '<div class="ghost"><i style="width:70%"></i><i style="width:90%"></i><i style="width:50%"></i></div>';
    if (c.type === 'object') {
      // A typed object: Svelte draws it into the host element; the canvas still owns drag, resize and select.
      el.classList.add(`kind-${c.kind}`);
      el.innerHTML = '<div class="object-host"></div><div class="resize"></div>';
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
        const row = document.createElement('div'); row.className = 'todo-item' + (it.done ? ' done' : '');
        row.innerHTML = '<input type="checkbox"><span contenteditable="plaintext-only"></span><button class="remove-item" aria-label="Remove item">×</button>'; row.querySelector('span').textContent = it.text;
        const field = row.querySelector('span');
        const saveItems = items => onBatch.apply([{ op: 'update', id: c.id, set: { items } }]);
        field.onblur = () => { const current = board.cards.find(x => x.id === c.id); if (!current?.items[i]) return; const text = field.textContent.trim(); if (text !== current.items[i].text) saveItems(text ? current.items.map((x, j) => j === i ? { ...x, text } : x) : current.items.filter((_, j) => j !== i)); };
        field.onkeydown = e => { e.stopPropagation(); const current = board.cards.find(x => x.id === c.id); if (!current) return; if (e.key === 'Enter' || (e.key === 'Backspace' && !field.textContent)) { e.preventDefault(); const items = structuredClone(current.items), text = field.textContent.trim(); const add = e.key === 'Enter' && !!text; if (add) { items[i].text = text; items.splice(i + 1, 0, { text: '', done: false }); } else if (!text) items.splice(i, 1); field.onblur = null; field.blur(); saveItems(items); requestAnimationFrame(() => { const el = mounted.get(c.id)?.el; (add ? el?.querySelectorAll('.todo-item span')[i + 1] : el?.querySelectorAll('.todo-item span')[Math.max(0, i - 1)])?.focus(); }); } };
        row.querySelector('.remove-item').onclick = () => saveItems((board.cards.find(x => x.id === c.id)?.items ?? []).filter((_, j) => j !== i));
        const box = row.querySelector('input'); box.checked = it.done; box.setAttribute('aria-label', it.text || 'Checklist item');
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
    if (style.tag && !el.querySelector('.card-tag')) { const tag = document.createElement('div'); tag.className = 'card-tag'; tag.contentEditable = 'plaintext-only'; tag.textContent = style.tag; tag.onblur = () => cardApi.setProps(c.id, { tag: tag.textContent.trim() || null }); el.prepend(tag); }
    if (c.type !== 'title') el.insertAdjacentHTML('beforeend', '<div class="resize"></div>');
    el.querySelectorAll('.body, .heading, .badge').forEach(body => {
      const field = body.classList.contains('heading') ? 'heading' : body.classList.contains('badge') ? 'badge' : 'text';
      body.addEventListener('input', () => { if (['note', 'todo'].includes(c.type)) el.style.height = `${Math.max(c.h, el.scrollHeight)}px`; });
      body.addEventListener('blur', () => {
        const value = field === 'text' ? body.textContent : body.textContent.trim(); const cur = board.cards.find(x => x.id === c.id);
        if (cur && value !== (cur[field] ?? '')) onBatch.apply([{ op: 'update', id: c.id, set: { [field]: value, ...(['note', 'todo'].includes(c.type) ? { h: Math.max(cur.h, el.scrollHeight) } : c.type === 'title' ? { h: Math.max(24, el.offsetHeight) } : {}) } }]);
      });
      body.addEventListener('keydown', e => { if (e.key === 'Escape') body.blur(); e.stopPropagation(); });
    });
    return el;
  }

  function drawLinks() {
    if (!board) return;
    const parts = [], by = new Map(board.cards.map(c => [c.id, c]));
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const screen = p => ({ x: p.x * view.z + view.x, y: p.y * view.z + view.y });
    for (const l of board.links) {
      const a = by.get(l.a), b = by.get(l.b); if (!a || !b || effectiveFlag(board, a, 'hidden') || effectiveFlag(board, b, 'hidden')) continue;
      const g = linkGeometry(l, a, b), p = screen(g.p0), q = screen(g.p2), c = screen(g.control), h = screen(g.handle);
      const d = `M${p.x} ${p.y} Q${c.x} ${c.y} ${q.x} ${q.y}`;
      const colour = /^#[0-9a-f]{6}$/i.test(l.colour ?? '') ? l.colour : 'var(--line-strong)';
      parts.push(`<path class="link-line" data-link-line="${esc(l.id)}" d="${d}" style="stroke:${colour}"${l.dash ? ' stroke-dasharray="8 6"' : ''}/>`);
      const arrow = (tip, from) => { const dx = tip.x - from.x, dy = tip.y - from.y, len = Math.hypot(dx, dy) || 1, x = dx / len, y = dy / len; return `<path d="M${tip.x - x * 11 - y * 5} ${tip.y - y * 11 + x * 5} L${tip.x} ${tip.y} L${tip.x - x * 11 + y * 5} ${tip.y - y * 11 - x * 5}" style="stroke:${colour}"/>`; };
      if (l.arrow === 'end' || l.arrow === 'both' || l.arrow === true) parts.push(arrow(q, c));
      if (l.arrow === 'both') parts.push(arrow(p, c));
      parts.push(`<path class="link-hit" data-link="${esc(l.id)}" d="${d}" style="stroke:transparent;stroke-width:16;pointer-events:stroke"/>`);
      if (l.label) parts.push(`<text class="link-label" x="${h.x}" y="${h.y - 12}" text-anchor="middle">${esc(l.label)}</text>`);
    }
    links.innerHTML = parts.join('');
  }

  // ---------- input ----------
  // Focus changes only the old and new card, never every card during a paint.
  function focusCard(id) {
    if (id === focusedId) return;
    mounted.get(focusedId)?.el.classList.remove('window-focus');
    focusedId = id;
    mounted.get(id)?.el.classList.add('window-focus');
  }
  stage.addEventListener('pointerdown', e => {
    stage.classList.remove('instant-focus');
    const el = e.target.closest('.card');
    if (el && e.button === 0) focusCard(el.dataset.id);
  }, true);
  stage.addEventListener('focusin', e => { const el = e.target.closest('.card'); if (el) focusCard(el.dataset.id); });
  addEventListener('keydown', () => stage.classList.add('instant-focus'), true);
  let drag = null;
  let ptr = null; // a pointer-driven tool's gesture in progress
  mountTouch({ stage, getView: () => view, setView, getTool: () => tool });
  stage.addEventListener('pointerdown', e => {
    const pt = tool && e.button === 0 && !spaceHeld ? pointerTool?.(tool) : null;
    if (pt && !e.target.closest('.resize')) { ptr = pt; stage.setPointerCapture(e.pointerId); pt.down(e, screenToWorld(e.clientX, e.clientY)); e.preventDefault(); return; }
    if (e.button !== 0 && e.button !== 1) return;
    const cardEl = e.target.closest('.card');
    if (cardEl && effectiveFlag(board, board.cards.find(c => c.id === cardEl.dataset.id), 'locked')) { e.preventDefault(); return; }
    // Inside an object, controls (buttons, inputs, sort headers) and text selection work as normal.
    if (cardEl?.classList.contains('object') && !e.target.closest('.win-strip, .drag-strip, .resize') && e.target.closest('button, input, select, a, summary, details, th, .sheet, pre')) return;
    if (cardEl && RENDERERS.get(cardEl.dataset.type)?.interactive && e.target.closest(RENDERERS.get(cardEl.dataset.type).interactive) && !e.target.closest('.resize')) return;
    if (e.target.isContentEditable && document.activeElement === e.target) return;
    if (e.target.closest('input, button, a, video')) return;
    stage.focus({ preventScroll: true });
    if (cardEl && e.button === 0) {
      const id = cardEl.dataset.id;
      if (e.metaKey || e.ctrlKey) { selected.clear(); selected.add(id); }
      else if (e.shiftKey) { selected.has(id) ? selected.delete(id) : selected.add(id); }
      else if (!selected.has(id)) { selected.clear(); selected.add(id); }
      let ids = [...selected];
      for (const h of DRAG_HANDLERS.values()) ids = h.select?.(ids, id, board, e) ?? ids;
      selected.clear(); ids.forEach(id => selected.add(id));
      onSelect?.([...selected]);
      const start = screenToWorld(e.clientX, e.clientY);
      const resize = e.target.classList.contains('resize');
      let cards = [...selected].map(sid => board.cards.find(c => c.id === sid)).filter(Boolean);
      if (!resize) for (const h of DRAG_HANDLERS.values()) cards = h.start?.(cards, board, e) ?? cards;
      cards = cards.filter(c => !effectiveFlag(board, c, 'locked'));
      drag = { kind: resize ? 'resize' : 'move', start, sx: e.clientX, sy: e.clientY, moved: false, cards: cards.map(c => ({ c, x: c.x, y: c.y, w: c.w, h: c.h })), target: id };
      if (!resize && e.target.closest('.body, .heading, .badge, .card-tag, .collection-head, .todo-item span')) drag.maybeEdit = e.target.closest('.body, .heading, .badge, .card-tag, .collection-head, .todo-item span');
      stage.setPointerCapture(e.pointerId); schedule(); e.preventDefault(); return;
    }
    if (e.button === 1 || spaceHeld) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; stage.classList.add('panning'); stage.setPointerCapture(e.pointerId); return; }
    if (tool) { const t = tool; setTool(null); onPlace?.(t, screenToWorld(e.clientX, e.clientY)); e.preventDefault(); return; }
    // empty canvas: marquee select
    const base = e.shiftKey ? [...selected] : [];
    selected.clear(); base.forEach(id => selected.add(id)); onSelect?.([...selected]);
    drag = { kind: 'marquee', sx: e.clientX, sy: e.clientY, base };
    stage.setPointerCapture(e.pointerId); schedule();
  });
  stage.addEventListener('pointermove', e => {
    if (ptr) { ptr.move(e, screenToWorld(e.clientX, e.clientY)); return; }
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (drag.kind === 'pan') { setView({ x: drag.vx + dx, y: drag.vy + dy, z: view.z }); return; }
    if (drag.kind === 'marquee') {
      const x = Math.min(e.clientX, drag.sx), y = Math.min(e.clientY, drag.sy), w = Math.abs(dx), h = Math.abs(dy);
      Object.assign(marquee.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); marquee.hidden = w + h < 4;
      const a = screenToWorld(x, y), b = screenToWorld(x + w, y + h);
      selected.clear(); drag.base.forEach(id => selected.add(id)); for (const c of board.cards) if (!effectiveFlag(board, c, 'hidden') && !effectiveFlag(board, c, 'locked') && c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y) selected.add(c.id);
      onSelect?.([...selected]); schedule(); return;
    }
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    if (!drag.moved && drag.cards.some(d => lineCards.has(d.c.id))) clearAgentLine();
    drag.moved = true;
    let wdx = dx / view.z, wdy = dy / view.z;
    if (drag.kind === 'move') {
      const lines = [];
      for (const h of DRAG_HANDLERS.values()) {
        const result = h.snap?.(drag.cards, wdx, wdy, board, view, e);
        if (result) { wdx = result.dx; wdy = result.dy; lines.push(...(result.guides ?? [])); }
      }
      drawGuides(lines);
    }
    for (const d of drag.cards) {
      if (drag.kind === 'move') { d.c.x = Math.round(d.x + wdx); d.c.y = Math.round(d.y + wdy); }
      else if (d.c.id === drag.target) { const [minW, minH] = WINDOWS.has(d.c.type) ? [200, 120] : [80, 40]; d.c.w = Math.max(minW, Math.round(d.w + wdx)); d.c.h = Math.max(minH, Math.round(d.h + wdy)); }
      const m = mounted.get(d.c.id); if (m) { place(m.el, d.c); m.el.classList.add('dragging'); m.geo = geometry(d.c); }
    }
    drawLinks(); schedule();
    if (drag.kind === 'move') resolveCardDrop(drag.cards.map(d => d.c), e);
  });
  stage.addEventListener('pointerup', e => {
    if (ptr) { const p = ptr; ptr = null; p.up(e, screenToWorld(e.clientX, e.clientY)); return; }
    if (!drag) return;
    const d = drag; drag = null; drawGuides(); stage.classList.remove('panning'); marquee.hidden = true;
    if (d.kind === 'move' || d.kind === 'resize') {
      for (const x of d.cards) mounted.get(x.c.id)?.el.classList.remove('dragging');
      if (d.moved) {
        const accept = d.kind === 'move' && resolveCardDrop(d.cards.map(x => x.c), e);
        resolveCardDrop([], e);
        if (accept) {
          for (const x of d.cards) { x.c.x = x.x; x.c.y = x.y; const m = mounted.get(x.c.id); if (m) { place(m.el, x.c); m.geo = geometry(x.c); } }
          accept(); onSelect?.([...selected]); schedule(); return;
        }
        const cmds = d.kind === 'move' ? d.cards.map(x => ({ op: 'move', id: x.c.id, x: x.c.x, y: x.c.y }))
          : d.cards.filter(x => x.c.id === d.target).map(x => ({ op: 'update', id: x.c.id, set: { w: x.c.w, h: x.c.h } }));
        for (const h of DRAG_HANDLERS.values()) cmds.push(...(h.end?.(d.cards.map(x => x.c), board, d.kind) ?? []));
        onBatch.apply(cmds);
      } else if (d.maybeEdit) { d.maybeEdit.focus(); placeCaret(d.maybeEdit); }
    }
    onSelect?.([...selected]); schedule();
  });
  function cancelGesture() {
    cancelAnimationFrame(anim);
    if (drag?.cards) for (const d of drag.cards) Object.assign(d.c, { x: d.x, y: d.y, w: d.w, h: d.h });
    for (const m of mounted.values()) m.el.classList.remove('dragging');
    drag = null; ptr = null; stage.classList.remove('panning'); drawGuides(); marquee.hidden = true; schedule(true);
  }
  stage.addEventListener('pointercancel', cancelGesture);
  for (const type of ['click', 'dblclick']) stage.addEventListener(type, e => { const id = e.target.closest('.card')?.dataset.id; if (id && effectiveFlag(board, board.cards.find(c => c.id === id), 'locked')) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  stage.addEventListener('contextmenu', e => {
    if (!onContext || e.target.closest('input, textarea, [contenteditable="plaintext-only"]:focus')) return;
    e.preventDefault();
    const hit = e.target.closest('.card');
    if (hit) focusCard(hit.dataset.id);
    if (hit && !selected.has(hit.dataset.id)) { selected.clear(); selected.add(hit.dataset.id); onSelect?.([...selected]); schedule(); }
    onContext({ x: e.clientX, y: e.clientY, at: screenToWorld(e.clientX, e.clientY), ids: hit ? [...selected] : [] });
  });
  stage.addEventListener('dblclick', e => {
    const hit = e.target.closest('.card') || document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
    if (hit) { const c = board.cards.find(x => x.id === hit.dataset.id); if (c && RENDERERS.get(c.type)?.open) { RENDERERS.get(c.type).open(c, cardApi); } return; }
    if (preference('double-click-note', 'on') === 'off') return;
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
    if ((e.key === 'Backspace' || e.key === 'Delete') && selected.size) { onBatch.apply([{ op: 'delete', ids: [...selected].filter(id => !effectiveFlag(board, board.cards.find(c => c.id === id), 'locked')) }]); selected.clear(); onSelect?.([]); schedule(); }
    if (e.key === '0' && !e.metaKey && !e.ctrlKey) fit();
    if (e.key === 'Escape') { if (tool) setTool(null); else if (selected.size) { selected.clear(); onSelect?.([]); schedule(); } }
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); board.cards.filter(c => !effectiveFlag(board, c, 'hidden') && !effectiveFlag(board, c, 'locked')).forEach(c => selected.add(c.id)); onSelect?.([...selected]); schedule(); }
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
    if (preference('motion', 'on') === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(target); return; }
    const from = { ...view }, t0 = performance.now(); const ease = t => 1 - Math.pow(1 - t, 3);
    const step = now => { const t = Math.min(1, (now - t0) / ms), k = ease(t);
      setView({ x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, z: from.z + (target.z - from.z) * k }, t === 1);
      if (t < 1) anim = requestAnimationFrame(step); };
    anim = requestAnimationFrame(step);
  }
  function frameIds(ids, maxZ = 1) {
    const cards = board.cards.filter(c => ids.includes(c.id) && !effectiveFlag(board, c, 'hidden')); if (!cards.length) return;
    const x0 = Math.min(...cards.map(c => c.x)), y0 = Math.min(...cards.map(c => c.y));
    const x1 = Math.max(...cards.map(c => c.x + c.w)), y1 = Math.max(...cards.map(c => c.y + c.h));
    // Frame inside the free area: right of the side bar and tool bar, above the composer.
    const left = Math.max(0, ...[...document.querySelectorAll('.side:not(.side-right):not([hidden]) .pbox:not([hidden]), .tools')].map(el => el.getBoundingClientRect().right)) + 24;
    const rightPanel = document.querySelector('.side-right:not([hidden])');
    const right = rightPanel && rightPanel.getBoundingClientRect().width ? stage.clientWidth - rightPanel.getBoundingClientRect().left + 24 : 24;
    const W = Math.max(160, stage.clientWidth - left - right), H = stage.clientHeight - (document.body.classList.contains('just-board') ? 64 : 160), pad = 56;
    const z = Math.min(maxZ, (W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0));
    glideTo({ x: left + W / 2 - ((x0 + x1) / 2) * z, y: 44 + H / 2 - ((y0 + y1) / 2) * z, z: Math.max(MIN_Z, z) });
  }
  function fit() { if (board?.cards.length) frameIds(board.cards.map(c => c.id)); else glideTo({ x: stage.clientWidth / 2, y: stage.clientHeight / 2, z: 1 }); }
  function glow(ids) {
    for (const id of ids) {
      clearTimeout(flashes.get(id));
      flashes.set(id, setTimeout(() => { flashes.delete(id); mounted.get(id)?.el.classList.remove('glow'); }, 1200));
      const el = mounted.get(id)?.el; if (el) { el.classList.remove('glow'); void el.offsetWidth; el.classList.add('glow'); }
    }
  }
  function clearAgentLine() {
    clearTimeout(lineTimer); lineCards.clear();
    agentSvg.getAnimations({ subtree: true }).forEach(a => a.cancel());
    agentSvg.replaceChildren(); agentSvg.classList.remove('spent');
  }
  function ring(ids, colour, ms = 4000, label = 'Agent', origin) {
    clearAgentLine();
    const touched = new Set(ids);
    const cards = (board?.cards || []).filter(c => touched.has(c.id) && !effectiveFlag(board, c, 'hidden')).sort((a, b) => a.x - b.x);
    if (!cards.length) return;
    lineCards = new Map(cards.map(c => [c.id, geometry(c)]));
    agentSvg.style.setProperty('--agent-colour', colour || 'var(--data)');
    const top = Math.min(...cards.map(c => c.y)) - 56, start = cards[0].x + 10;
    const stations = cards.map(c => Math.min(c.x + c.w / 2, c.x + 180));
    const add = (tag, attrs) => {
      const el = document.createElementNS(agentSvg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
      agentSvg.append(el); return el;
    };
    add('circle', { class: 'origin', cx: origin?.x ?? start, cy: origin?.y ?? top - 24, r: 3.5 });
    if (origin) add('path', { d: `M${origin.x} ${origin.y}V${top - 24}H${start}` });
    add('text', { x: start + 10, y: top - 20 }).textContent = label;
    add('path', { class: 'trunk', d: `M${start} ${top - 24}V${top - 12}L${start + 12} ${top}H${Math.max(...stations)}` });
    cards.forEach((c, i) => {
      add('path', { class: 'drop', d: `M${stations[i]} ${top}V${c.y}` });
      add('circle', { class: 'station', cx: stations[i], cy: c.y, r: 4.5 });
    });
    if (!reduced.matches && !document.body.classList.contains('motion-off')) agentSvg.querySelectorAll('path').forEach((p, i) => {
      const length = p.getTotalLength();
      p.style.strokeDasharray = String(length);
      p.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 420, delay: i ? 360 + i * 60 : 0, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' });
    });
    glow(ids);
    lineTimer = setTimeout(() => agentSvg.classList.add('spent'), ms);
  }

  return {
    setBoard(next, { keepView = true } = {}) {
      const first = !board || board.id !== next.id;
      if (lineCards.size) {
        const byId = new Map(next.cards.map(c => [c.id, c]));
        if (first || [...lineCards].some(([id, geo]) => !byId.has(id) || geometry(byId.get(id)) !== geo)) clearAgentLine();
      }
      board = next;
      parents = new Map(board.cards.filter(c => c.parent).map(c => [c.id, c.parent]));
      // A focused frame and its separate canvas children rise together. CSS responds to the same one class.
      const frameRules = board.cards.filter(c => c.type === 'frame').map(c => {
        const id = CSS.escape(c.id);
        return `.world:has(> .window-focus[data-id="${id}"]) > .card[data-ancestors~="${id}"] { z-index: calc(100001 + var(--card-order, 0)) !important; }`;
      }).join('\n');
      if (frameFocusStyle.textContent !== frameRules) frameFocusStyle.textContent = frameRules;
      for (const id of selected) if (!board.cards.some(c => c.id === id)) selected.delete(id);
      if (first) { focusIds = null; focusedId = null; for (const timer of flashes.values()) clearTimeout(timer); flashes.clear(); cancelAnimationFrame(anim); clearTimeout(viewT); clearTimeout(crispTimer); }
      else if (focusedId && !board.cards.some(c => c.id === focusedId)) focusCard(null);
      if (first) { for (const m of mounted.values()) removeEl(m.el); mounted.clear(); selected.clear(); view = next.view ?? { x: 0, y: 0, z: 1 }; if (!next.view || (next.view.x === 0 && next.view.y === 0)) view = { x: stage.clientWidth / 2 - 200, y: stage.clientHeight / 3, z: 1 }; }
      schedule(true);
      stage.dispatchEvent(new CustomEvent('boardchange', { detail: { board, first } }));
      return first;
    },
    get board() { return board; },
    setFocus(ids) { focusIds = ids ? new Set(ids) : null; if (ids?.length) focusCard(ids.at(-1)); schedule(); },
    get view() { return view; },
    selection: () => [...selected],
    frameIds, glow, fit, setTool,
    exportCard: renderCard, releaseCard: removeEl,
    get tool() { return tool; },
    screenToWorld, worldToScreen: (x, y) => ({ x: x * view.z + view.x, y: y * view.z + view.y }),
    setView, glideTo, redraw: () => schedule(true), mountedEl: id => mounted.get(id)?.el ?? null,
    busy: () => !!drag,
    select(ids) { selected.clear(); for (const id of ids) selected.add(id); if (ids.length) focusCard(ids.at(-1)); onSelect?.([...selected]); schedule(); },
    // Put the caret in a card's first editable field (or its link box).
    edit(id) { requestAnimationFrame(() => { const el = mounted.get(id)?.el; const f = el?.querySelector('.url-input, .body'); if (f) { f.focus(); if (f.isContentEditable) placeCaret(f); } }); },
    ring, clearAgentLine,
    centre: () => screenToWorld(stage.clientWidth / 2, stage.clientHeight / 2),
    stats: () => ({ mounted: mounted.size, cards: board?.cards.length ?? 0, z: view.z }),
  };
}
