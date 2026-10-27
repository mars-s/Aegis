import { CardSchema, JsonRecordSchema } from '@aegis/domain/schema';
import type { CardId } from '@aegis/domain';
import type { CanvasEngine, SceneTool, ToolPointer } from '@aegis/scene';
import type { FeatureWorkspace } from '../../composition.js';
import { colour, DrawingProps, pathD, shapePoints } from './art.js';
import type { VectorPoint } from './art.js';
import { shapePathCommands } from './commands.js';
import { fitPoints, pointOnSegment, shiftPoint, splitSegment, worldPoints } from './vector-geometry.js';

interface Editing { readonly id: CardId; readonly corners: (radius: number) => void; readonly close: () => void }
const editors = new WeakMap<CanvasEngine, Editing>();
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Readonly<Record<string, string | number>>) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
};
type Handle = { readonly index: number; readonly kind: 'point' | 'i' | 'o' };
interface Drag { readonly handle: Handle; readonly start: ToolPointer; readonly points: readonly VectorPoint[]; readonly toggle: boolean; changed: boolean; moved: boolean }

export function editPointCorners(engine: CanvasEngine | null, id: CardId, radius: number): boolean {
  const editor = engine ? editors.get(engine) : undefined;
  if (editor?.id !== id) return false;
  editor.corners(radius); return true;
}

