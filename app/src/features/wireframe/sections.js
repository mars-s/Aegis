// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { effectiveFlag } from '../editing/model.js';
import { textOutline } from './render.js';

// Section bodies select through the glass until the section itself is selected.
export function mountSectionBehaviour(ctx) {
  const stage = document.getElementById('stage'), world = document.getElementById('world'), marquee = document.getElementById('marquee');
  let gesture = null, space = false;
  function paint() {
    world.style.setProperty('--wf-label-scale', String(Math.min(4, Math.max(1, 1 / ctx.canvas.view.z))));
    for (const card of ctx.canvas.board?.cards || []) {
      if (card.type !== 'title') continue;
      const body = ctx.canvas.mountedEl(card.id)?.querySelector('.body');
      if (body && (card.props?.hollow || card.props?.ink || card.props?.sw != null)) textOutline(body, card);
    }
  }
  function down(e) {
    const el = e.target.closest('.card.section');
    if (!el || e.button !== 0 || e.shiftKey || space || ctx.canvas.tool || ctx.canvas.selection().includes(el.dataset.id) || e.target.closest('.wf-section-name, .resize, [data-connect-card]')) return;
    const card = ctx.canvas.board.cards.find(c => c.id === el.dataset.id);
    if (!card || effectiveFlag(ctx.canvas.board, card, 'locked')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    document.activeElement?.blur(); stage.focus({ preventScroll: true });
    gesture = { id: card.id, pointer: e.pointerId, x: e.clientX, y: e.clientY };
    ctx.canvas.select([]); stage.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!gesture || e.pointerId !== gesture.pointer) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const x = Math.min(gesture.x, e.clientX), y = Math.min(gesture.y, e.clientY), w = Math.abs(e.clientX - gesture.x), h = Math.abs(e.clientY - gesture.y);
    Object.assign(marquee.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); marquee.hidden = w + h < 4;
    const a = ctx.canvas.screenToWorld(x, y), b = ctx.canvas.screenToWorld(x + w, y + h), board = ctx.canvas.board;
    const hits = board.cards.filter(c => !effectiveFlag(board, c, 'hidden') && !effectiveFlag(board, c, 'locked') && (c.type === 'section'
      ? c.x > a.x && c.x + c.w < b.x && c.y > a.y && c.y + c.h < b.y
      : c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y));
    const groups = new Set(hits.map(c => c.group).filter(Boolean));
    ctx.canvas.select(board.cards.filter(c => (hits.includes(c) || c.group && groups.has(c.group)) && !effectiveFlag(board, c, 'hidden') && !effectiveFlag(board, c, 'locked')).map(c => c.id));
  }
  function finish(e) {
    if (!gesture || e.pointerId !== gesture.pointer) return;
    e.stopImmediatePropagation(); const g = gesture; gesture = null; marquee.hidden = true;
    if (stage.hasPointerCapture(g.pointer)) stage.releasePointerCapture(g.pointer);
    if (e.type === 'pointercancel') ctx.canvas.select([]);
    else if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) ctx.canvas.select([g.id]);
  }
  function key(e) { if (e.code === 'Space') space = e.type === 'keydown' && !e.target.closest('input, textarea, select, [contenteditable]'); }
  function reset() { space = false; if (gesture) finish({ type: 'pointercancel', pointerId: gesture.pointer, stopImmediatePropagation() {} }); }
  const listeners = [['pointerdown', down], ['pointermove', move], ['pointerup', finish], ['pointercancel', finish]];
  for (const [type, handler] of listeners) stage.addEventListener(type, handler, true);
  stage.addEventListener('canvaspaint', paint); stage.addEventListener('boardchange', reset);
  addEventListener('keydown', key); addEventListener('keyup', key); addEventListener('blur', reset);
  paint();
  return () => {
    reset(); for (const [type, handler] of listeners) stage.removeEventListener(type, handler, true);
    stage.removeEventListener('canvaspaint', paint); stage.removeEventListener('boardchange', reset);
    removeEventListener('keydown', key); removeEventListener('keyup', key); removeEventListener('blur', reset);
    world.style.removeProperty('--wf-label-scale');
  };
}
