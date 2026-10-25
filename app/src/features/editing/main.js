// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { registerRenderer, registerDragHandler, registerCardDropTarget } from '../../canvas/engine.js';
import { registerTool, registerPanel, registerCardMenu, registerBoardMenu, selectionControls, onRegistryChange } from '../registry';
import { uid, bounds, descendants, effectiveFlag, makeClip, cloneCommands, createHistory, arrange, stackCommands, collectionLayout } from './model.js';
import './types.js';
import { mountNavigation } from './navigation.js';
import { exportBoard } from './export.js';
import { fontPicker } from './fonts.js';

registerTool({ id: 'coll', title: 'Collection', key: 'g', group: 'editing', icon: '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12"/>', place(at, ctx) { ctx.apply([{ op: 'create', type: 'coll', text: 'Collection', x: at.x, y: at.y, props: { kids: [] }, ref: 'collection' }], ids => ctx.canvas.select([ids.collection])); } });
registerRenderer('coll', { render(el, card, api) {
  const header = document.createElement('div'); header.className = 'collection-head'; header.contentEditable = 'plaintext-only'; header.textContent = card.text || 'Collection';
  header.onblur = () => { if (header.textContent !== card.text) api.apply([{ op: 'update', id: card.id, set: { text: header.textContent } }]); };
  header.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); header.blur(); } };
  el.append(header);
} });
let trayMount;
registerPanel({ id: 'unsorted', title: 'Unsorted', side: 'right', mount(el, ctx) { trayMount?.(el, ctx); } });