export function beginPointEdit(workspace: FeatureWorkspace, engine: CanvasEngine, id: CardId): void {
  const source = workspace.record(id).getSnapshot(); if (!source || source.type !== 'shape' && source.type !== 'path') return;
  const original = DrawingProps.parse(source.props ?? {});
  if (source.type === 'shape' && (original.shape === 'line' || original.shape === 'heart')) return;
  editors.get(engine)?.close();
  let points = worldPoints(source, original.points.length ? original.points : shapePoints(original.shape, source.w, source.h), original.ow, original.oh);
  if (points.length < 2) return;
  const initial = fitPoints(points), closed = source.type === 'shape' || original.closed;
  const converted = CardSchema.parse({ ...source, type: 'path', x: initial.x, y: initial.y, w: initial.w, h: initial.h, rot: 0, props: { ...source.props, points: initial.points, ow: initial.w, oh: initial.h, closed } });
  if (source.type === 'shape') workspace.submit(shapePathCommands(workspace.scene.snapshot(), converted));
  else workspace.submit([{ op: 'update', id, set: JsonRecordSchema.parse({ x: initial.x, y: initial.y, w: initial.w, h: initial.h, rot: 0, props: converted.props }) }]);
  workspace.act({ kind: 'select', ids: [id] }); engine.pin(id, 'capture', true);
  const stage = document.getElementById('stage'); if (!stage) return;
  const layer = svg('svg', { class: 'draw-vector-editor', 'aria-label': 'Vector points', width: '100%', height: '100%' }), group = svg('g', {});
  Object.assign(layer.style, { position: 'absolute', inset: '0', overflow: 'visible', pointerEvents: 'none', zIndex: '5' });
  layer.append(group); stage.append(layer);
  const selected = new Set<number>();
  let drag: Drag | null = null, dirty = true, disposed = false, lastTap: { index: number; time: number } | null = null;
  const record = workspace.record(id);
  const shell = engine.leases.getSnapshot().find(lease => lease.cardId === id)?.host.closest('.card');
  shell?.classList.add('vector-editing');
  function payload() {
    const box = fitPoints(points), current = DrawingProps.parse(record.getSnapshot()?.props ?? {});
    return JsonRecordSchema.parse({ x: box.x, y: box.y, w: box.w, h: box.h, rot: 0, props: { points: box.points, ow: box.w, oh: box.h, closed: closed && points.length > 2, radius: current.radius } });
  }
  function commit(): void { engine.commitTool({ commands: [{ op: 'update', id, set: payload() }], selection: [id] }); dirty = true; engine.invalidate(); }
  function nearestHandle(at: ToolPointer): Handle | null {
    let best: Handle | null = null, distance = 9 / engine.camera().zoom;
    for (const [index, point] of points.entries()) {
      const handles: readonly (readonly [Handle['kind'], number, number])[] = [['point', point.x, point.y], ...(!selected.size || selected.has(index) ? [...(point.ix === undefined ? [] : [['i' as const, point.ix, point.iy ?? point.y] as const]), ...(point.ox === undefined ? [] : [['o' as const, point.ox, point.oy ?? point.y] as const])] : [])];
      for (const [kind, x, y] of handles) { const next = Math.hypot(at.world.x - x, at.world.y - y); if (next < distance) { best = { index, kind }; distance = next; } }
    }
    return best;
  }
  function nearestSegment(at: ToolPointer): { index: number; t: number; distance: number } {
    let best = { index: 0, t: .5, distance: Infinity };
    for (const [index, a] of points.entries()) {
      const b = points[(index + 1) % points.length]; if (!b || !closed && index === points.length - 1) continue;
      const count = Math.min(2048, Math.max(32, Math.ceil((Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot((a.ox ?? a.x) - a.x, (a.oy ?? a.y) - a.y) + Math.hypot((b.ix ?? b.x) - b.x, (b.iy ?? b.y) - b.y)) * engine.camera().zoom / 2)));
      for (let j = 1; j < count; j++) { const t = j / count, point = pointOnSegment(a, b, t), distance = Math.hypot(at.world.x - point.x, at.world.y - point.y); if (distance < best.distance) best = { index, t, distance }; }
    }
    return best;
  }
  function close(): void {
    if (disposed) return; disposed = true;
    offFrame(); offRecord(); layer.remove(); shell?.classList.remove('vector-editing'); engine.pin(id, 'capture', false);
    if (editors.get(engine)?.close === close) {
      editors.delete(engine);
      if (engine.toolName() === 'edit-vector') engine.tool(null);
    }
  }
  const tool: SceneTool = {
    id: 'edit-vector', accepts: point => point.button === 0,
    down: at => {
      let handle = nearestHandle(at), inserted = false, toggle = false;
      if (!handle) {
        const near = nearestSegment(at);
        if (near.distance * engine.camera().zoom > 10) { engine.afterInput(close); return; }
        inserted = true; points = splitSegment(points, near.index, near.t); handle = { index: near.index + 1, kind: 'point' }; selected.clear(); selected.add(handle.index);
      } else if (handle.kind === 'point') {
        toggle = lastTap?.index === handle.index && at.time - lastTap.time < 400;
        lastTap = { index: handle.index, time: at.time };
        if (at.shift) { if (!selected.delete(handle.index)) selected.add(handle.index); }
        else if (!selected.has(handle.index)) { selected.clear(); selected.add(handle.index); }
      }
      drag = { handle, start: at, points: points.map(point => ({ ...point })), toggle, changed: inserted, moved: false }; dirty = true; engine.invalidate();
    },
    move: samples => {
      if (!drag) return;
      const at = samples.at(-1); if (!at || !at.buttons) return;
      let dx = at.world.x - drag.start.world.x, dy = at.world.y - drag.start.world.y;
      if (Math.hypot(dx, dy) * engine.camera().zoom < 3 && !drag.moved) return;
      drag.moved = true; drag.changed = true;
      if (drag.handle.kind === 'point' && !at.alt) {
        if (at.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        points = drag.points.map((point, index) => selected.has(index) ? shiftPoint(point, dx, dy) : { ...point });
      } else {
        const point = points[drag.handle.index]; if (!point) return;
        const kind = drag.handle.kind === 'i' ? 'i' : 'o';
        if (kind === 'i') { point.ix = at.world.x; point.iy = at.world.y; if (!at.alt) { point.ox = point.x * 2 - at.world.x; point.oy = point.y * 2 - at.world.y; } }
        else { point.ox = at.world.x; point.oy = at.world.y; if (!at.alt || drag.handle.kind === 'point') { point.ix = point.x * 2 - at.world.x; point.iy = point.y * 2 - at.world.y; } }
        delete point.r;
      }
      dirty = true; engine.invalidate();
    },
    up: () => {
      if (!drag) return;
      if (drag.toggle && !drag.moved) {
        const index = drag.handle.index, point = points[index];
        if (point) {
          if (point.ix !== undefined || point.ox !== undefined) { delete point.ix; delete point.iy; delete point.ox; delete point.oy; }
          else { const previous = points[(index + points.length - 1) % points.length], next = points[(index + 1) % points.length]; if (previous && next) { const dx = (next.x - previous.x) / 4, dy = (next.y - previous.y) / 4; Object.assign(point, { ix: point.x - dx, iy: point.y - dy, ox: point.x + dx, oy: point.y + dy }); } }
          delete point.r; drag.changed = true;
        }
      }
      const changed = drag.changed; drag = null; if (changed) commit();
    },
    acceptsKey: key => ['Enter', 'Escape', 'Delete', 'Backspace'].includes(key.key),
    key: key => {
      if (key.key === 'Enter' || key.key === 'Escape') { engine.afterInput(close); return; }
      const next = points.filter((_, index) => !selected.has(index)); if (next.length < 2) return;
      points = next; selected.clear(); commit();
    },
    cancel: reason => { if (reason === 'pan' || reason === 'pointer-cancel' || reason === 'lost-capture') { if (drag) points = drag.points.map(point => ({ ...point })); drag = null; dirty = true; return; } engine.afterInput(close); },
  };
  const offFrame = engine.registerFrameParticipant({ write: () => {
    if (disposed) return;
    const camera = engine.camera(); group.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
    if (!dirty) return; dirty = false; group.replaceChildren();
    const current = DrawingProps.parse(record.getSnapshot()?.props ?? {});
    group.append(svg('path', { d: pathD(points, closed, current.radius), fill: closed ? colour(current.fill, 'none') : 'none', stroke: colour(current.stroke), 'stroke-width': current.sw ?? 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    group.append(svg('path', { class: 'draw-edit-outline', 'data-vector': 'outline', d: pathD(points, closed, current.radius), fill: 'none', stroke: 'var(--focus)', 'stroke-width': 8 / camera.zoom, 'stroke-opacity': .25, 'pointer-events': 'stroke' }));
    for (const [index, point] of points.entries()) {
      if (!selected.size || selected.has(index)) for (const kind of ['i', 'o'] as const) {
        const x = kind === 'i' ? point.ix : point.ox, y = kind === 'i' ? point.iy : point.oy; if (x === undefined || y === undefined) continue;
        group.append(svg('line', { x1: point.x, y1: point.y, x2: x, y2: y, stroke: 'var(--focus)', 'stroke-width': 1 / camera.zoom }));
        group.append(svg('circle', { cx: x, cy: y, r: 4 / camera.zoom, class: 'draw-point draw-handle', 'data-vector': kind, 'data-point': index, 'pointer-events': 'all' }));
      }
      group.append(svg('circle', { cx: point.x, cy: point.y, r: 5 / camera.zoom, class: `draw-point${selected.has(index) ? ' on' : ''}`, 'data-vector': 'point', 'data-point': index, 'pointer-events': 'all' }));
    }
  } });
  const offRecord = record.subscribe(() => {
    const card = record.getSnapshot(); if (!card) { engine.afterInput(close); return; }
    if (!drag) { const props = DrawingProps.parse(card.props ?? {}); points = worldPoints(card, props.points, props.ow, props.oh); }
    dirty = true; engine.invalidate();
  });
  editors.set(engine, { id, close, corners: radius => {
    lastTap = null;
    if (selected.size) points = points.map((point, index) => selected.has(index) ? { ...point, r: radius } : point);
    else points = points.map(point => ({ ...point, r: radius }));
    const set = payload(); workspace.submit([{ op: 'update', id, set }]);
  } });
  engine.tool(tool); engine.invalidate(); stage.focus({ preventScroll: true });
}
