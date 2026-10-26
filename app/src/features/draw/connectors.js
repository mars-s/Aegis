// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { linkGeometry } from '../../canvas/engine.js';
import { svg, worldToLocal, localToWorld } from './geometry.js';
import { effectiveFlag } from '../editing/model.js';
export function connectorEditor(ctx, layer, changed) {
  const stage = document.getElementById('stage');
  let selected = null, drag = null;
  const hint = document.createElement('div'); hint.className = 'draw-connect-hint'; hint.hidden = true; hint.setAttribute('role', 'status'); hint.textContent = 'Choose a target window. Esc to cancel.'; stage.append(hint);
  const current = () => ctx.canvas.board?.links.find(l => l.id === selected);
  const world = e => ctx.canvas.screenToWorld(e.clientX, e.clientY);
  const screen = p => ctx.canvas.worldToScreen(p.x, p.y);
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  function hitCard(at, except) {
    return [...ctx.canvas.board.cards].reverse().find(c => { if (c.id === except || effectiveFlag(ctx.canvas.board, c, 'hidden')) return false; const p = worldToLocal(c, at), ow = c.props?.ow || c.w, oh = c.props?.oh || c.h, r = 16 / ctx.canvas.view.z; return p.x >= -r && p.y >= -r && p.x <= ow + r && p.y <= oh + r; });
  }
  function pinAt(c, at) {
    const p = worldToLocal(c, at), u = Math.max(0, Math.min(1, p.x / (c.props?.ow || c.w))), v = Math.max(0, Math.min(1, p.y / (c.props?.oh || c.h)));
    const distances = [u, 1 - u, v, 1 - v], side = distances.indexOf(Math.min(...distances));
    return side === 0 ? { u: 0, v } : side === 1 ? { u: 1, v } : side === 2 ? { u, v: 0 } : { u, v: 1 };
  }
  function pinWorld(c, pin) { return localToWorld(c, { x: pin.u * (c.props?.ow || c.w), y: pin.v * (c.props?.oh || c.h) }); }
  function knob(point, attrs) { const p = screen(point); layer.append(svg('circle', { cx: p.x, cy: p.y, r: 6, class: 'draw-link-knob', ...attrs })); }
  function wire(link, attrs = {}) {
    const a = ctx.canvas.board.cards.find(c => c.id === link.a), b = ctx.canvas.board.cards.find(c => c.id === link.b); if (!a || !b) return null;
    const g = linkGeometry(link, a, b), p = screen(g.p0), q = screen(g.p2), c = screen(g.control);
    layer.append(svg('path', { d: `M${p.x} ${p.y} Q${c.x} ${c.y} ${q.x} ${q.y}`, fill: 'none', stroke: 'var(--focus)', 'stroke-width': 2, ...attrs })); return g;
  }
  function redraw() {
    layer.replaceChildren(); if (!ctx.canvas.board) return;
    if (drag?.kind === 'create' && (drag.boardId !== ctx.canvas.board.id || !ctx.canvas.board.cards.some(c => c.id === drag.a))) cancel();
    if (selected && !current()) { selected = null; changed(); }
    const link = drag?.link || current();
    if (link) {
      const g = wire(link, drag ? { stroke: link.colour || 'var(--focus)', ...(link.dash ? { 'stroke-dasharray': '8 6' } : {}) } : { 'stroke-width': 7, opacity: .18 }); if (g) { knob(g.p0, { 'data-connect-end': 'a' }); knob(g.p2, { 'data-connect-end': 'b' }); knob(g.handle, { 'data-connect-bend': '1', class: 'draw-link-knob draw-link-bend' }); }
    }
    if (drag?.kind === 'create' || drag?.kind === 'end') {
      const card = hitCard(drag.at, drag.kind === 'create' ? drag.a : drag.link[drag.end === 'a' ? 'b' : 'a']);
      if (drag.kind === 'create') {
        const source = ctx.canvas.board.cards.find(c => c.id === drag.a);
        drag.pa = pinAt(source, drag.at); drag.from = pinWorld(source, drag.pa);
      }
      const from = screen(drag.from), to = screen(card ? pinWorld(card, pinAt(card, drag.at)) : drag.at);
      if (card) {
        const w = card.props?.ow || card.w, h = card.props?.oh || card.h;
        const points = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => screen(localToWorld(card, { x, y }))).map(p => `${p.x},${p.y}`).join(' ');
        layer.append(svg('polygon', { points, class: 'draw-connect-target', 'data-connect-target': card.id }));
      }
      layer.append(svg('path', { d: `M${from.x} ${from.y} L${to.x} ${to.y}`, class: 'draw-connect-preview', 'data-connect-preview': '' }));
    }
  }
  function cancel() { drag = null; stage.classList.remove('connecting'); hint.hidden = true; }
  function select(id) { cancel(); selected = id; if (id) { ctx.canvas.setTool(null); ctx.canvas.select([]); } redraw(); changed(); }
  stage.addEventListener('connectstart', e => {
    const card = ctx.canvas.board.cards.find(c => c.id === e.detail.id); if (!card) return;
    ctx.canvas.setTool(null); selected = null;
    const pa = { u: 1, v: .5 }, from = pinWorld(card, pa);
    drag = { kind: 'create', boardId: ctx.canvas.board.id, a: card.id, pa, from, at: from };
    stage.classList.add('connecting'); hint.hidden = false; stage.focus({ preventScroll: true }); redraw(); changed();
  });
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (drag?.kind === 'create') { stop(e); drag.at = world(e); stage.setPointerCapture(e.pointerId); redraw(); return; }
    const target = e.target.closest('[data-link], [data-connect-end], [data-connect-bend]');
    if (!target || ctx.canvas.tool) { if (selected && !e.target.closest('input, button, select, .draw-inspector')) select(null); return; }
    stop(e); stage.focus({ preventScroll: true });
    if (target.dataset.link) { select(target.dataset.link); return; }
    const at = world(e), link = structuredClone(current()); if (!link) return;
    const a = ctx.canvas.board.cards.find(c => c.id === link.a), b = ctx.canvas.board.cards.find(c => c.id === link.b), g = linkGeometry(link, a, b);
    drag = target.dataset.connectEnd ? { kind: 'end', link, end: target.dataset.connectEnd, at, from: target.dataset.connectEnd === 'a' ? g.p2 : g.p0 } : { kind: 'bend', link, g };
    stage.setPointerCapture(e.pointerId); redraw(); changed();
  }, true);
  stage.addEventListener('pointermove', e => {
    if (stage.classList.contains('panning')) return;
    if (drag) {
      stop(e); const at = world(e);
      if (drag.kind === 'bend') { const g = drag.g, bend = 2 * ((at.x - g.mid.x) * g.n.x + (at.y - g.mid.y) * g.n.y); drag.link.bend = Math.abs(bend * ctx.canvas.view.z) < 8 ? 0 : Math.round(bend); }
      else drag.at = at;
      redraw(); return;
    }
  }, true);
  stage.addEventListener('pointerup', e => {
    if (stage.classList.contains('panning')) return;
    if (!drag) return; stop(e); const d = drag; cancel();
    if (d.kind === 'bend') ctx.apply([{ op: 'link_update', id: d.link.id, set: { bend: d.link.bend } }]);
    else {
      const at = world(e), except = d.kind === 'create' ? d.a : d.link[d.end === 'a' ? 'b' : 'a'], target = hitCard(at, except);
      if (target) {
        const a = d.kind === 'create' ? d.a : d.end === 'a' ? target.id : d.link.a, b = d.kind === 'create' ? target.id : d.end === 'b' ? target.id : d.link.b;
        const duplicate = ctx.canvas.board.links.some(l => l.id !== d.link?.id && (l.a === a && l.b === b || l.a === b && l.b === a));
        if (duplicate) ctx.toast('Those cards are already connected.');
        else if (d.kind === 'create') {
          const id = Math.random().toString(36).slice(2, 12).padEnd(8, '0');
          ctx.apply([{ op: 'connect', a, b, newId: id }, { op: 'link_update', id, set: { pa: d.pa, pb: pinAt(target, at) } }]); selected = id; ctx.canvas.select([]);
        } else ctx.apply([{ op: 'link_update', id: d.link.id, set: { [d.end]: target.id, [d.end === 'a' ? 'pa' : 'pb']: pinAt(target, at) } }]);
      }
    }
    redraw(); changed();
  }, true);
  stage.addEventListener('pointercancel', () => { cancel(); redraw(); changed(); });
  stage.addEventListener('tool', e => { if (e.detail) { selected = null; cancel(); redraw(); changed(); } });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && drag) { stop(e); cancel(); redraw(); changed(); return; }
    if (!selected || e.target.closest?.('input, textarea, select, [contenteditable="plaintext-only"]')) return;
    if (['Delete', 'Backspace'].includes(e.key)) { stop(e); ctx.apply([{ op: 'link_update', id: selected, remove: true }]); select(null); }
    if (e.key === 'Escape') { stop(e); select(null); }
  }, true);
  return {
    redraw, current, select, dispose() { cancel(); hint.remove(); },
    update(set) { if (current()) { ctx.apply([{ op: 'link_update', id: selected, set }]); redraw(); changed(); } },
    remove() { if (current()) { ctx.apply([{ op: 'link_update', id: selected, remove: true }]); select(null); } },
    flip() { const l = current(); if (l) this.update({ a: l.b, b: l.a, pa: l.pb || null, pb: l.pa || null, bend: -(l.bend ?? 50) }); },
  };
}