const SQUARE_TYPES = new Set(['stamp', 'icon']);
export function mountEditing(ctx) {
  const { canvas, apply, toast } = ctx, stage = document.getElementById('stage');
  const selectedCards = () => canvas.board?.cards.filter(c => canvas.selection().includes(c.id)) ?? [];
  const editableCards = () => selectedCards().filter(c => !effectiveFlag(canvas.board, c, 'locked'));
  const history = createHistory({ read: () => canvas.board, apply, busy: () => canvas.busy() || gesture });
  stage.addEventListener('boardchange', e => { history.observe(e.detail.board); if (e.detail.first) { focus = null; } renderTray(); renderBar(true); });
  stage.addEventListener('pointerdown', () => history.flush(), true);
  const storedClip = () => { try { const v = JSON.parse(localStorage.getItem('aegis:clip')); return v?.cards?.length && v.cards.every(c => c && typeof c.id === 'string' && typeof c.type === 'string' && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(c[k]))) && Array.isArray(v.links) ? v : null; } catch { return null; } };
  let pasteCount = 0, clipStamp = '', pendingPaste, copyEventSeen = false;
  function copy(event, cut = false) {
    if (!selectedCards().length) return;
    const clip = makeClip(canvas.board, canvas.selection()); localStorage.setItem('aegis:clip', JSON.stringify(clip)); pasteCount = 0;
    if (event?.clipboardData) { event.clipboardData.setData('text/x-aegis', JSON.stringify(clip)); event.clipboardData.setData('text/plain', clip.text); event.preventDefault(); event.stopImmediatePropagation(); }
    else (ctx.host.copy ? ctx.host.copy(clip.text) : navigator.clipboard?.writeText(clip.text))?.catch(() => {});
    if (cut) remove();
    return clip;
  }
  function paste(clip = storedClip(), at, offset) {
    if (!clip?.cards?.length) return;
    const stamp = JSON.stringify(clip); if (stamp !== clipStamp) { clipStamp = stamp; pasteCount = 0; }
    const result = cloneCommands(clip, canvas.board, at ?? canvas.centre(), offset ?? 30 * ++pasteCount);
    apply(result.commands, () => canvas.select(result.ids)); return result.ids;
  }
  function duplicate() { const clip = makeClip(canvas.board, canvas.selection()); return paste(clip, undefined, 30); }
  const typing = e => !!e.target.closest?.('input, textarea, select, [contenteditable]');
  for (const type of ['copy', 'cut']) addEventListener(type, e => { if (!typing(e)) { copyEventSeen = true; copy(e, type === 'cut'); } }, true);
  addEventListener('paste', e => {
    if (typing(e)) return;
    clearTimeout(pendingPaste);
    let clip; try { clip = JSON.parse(e.clipboardData.getData('text/x-aegis')); } catch {}
    if (!clip?.cards?.length) { const cached = storedClip(); if (cached && e.clipboardData.getData('text/plain') === cached.text) clip = cached; }
    if (clip?.cards?.length) { e.preventDefault(); e.stopImmediatePropagation(); paste(clip); }
  }, true);
  function remove() { const ids = editableCards().map(c => c.id); if (ids.length) apply([{ op: 'delete', ids }], () => canvas.select([])); }
  function group(ungroup = false) {
    const cards = editableCards(); if (!ungroup && cards.length < 2) return;
    const group = ungroup ? '' : uid(), groups = new Set(cards.map(c => c.group).filter(Boolean));
    const targets = ungroup ? canvas.board.cards.filter(c => groups.has(c.group)) : cards;
    if (targets.length) apply(targets.map(c => ({ op: 'update', id: c.id, set: { group } })));
  }
  function stack(direction) { const commands = stackCommands(canvas.board, editableCards().map(c => c.id), direction); if (commands.length) apply(commands); }
  const textCards = () => editableCards().filter(c => ['note', 'title', 'todo', 'shape', 'coll'].includes(c.type));
  function format(key, value) { const cards = textCards(); if (value === undefined) value = !cards.every(c => c.props?.[key]); if (cards.length) apply(cards.map(c => ({ op: 'update', id: c.id, set: { props: { [key]: value } } }))); }
  const navigation = mountNavigation(ctx, { exportBoard: (selection, format) => exportBoard(ctx, selection, format) });
  let focus = null;
  function toggleFocus() {
    if (focus) { focus = null; canvas.setFocus(null); return; }
    const ids = new Set(canvas.selection()); if (!ids.size) return toast('Select cards to focus on first');
    for (const l of canvas.board.links) { if (ids.has(l.a)) ids.add(l.b); if (ids.has(l.b)) ids.add(l.a); }
    focus = ids; canvas.setFocus([...ids]); canvas.frameIds([...ids]);
  }
  addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
    if (mod && key === 'k') { e.preventDefault(); e.stopImmediatePropagation(); navigation.capture(); return; }
    if (typing(e) || gesture || canvas.busy()) return;
    let handled = true;
    if (mod && key === 'z') { if (!history.travel(e.shiftKey ? 1 : -1)) toast(e.shiftKey ? 'Nothing left to redo' : 'Nothing left to undo'); }
    else if (mod && key === 'g' && !e.altKey) group(e.shiftKey);
    else if (mod && key === 'd') duplicate();
    else if (mod && (key === 'c' || key === 'x')) { const ids = canvas.selection(); setTimeout(() => { if (!copyEventSeen && ids.length) copy(null, key === 'x'); copyEventSeen = false; }, 50); handled = false; }
    else if (mod && key === 'v') { pendingPaste = setTimeout(() => paste(), 160); handled = false; }
    else if (mod && ['BracketRight', 'BracketLeft'].includes(e.code)) stack(e.code === 'BracketRight' ? e.shiftKey ? 'front' : 'forward' : e.shiftKey ? 'back' : 'backward');
    else if (mod && ['b', 'i', 'u'].includes(key)) format({ b: 'bold', i: 'italic', u: 'under' }[key]);
    else if (key === 'f' && !e.shiftKey && !mod) toggleFocus();
    else if (key === 'escape' && focus) { focus = null; canvas.setFocus(null); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  registerDragHandler('editing', {
    select(ids, id, board, e) {
      if (e.metaKey || e.ctrlKey) return ids;
      const card = board.cards.find(c => c.id === id);
      if (card?.group && ids.includes(id)) return [...new Set([...ids, ...board.cards.filter(c => c.group === card.group).map(c => c.id)])];
      return ids;
    },
    start(cards, board, e) {
      cards = descendants(board, cards.map(c => c.id));
      if (e.altKey) { const ids = paste(makeClip(board, cards.map(c => c.id)), undefined, 0); return canvas.board.cards.filter(c => ids?.includes(c.id)); }
      return cards;
    },
    end(cards, board, kind) {
      const commands = [];
      for (const c of cards.filter(c => c.type === 'coll')) if (kind === 'resize') commands.push(...collectionLayout(board, c));
      if (kind === 'move') {
        for (const c of cards) if (c.parent && !cards.some(p => p.id === c.parent)) {
          const parent = board.cards.find(p => p.id === c.parent);
          if (parent?.type === 'coll') commands.push({ op: 'update', id: c.id, set: { parent: '' } }, ...collectionLayout(board, parent, (parent.props?.kids ?? []).filter(id => id !== c.id)));
        }
        const target = [...board.cards].reverse().find(p => p.type === 'coll' && !cards.some(c => c.id === p.id) && cards.every(c => c.x + c.w / 2 > p.x && c.x + c.w / 2 < p.x + p.w && c.y + c.h / 2 > p.y && c.y + c.h / 2 < p.y + p.h));
        if (target) commands.push(...collectionLayout(board, target, [...new Set([...(target.props?.kids ?? []), ...cards.map(c => c.id)])]));
      }
      return commands;
    },
  });

  const bar = document.createElement('div'); bar.id = 'selectionBar'; bar.className = 'selection-bar'; bar.setAttribute('aria-label', 'Selection controls'); document.body.append(bar);
  const outline = document.createElement('div'); outline.className = 'editing-outline'; outline.innerHTML = '<i class="selection-move top"></i><i class="selection-move bottom"></i><i class="selection-move left"></i><i class="selection-move right"></i><button class="rotation-handle" title="Rotate selection" aria-label="Rotate selection">↻</button><output class="rotation-badge" hidden></output><button class="selection-resize" aria-label="Resize selection"></button>'; stage.append(outline);
  let barKey = '', cleanups = [], gesture = false;
  function button(label, action, title = label) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title); b.onclick = action; bar.append(b); return b; }
  function input(label, value, action, type = 'text') { const el = document.createElement('input'); el.type = type; el.setAttribute('aria-label', label); el.title = label; el.placeholder = label; el.value = value ?? ''; if (type === 'number') { el.min = '6'; el.max = '400'; el.style.width = '54px'; } el.onchange = () => action(el.value); bar.append(el); return el; }
  function select(label, values, value, action) { const el = document.createElement('select'); el.setAttribute('aria-label', label); el.title = label; for (const [v, text] of values) { const option = new Option(text, v); el.append(option); } el.value = value ?? ''; el.onchange = () => action(el.value); bar.append(el); return el; }
  function renderBar(force = false) {
    const cards = selectedCards().filter(c => !effectiveFlag(canvas.board, c, 'hidden'));
    const invisible = !cards.length || gesture;
    bar.hidden = invisible; outline.hidden = !cards.length;
    if (!cards.length) return;
    let b = bounds(cards), p = canvas.worldToScreen(b.x, b.y), q = canvas.worldToScreen(b.right, b.bottom);
    // Use what is really on screen when every selected card is mounted (a card may lay itself out taller than its saved size).
    const rects = cards.map(c => canvas.mountedEl(c.id)?.getBoundingClientRect()).filter(r => r && r.width);
    if (rects.length === cards.length && cards.every(c => !c.rot)) {
      p = { x: Math.min(...rects.map(r => r.left)), y: Math.min(...rects.map(r => r.top)) };
      q = { x: Math.max(...rects.map(r => r.right)), y: Math.max(...rects.map(r => r.bottom)) };
    }
    Object.assign(outline.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${q.x - p.x}px`, height: `${q.y - p.y}px` });
    // A grab strip only works where the selection is what you see: where another card is stacked on top, it steps aside.
    const chosen = new Set(cards.map(c => c.id));
    outline.querySelectorAll('.selection-move').forEach(strip => {
      strip.style.pointerEvents = '';
      const r = strip.getBoundingClientRect(); if (!r.width) return;
      const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map(t => r.width > r.height ? [r.left + r.width * t, r.top + r.height / 2] : [r.left + r.width / 2, r.top + r.height * t]);
      const blocked = samples.some(([x, y]) => { const top = document.elementsFromPoint(x, y).find(el => !outline.contains(el)); const card = top?.closest?.('#world .card'); return card && !chosen.has(card.dataset.id); });
      if (blocked) strip.style.pointerEvents = 'none';
    });
    const locked = cards.some(c => effectiveFlag(canvas.board, c, 'locked'));
    outline.querySelector('.rotation-handle').hidden = locked || cards.some(c => ['frame', 'section', 'coll', 'ink'].includes(c.type));
    outline.querySelector('.selection-resize').hidden = locked;
    outline.querySelectorAll('.selection-move').forEach(el => { el.hidden = locked; });
    const key = JSON.stringify(cards.map(c => [c.id, c.type, c.group, c.heading, c.props]));
    if (force || key !== barKey) {
      if (bar.contains(document.activeElement)) return;
      barKey = key; cleanups.forEach(f => f()); cleanups = []; bar.replaceChildren();
      const label = document.createElement('strong'); label.textContent = cards.length === 1 ? ({ todo: 'Checklist', coll: 'Collection' }[cards[0].type] || cards[0].type[0].toUpperCase() + cards[0].type.slice(1)) : `${cards.length} cards`; bar.append(label);
      if (!locked) {
        if (textCards().length) {
          for (const [label, key] of [['B', 'bold'], ['I', 'italic'], ['U', 'under'], ['S', 'strike']]) { const b = button(label, () => format(key), { bold: 'Bold', italic: 'Italic', under: 'Underline', strike: 'Strike through' }[key]); b.setAttribute('aria-pressed', String(textCards().every(c => c.props?.[key]))); }
          select('Text alignment', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], cards[0].props?.align || 'left', v => format('align', v));
          select('Text size preset', [['', 'Size'], ['12', 'Small'], ['15', 'Medium'], ['21', 'Large'], ['30', 'Extra large']], '', v => { if (v) format('size', Number(v)); });
          const sizes = input('Text size', textCards().every(c => c.props?.size === cards[0].props?.size) ? cards[0].props?.size || (cards[0].type === 'title' ? 44 : 15) : '', v => { const n = Number(v); if (Number.isFinite(n)) format('size', Math.min(400, Math.max(6, n))); }, 'number'); sizes.step = '1'; sizes.onkeydown = e => { if (e.shiftKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const value = Math.min(400, Math.max(6, Number(sizes.value) + (e.key === 'ArrowUp' ? 10 : -10))); sizes.value = String(value); format('size', value); } };
          const font = select('Font', [['', 'Default font'], ['system-ui', 'System'], ['serif', 'Serif'], ['monospace', 'Monospace']], cards[0].props?.font || '', v => format('font', v || null));
          button('Fonts…', e => { const close = fontPicker(e.currentTarget, textCards(), ctx, value => format('font', value)); cleanups.push(close); });
          if (!textCards().every(c => (c.props?.font || '') === (textCards()[0].props?.font || ''))) font.prepend(new Option('Mixed fonts', '__mixed', true, true));
          font.onkeydown = e => { if (e.key === 'Escape') { canvas.redraw(); font.blur(); } };
          select('Spacing', [['', 'Spacing'], ['compact', 'Compact'], ['normal', 'Normal'], ['open', 'Open']], '', v => { if (v) { format('lh', { compact: 1.1, normal: 1.4, open: 1.8 }[v]); } });
          input('Letter spacing', cards[0].props?.ls || 0, v => { const n = Number(v); if (Number.isFinite(n)) format('ls', Math.max(-10, Math.min(50, n))); }, 'text');
          select('Display case', [['', 'As typed'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case']], cards[0].props?.tcase || '', v => format('tcase', v || null));
        }
        if (cards.length === 1 && cards[0].type === 'note') input('Note name', cards[0].heading, v => apply([{ op: 'update', id: cards[0].id, set: { heading: v } }]));
        if (cards.length === 1 && !['coll', 'swatch', 'ink'].includes(cards[0].type)) input(cards[0].type === 'image' ? 'Caption' : 'Label', cards[0].props?.tag, v => apply([{ op: 'update', id: cards[0].id, set: { props: { tag: v || null } } }]));
        if (cards.length > 1) {
          const align = select('Align selection', [['', 'Align'], ...['left', 'centre', 'right', 'top', 'middle', 'bottom'].map(v => [v, v[0].toUpperCase() + v.slice(1)]), ...(new Set(cards.map(c => c.group || c.id)).size >= 3 ? [['distribute-x', 'Distribute horizontally'], ['distribute-y', 'Distribute vertically']] : [])], '', v => { const commands = arrange(canvas.board, canvas.selection(), v); if (commands.length) apply(commands); }); align.value = '';
          button('Group', () => group());
          button('Collect', () => { const b = bounds(cards), id = uid(); const coll = { id, type: 'coll', x: b.x - 12, y: b.y - 52, w: Math.max(300, b.right - b.x + 24), h: 180, props: { kids: cards.map(c => c.id) } }; apply([{ op: 'create', type: 'coll', newId: id, text: 'Collection', x: coll.x, y: coll.y, w: coll.w, h: coll.h, props: coll.props }, { op: 'order', ids: [id], to: 'back' }, ...collectionLayout(canvas.board, coll)], () => canvas.select([id])); });
        }
        if (cards.some(c => c.group)) button('Ungroup', () => group(true));
        for (const control of selectionControls) if (!control.when || control.when(ctx)) { const host = document.createElement('span'); host.dataset.selectionControl = control.id; bar.append(host); const cleanup = control.mount(host, ctx); if (cleanup) cleanups.push(cleanup); }
        button('Duplicate', duplicate); button('Delete', remove);
      }
      button('PNG', () => exportBoard(ctx, true)); button('PDF', () => exportBoard(ctx, true, 'pdf'));
    }
    // Keep clear of the side bar and tool bar on the left, and the panels on the right.
    const leftEdge = Math.max(12, ...[...document.querySelectorAll('.side:not(.side-right):not([hidden]) .pbox, .tools')].map(el => el.getBoundingClientRect().right + 12));
    const rightEdge = Math.min(innerWidth - 12, ...[...document.querySelectorAll('.side-right:not([hidden]) .pbox, .panel:not([hidden])')].map(el => el.getBoundingClientRect().left - 12));
    const width = Math.min(bar.offsetWidth || 600, rightEdge - leftEdge);
    bar.style.maxWidth = `${Math.max(240, rightEdge - leftEdge)}px`;
    bar.style.left = `${Math.max(leftEdge, Math.min(rightEdge - width, (p.x + q.x - width) / 2))}px`;
    // Float above the selection when that spot covers nothing on the board; otherwise dock just above the composer,
    // where it can never hide a card.
    const h = bar.offsetHeight, left = parseFloat(bar.style.left), wBar = bar.offsetWidth, above = p.y - h - 42;
    const covers = top => [...document.querySelectorAll('#world .card, #world .card *')].some(el => { const r = el.getBoundingClientRect(); return r.width && r.right > left && r.left < left + wBar && r.bottom > top && r.top < top + h; });
    const composer = document.getElementById('composer')?.getBoundingClientRect();
    const dock = (composer?.top ?? innerHeight - 90) - h - 12;
    const hitsSelection = top => top < q.y + 8 && top + h > p.y - 32;
    const floating = above >= 50 && !covers(above);
    // Docked above the composer unless that would cover the selection; then pin to the top edge.
    const top = floating ? above : !hitsSelection(dock) ? dock : 50;
    bar.classList.toggle('docked', !floating);
    bar.style.top = `${top}px`;
  }
  stage.addEventListener('canvaspaint', () => renderBar()); onRegistryChange(() => renderBar(true));
  outline.addEventListener('pointerdown', e => {
    const rotate = e.target.closest('.rotation-handle'), resize = e.target.closest('.selection-resize'), moving = e.target.closest('.selection-move'); if (!rotate && !resize && !moving) return;
    e.preventDefault(); e.stopPropagation(); history.flush(); gesture = true;
    const cards = descendants(canvas.board, editableCards().map(c => c.id)).filter(c => !effectiveFlag(canvas.board, c, 'locked')).map(c => structuredClone(c)), b = bounds(cards), centre = { x: (b.x + b.right) / 2, y: (b.y + b.bottom) / 2 }, start = canvas.screenToWorld(e.clientX, e.clientY), angle = Math.atan2(start.y - centre.y, start.x - centre.x);
    const badge = outline.querySelector('output'); badge.hidden = !rotate;
    let last = [];
    const move = ev => { const p = canvas.screenToWorld(ev.clientX, ev.clientY);
      let deg = (Math.atan2(p.y - centre.y, p.x - centre.x) - angle) * 180 / Math.PI; if (ev.shiftKey) deg = Math.round(deg / 15) * 15; badge.textContent = `${Math.round(deg)}°`;
      const t = deg * Math.PI / 180;
      let sx = Math.max(.1, (p.x - b.x) / Math.max(1, start.x - b.x)), sy = Math.max(.1, (p.y - b.y) / Math.max(1, start.y - b.y)); if (ev.shiftKey || cards.some(c => SQUARE_TYPES.has(c.type))) sx = sy = Math.max(sx, sy);
      last = cards.map(c => { const dx = c.x + c.w / 2 - centre.x, dy = c.y + c.h / 2 - centre.y;
        const set = moving ? { x: c.x + p.x - start.x, y: c.y + p.y - start.y } : rotate ? { x: centre.x + dx * Math.cos(t) - dy * Math.sin(t) - c.w / 2, y: centre.y + dx * Math.sin(t) + dy * Math.cos(t) - c.h / 2, rot: ((c.rot || 0) + deg + 540) % 360 - 180 } : { x: b.x + (c.x - b.x) * sx, y: b.y + (c.y - b.y) * sy, w: Math.max(40, c.w * sx), h: Math.max(24, c.h * sy) };
        const el = canvas.mountedEl(c.id); if (el) { const n = { ...c, ...set }; el.style.transform = `translate(${n.x}px, ${n.y}px) rotate(${n.rot || 0}deg)`; el.style.width = `${n.w}px`; el.style.height = `${n.h}px`; }
        return { op: 'update', id: c.id, set };
      });
    };
    const end = commit => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel); removeEventListener('keydown', escape, true); gesture = false; badge.hidden = true; if (commit && last.length) { const layouts = !rotate ? last.flatMap(cmd => { const c = canvas.board.cards.find(c => c.id === cmd.id); return c.type === 'coll' ? collectionLayout(canvas.board, { ...c, ...cmd.set }) : []; }) : []; apply([...last, ...layouts]); } else { for (const c of cards) { const el = canvas.mountedEl(c.id); if (el) { el.style.transform = `translate(${c.x}px, ${c.y}px) rotate(${c.rot || 0}deg)`; el.style.width = `${c.w}px`; el.style.height = `${c.h}px`; } } canvas.redraw(); } renderBar(true); };
    const up = () => end(true), cancel = () => end(false), escape = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); end(false); } };
    addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true }); addEventListener('pointercancel', cancel, { once: true }); addEventListener('keydown', escape, true);
  });

  let trayEl, traySig = '';
  trayMount = el => { trayEl = el; el.classList.add('unsorted-list'); renderTray(); };
  function renderTray() {
    if (!trayEl || !canvas.board) return;
    const sig = JSON.stringify([canvas.board.id, canvas.board.tray]); if (sig === traySig) return; traySig = sig;
    trayEl.replaceChildren(); const items = canvas.board.tray ?? [];
    const hint = document.createElement('p'); hint.className = 'muted small'; hint.textContent = items.length ? `${items.length} ideas. Drag onto the board.` : 'Capture ideas with ⌘K. Drag cards here to put them aside.'; trayEl.append(hint);
    for (const item of items) {
      const row = document.createElement('button'); row.className = 'tray-item'; row.textContent = item.text || item.heading || item.url || item.type; row.dataset.id = item.id;
      row.onclick = () => release(item, canvas.centre());
      row.onpointerdown = e => {
        const start = { x: e.clientX, y: e.clientY }; let moved = false;
        const move = ev => { if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 5) { moved = true; row.classList.add('dragging'); } };
        const up = ev => { removeEventListener('pointermove', move); row.classList.remove('dragging'); if (moved) { row.onclick = null; if (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#stage')) release(item, canvas.screenToWorld(ev.clientX, ev.clientY)); setTimeout(() => { row.onclick = () => release(item, canvas.centre()); }); } };
        addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true });
      };
      trayEl.append(row);
    }
  }
  function release(item, at) {
    const result = cloneCommands({ from: 'tray', cards: item.bundle?.cards ?? [item], links: item.bundle?.links ?? [] }, canvas.board, at);
    apply([{ op: 'board_set', set: { tray: (canvas.board.tray ?? []).filter(c => c.id !== item.id) } }, ...result.commands], () => canvas.select(result.ids));
  }
  registerCardDropTarget(({ cards, x, y }) => {
    if (!cards.length || !trayEl) return;
    const r = trayEl.closest('.pbox').getBoundingClientRect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom || !r.height) return;
    return () => { const clip = makeClip(canvas.board, cards.map(c => c.id)), first = clip.cards[0]; if (!first) return; const item = { ...first, id: uid(), bundle: { cards: clip.cards, links: clip.links } }; apply([{ op: 'board_set', set: { tray: [...(canvas.board.tray ?? []), item] } }, { op: 'delete', ids: clip.cards.map(c => c.id) }], () => canvas.select([])); };
  });
  for (const [id, title, run] of [['duplicate', 'Duplicate', duplicate], ['copy', 'Copy', () => copy()], ['cut', 'Cut', () => copy(null, true)], ['group', 'Group', () => group()], ['ungroup', 'Ungroup', () => group(true)], ['forward', 'Bring forward', () => stack('forward')], ['backward', 'Send backward', () => stack('backward')], ['export', 'Export selection as PNG', () => exportBoard(ctx, true)], ['export-pdf', 'Export selection as PDF', () => exportBoard(ctx, true, 'pdf')]]) registerCardMenu({ id: `editing-${id}`, title, section: 'Editing', run });
  registerBoardMenu({ id: 'editing-export-board', title: 'Export board as PNG', section: 'Export', run: () => exportBoard(ctx, false) });
  registerBoardMenu({ id: 'editing-export-board-pdf', title: 'Export board as PDF', section: 'Export', run: () => exportBoard(ctx, false, 'pdf') });
  return { history, copy, paste, duplicate, group, arrange: how => { const commands = arrange(canvas.board, canvas.selection(), how); if (commands.length) apply(commands); }, stack, toggleFocus };
}
