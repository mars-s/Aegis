// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { inkNode, fitPoints, inkHit } from './geometry.js';
export const PEN_RANGE = { pen: [2, 48], marker: [2, 40], hi: [8, 72], eraser: [10, 90] };
export function inkTool(state, ui) {
  let stroke = null, erased = new Set(), lastErase = null, active = false;
  function erase(at, ctx) {
    const radius = state.sizes.eraser / 2 / ctx.canvas.view.z;
    const samples = [at];
    if (lastErase) { const n = Math.ceil(Math.hypot(at.x - lastErase.x, at.y - lastErase.y) / Math.max(1, radius / 2)); for (let i = 1; i < n; i++) samples.push({ x: lastErase.x + (at.x - lastErase.x) * i / n, y: lastErase.y + (at.y - lastErase.y) * i / n }); }
    for (const card of ctx.canvas.board.cards) if (card.type === 'ink' && samples.some(p => inkHit(card, p, radius))) erased.add(card.id);
    for (const id of erased) { const el = ctx.canvas.mountedEl(id); if (el) el.style.opacity = '.15'; }
    lastErase = at;
  }
  return {
    down(e, at, ctx) {
      active = true; ctx.canvas.select([]);
      if (state.pen === 'eraser') { erased.clear(); lastErase = null; erase(at, ctx); return; }
      stroke = { points: [[at.x, at.y, e.timeStamp]], pen: state.pen, size: state.sizes[state.pen], ink: state.ink };
      ui.live.replaceChildren(inkNode(stroke.points, stroke.pen, stroke.size, stroke.ink, false));
    },
    move(e, at, ctx) {
      if (!active) return;
      if (state.pen === 'eraser') { erase(at, ctx); return; }
      if (!stroke) return;
      const events = e.getCoalescedEvents?.() || [e];
      for (const event of events.length ? events : [e]) {
        const p = ctx.canvas.screenToWorld(event.clientX, event.clientY), last = stroke.points.at(-1);
        if (Math.hypot(p.x - last[0], p.y - last[1]) >= 1 / ctx.canvas.view.z) stroke.points.push([p.x, p.y, event.timeStamp]);
      }
      ui.live.replaceChildren(inkNode(stroke.points, stroke.pen, stroke.size, stroke.ink, false));
    },
    up(e, at, ctx) {
      if (!active) return; active = false;
      if (state.pen === 'eraser') { erase(at, ctx); if (erased.size) ctx.apply([{ op: 'delete', ids: [...erased] }]); erased.clear(); lastErase = null; return; }
      if (!stroke) return;
      const s = stroke; stroke = null; ui.live.replaceChildren();
      const last = s.points.at(-1); if (Math.hypot(at.x - last[0], at.y - last[1]) > .5) s.points.push([at.x, at.y, e.timeStamp]);
      const box = fitPoints(s.points, s.size + 4);
      ctx.apply([{ op: 'create', type: 'ink', x: box.x, y: box.y, w: box.w, h: box.h, props: { points: box.points, ow: box.w, oh: box.h, pen: s.pen, size: s.size, ink: s.ink } }]);
    },
    cancel(ctx) { active = false; stroke = null; ui.live.replaceChildren(); for (const id of erased) { const el = ctx.canvas.mountedEl(id); if (el) el.style.opacity = ''; } erased.clear(); lastErase = null; },
  };
}
