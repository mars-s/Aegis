// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { shapePathCommands } from './model.js';
import { svg, pathD, fitPoints, shapePoints, shiftPoint, localToWorld, worldToLocal, pointOnSegment, splitSegment } from './geometry.js';

export function vectorEditor(ctx, layer, settings, changed) {
  const stage = document.getElementById('stage');
  let draft = [], placing = null, hover = null, editing = null, drag = null, lastTap = null;
  const world = e => ctx.canvas.screenToWorld(e.clientX, e.clientY);
  const screenDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * ctx.canvas.view.z;
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  function path(points, closed = false, attrs = {}) { return svg('path', { d: pathD(points, closed), fill: 'none', stroke: 'var(--focus)', 'stroke-width': 1.5 / ctx.canvas.view.z, ...attrs }); }
  function dot(point, attrs = {}) { return svg('circle', { cx: point.x, cy: point.y, r: 5 / ctx.canvas.view.z, class: 'draw-point', ...attrs }); }
  function finish(closed = false) {
    if (!draft.length) return;
    const points = draft; draft = []; lastTap = null; placing = null; hover = null; layer.replaceChildren();
    if (points.length < 2) return;
    const box = fitPoints(points);
    ctx.apply([{ op: 'create', type: 'path', x: box.x, y: box.y, w: box.w, h: box.h, ref: 'path', props: { points: box.points, ow: box.w, oh: box.h, closed: closed && points.length > 2, stroke: settings.stroke, sw: settings.sw, sdash: settings.sdash, dl: settings.dl, dg: settings.dg, fill: closed ? settings.fill : 'none' } }], ids => ctx.canvas.select([ids.path]));
  }
  function endEdit() { editing = null; drag = null; layer.replaceChildren(); changed(); }
  function commit() {
    if (!editing) return;
    const c = editing.card, p = c.props, box = fitPoints(p.points);
    c.x += box.x; c.y += box.y; c.w = box.w; c.h = box.h;
    c.props = { ...p, points: box.points, ow: box.w, oh: box.h, closed: p.closed && box.points.length > 2 };
    ctx.apply([{ op: 'update', id: c.id, set: { x: c.x, y: c.y, w: c.w, h: c.h, rot: 0, props: { points: c.props.points, ow: c.props.ow, oh: c.props.oh, closed: c.props.closed, radius: c.props.radius ?? null } } }]);
    redraw(); changed();
  }
  function begin(id) {
    finish();
    const source = ctx.canvas.board.cards.find(c => c.id === id); if (!source) return;
    const p = source.props || {}, points = p.points || shapePoints(p.shape, source.w, source.h); if (!points) return;
    const canonical = points.map(q => {
      const out = { ...q, ...localToWorld(source, q) };
      for (const k of ['i', 'o']) if (q[k + 'x'] != null) { const h = localToWorld(source, { x: q[k + 'x'], y: q[k + 'y'] }); out[k + 'x'] = h.x; out[k + 'y'] = h.y; }
      return out;
    });
    const box = fitPoints(canonical);
    editing = { card: { ...source, x: box.x, y: box.y, w: box.w, h: box.h, rot: 0, props: { ...p, points: box.points, ow: box.w, oh: box.h, closed: source.type === 'shape' ? true : !!p.closed } }, selected: new Set() };
    if (source.type === 'shape') {
      editing.card.type = 'path';
      ctx.apply(shapePathCommands(ctx.canvas.board, editing.card));
      delete editing.card.props.shape;
    }
    ctx.canvas.setTool(null); ctx.canvas.select([id]); commit();
    ctx.toast('Drag points or handles. Option-drag makes curves. Enter finishes.');
  }
  function radiusDot(i) {
    const c = editing.card, p = c.props, points = p.points, q = points[i], n = points.length;
    if (q.ix != null || q.ox != null || !p.closed && (i === 0 || i === n - 1)) return null;
    const a = points[(i + n - 1) % n], b = points[(i + 1) % n], la = Math.hypot(a.x - q.x, a.y - q.y) || 1, lb = Math.hypot(b.x - q.x, b.y - q.y) || 1;
    const x = (a.x - q.x) / la + (b.x - q.x) / lb, y = (a.y - q.y) / la + (b.y - q.y) / lb, len = Math.hypot(x, y); if (len < .001) return null;
    const d = Math.max(18 / ctx.canvas.view.z, (q.r ?? p.radius ?? 0) * 1.2 + 10 / ctx.canvas.view.z);
    return { x: q.x + x / len * d, y: q.y + y / len * d, ux: x / len, uy: y / len };
  }
  function redraw() {
    if (editing && !ctx.canvas.board?.cards.some(c => c.id === editing.card.id)) { endEdit(); return; }
    layer.replaceChildren(); const z = ctx.canvas.view.z;
    if (editing) {
      const c = editing.card, p = c.props;
      const group = svg('g', { transform: `translate(${c.x} ${c.y})` });
      group.append(path(p.points, p.closed, { d: pathD(p.points, p.closed, p.radius || 0), class: 'draw-edit-outline', 'data-vector': 'outline', 'pointer-events': 'stroke', 'stroke-width': 8 / z, 'stroke-opacity': .25 }));
      p.points.forEach((q, i) => {
        const selected = editing.selected.has(i);
        if (!editing.selected.size || selected) for (const k of ['i', 'o']) if (q[k + 'x'] != null) {
          group.append(svg('line', { x1: q.x, y1: q.y, x2: q[k + 'x'], y2: q[k + 'y'], stroke: 'var(--focus)', 'stroke-width': 1 / z }));
          group.append(dot({ x: q[k + 'x'], y: q[k + 'y'] }, { r: 4 / z, 'data-vector': k, 'data-point': i, class: 'draw-point draw-handle' }));
        }
        if (selected) { const rd = radiusDot(i); if (rd) group.append(dot(rd, { r: 4 / z, 'data-vector': 'radius', 'data-point': i, class: 'draw-point draw-radius' })); }
        group.append(dot(q, { 'data-vector': 'point', 'data-point': i, class: 'draw-point' + (selected ? ' on' : '') }));
      });
      layer.append(group); return;
    }
    if (!draft.length) return;
    layer.append(path(draft));
    if (hover && placing === null) layer.append(path([draft.at(-1), hover], false, { 'stroke-dasharray': `${4 / z} ${4 / z}` }));
    for (const q of draft) {
      if (q.ox != null) { layer.append(path([{ x: q.ix ?? q.x, y: q.iy ?? q.y }, { x: q.ox, y: q.oy }], false, { opacity: .5 })); layer.append(dot({ x: q.ox, y: q.oy }, { r: 3 / z })); }
      layer.append(dot(q));
    }
  }
  const pointer = {
    down(e, at) {
      stage.focus({ preventScroll: true });
      endEdit();
      if (draft.length > 2 && screenDistance(draft[0], at) < 10) { finish(true); return; }
      if (lastTap && e.timeStamp - lastTap.time < 400 && screenDistance(lastTap, at) < 6 && draft.length > 1) { finish(); return; }
      lastTap = { ...at, time: e.timeStamp };
      if (e.shiftKey && draft.length) { const last = draft.at(-1), a = Math.round(Math.atan2(at.y - last.y, at.x - last.x) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(at.x - last.x, at.y - last.y); at = { x: last.x + Math.cos(a) * len, y: last.y + Math.sin(a) * len }; }
      draft.push({ ...at }); placing = draft.length - 1; hover = null; redraw();
    },
    move(e, at) {
      if (placing === null) return;
      const q = draft[placing]; if (!q || screenDistance(q, at) < 3) return;
      if (e.shiftKey) { const a = Math.round(Math.atan2(at.y - q.y, at.x - q.x) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(at.x - q.x, at.y - q.y); at = { x: q.x + Math.cos(a) * len, y: q.y + Math.sin(a) * len }; }
      Object.assign(q, { ox: at.x, oy: at.y, ix: e.altKey ? q.x : 2 * q.x - at.x, iy: e.altKey ? q.y : 2 * q.y - at.y }); redraw();
    },
    up() { placing = null; redraw(); },
  };
  function nearestSegment(local) {
    const pts = editing.card.props.points, n = pts.length, closed = editing.card.props.closed;
    let best = { distance: Infinity, index: 0, t: .5 };
    for (let i = 0; i < n - (closed ? 0 : 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const count = Math.min(2048, Math.max(32, Math.ceil((Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot((a.ox ?? a.x) - a.x, (a.oy ?? a.y) - a.y) + Math.hypot((b.ix ?? b.x) - b.x, (b.iy ?? b.y) - b.y)) * ctx.canvas.view.z / 2)));
      for (let j = 1; j < count; j++) { const t = j / count, q = pointOnSegment(a, b, t), distance = Math.hypot(local.x - q.x, local.y - q.y); if (distance < best.distance) best = { distance, index: i, t }; }
    }
    return best;
  }
  stage.addEventListener('pointerdown', e => {
    if (!editing || e.button !== 0 || e.target.closest('button, input, select, textarea, [contenteditable="plaintext-only"]')) return;
    const target = e.target.closest('[data-vector]');
    if (!target) { endEdit(); return; }
    stop(e); stage.focus({ preventScroll: true });
    const c = editing.card, local = worldToLocal(c, world(e)), kind = target.dataset.vector;
    let i = Number(target.dataset.point);
    if (kind === 'outline') { const near = nearestSegment(local); c.props.points = splitSegment(c.props.points, near.index, near.t); i = near.index + 1; editing.selected = new Set([i]); }
    else if (kind === 'point') { if (e.shiftKey) { editing.selected.has(i) ? editing.selected.delete(i) : editing.selected.add(i); } else if (!editing.selected.has(i)) editing.selected = new Set([i]); }
    drag = { kind: kind === 'outline' ? 'point' : kind === 'point' && e.altKey ? 'pull' : kind, i, local, points: structuredClone(c.props.points), rd: kind === 'radius' ? radiusDot(i) : null, moved: false };
    stage.setPointerCapture(e.pointerId); redraw(); changed();
  }, true);
  stage.addEventListener('pointermove', e => {
    if (!drag || !editing) { if (ctx.canvas.tool === 'vector' && draft.length) { hover = world(e); redraw(); } return; }
    stop(e); const c = editing.card, local = worldToLocal(c, world(e)), p = c.props, q = p.points[drag.i];
    let dx = local.x - drag.local.x, dy = local.y - drag.local.y;
    if (Math.hypot(dx, dy) > .5) drag.moved = true;
    if (!drag.moved) return;
    if (drag.kind === 'point') {
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      for (const i of editing.selected) p.points[i] = shiftPoint(drag.points[i], dx, dy);
    } else if (['i', 'o', 'pull'].includes(drag.kind)) {
      const k = drag.kind === 'i' ? 'i' : 'o', other = k === 'i' ? 'o' : 'i';
      q[k + 'x'] = local.x; q[k + 'y'] = local.y; delete q.r;
      if (!e.altKey || drag.kind === 'pull') { q[other + 'x'] = 2 * q.x - local.x; q[other + 'y'] = 2 * q.y - local.y; }
    } else if (drag.kind === 'radius' && drag.rd) {
      const r = Math.max(0, Math.round(((local.x - q.x) * drag.rd.ux + (local.y - q.y) * drag.rd.uy - 10 / ctx.canvas.view.z) / 1.2));
      for (const i of editing.selected) p.points[i].r = r;
    }
    redraw();
  }, true);
  stage.addEventListener('pointerup', e => { if (!drag || !editing) return; stop(e); drag = null; commit(); }, true);
  stage.addEventListener('pointercancel', () => { if (editing && drag) { editing.card.props.points = drag.points; drag = null; redraw(); } });
  stage.addEventListener('dblclick', e => {
    // Look through the selection outline's grab strips to whatever card is underneath.
    const under = document.elementsFromPoint(e.clientX, e.clientY).find(el => !el.closest('.editing-outline')) || e.target;
    const target = under.closest('[data-vector="point"]');
    if (editing && target) {
      stop(e); const i = Number(target.dataset.point), pts = editing.card.props.points, q = pts[i];
      if (q.ix != null || q.ox != null) { for (const k of ['ix', 'iy', 'ox', 'oy', 'r']) delete q[k]; }
      else { const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length], dx = (b.x - a.x) / 4, dy = (b.y - a.y) / 4; Object.assign(q, { ix: q.x - dx, iy: q.y - dy, ox: q.x + dx, oy: q.y + dy }); delete q.r; }
      commit(); return;
    }
    if (ctx.canvas.tool === 'vector') { stop(e); if (draft.length > 1 && screenDistance(draft.at(-1), draft.at(-2)) < 3) draft.pop(); finish(); return; }
    const text = under.closest('.draw-text');
    if (text) { stop(e); text.contentEditable = 'plaintext-only'; text.focus(); return; }
    const cardEl = under.closest('.card.shape, .card.path'); if (!cardEl) return;
    stop(e); begin(cardEl.dataset.id);
  }, true);
  document.addEventListener('draw-edit', e => begin(e.detail));
  addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, select, [contenteditable="plaintext-only"]')) return;
    if (editing) {
      if (['Escape', 'Enter'].includes(e.key)) { stop(e); endEdit(); }
      if (['Delete', 'Backspace'].includes(e.key)) { stop(e); const p = editing.card.props, next = p.points.filter((_, i) => !editing.selected.has(i)); if (next.length >= 2) { p.points = next; editing.selected.clear(); commit(); } }
    } else if (draft.length) {
      if (['Escape', 'Enter'].includes(e.key)) { stop(e); finish(); if (e.key === 'Escape') ctx.canvas.setTool(null); }
      if (['Delete', 'Backspace'].includes(e.key)) { stop(e); draft.pop(); placing = null; redraw(); }
    }
  }, true);
  stage.addEventListener('tool', e => { if (e.detail !== 'vector') finish(); if (e.detail) endEdit(); });
  return {
    pointer, begin, finish, endEdit, redraw,
    cancel() { draft = []; placing = null; hover = null; endEdit(); },
    get selectionKey() { return editing ? [...editing.selected].map(i => [i, editing.card.props.points[i]?.r || 0]) : []; },
    get radiusValue() { if (!editing) return 0; const i = [...editing.selected][0]; return editing.card.props.points[i]?.r ?? editing.card.props.radius ?? 0; },
    get active() { return !!editing; },
    radius(value) { if (!editing) return; const p = editing.card.props; if (editing.selected.size) for (const i of editing.selected) p.points[i].r = value; else p.radius = value; commit(); },
  };
}
