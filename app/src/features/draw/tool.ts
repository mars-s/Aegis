import { CardIdSchema, CommandSchema } from '@aegis/domain/schema';
import type { CardId, Command } from '@aegis/domain/schema';
import type { CanvasEngine, PreviewColour, SceneTool, ToolPointer, ToolPrimitive } from '@aegis/scene';
import type { FeatureWorkspace } from '../../composition.js';
import { butter, centerline, colour, pathD, shapePoints } from './art.js';
import type { InkPoint, VectorPoint } from './art.js';
import type { DrawSettings } from './Inspector.js';
import { fitPoints, inkHit } from './vector-geometry.js';
import { toolExit } from '../../platform/tool-lifetime.js';

const id = (): CardId => CardIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 16));
const previewColour = (value: string): PreviewColour => { const hex = colour(value); return hex.startsWith('#') ? { kind: 'hex', value: hex } : { kind: 'theme', token: 'text' }; };
const stroke = (value = 'ink', width = 1.5) => ({ colour: previewColour(value), width, dash: [] });
export function drawingTool(engine: CanvasEngine, workspace: FeatureWorkspace, kind: 'ink' | 'shape' | 'path' | 'stamp', settings: () => DrawSettings, finished: () => void): SceneTool {
  const name = kind === 'ink' ? 'draw-ink' : kind === 'path' ? 'vector' : `draw-${kind}`;
  const release = toolExit(engine, name, finished);
  let active = true;
  const exit = () => { active = false; release(); };
  let start: ToolPointer | null = null, samples: InkPoint[] = [], points: VectorPoint[] = [], erased = new Set<CardId>();
  let lastTap: ToolPointer | null = null;
  function clear(): void { start = null; samples = []; points = []; erased = new Set(); engine.preview(null); }
  function commit(commands: readonly Command[], selection: readonly CardId[]): void { engine.commitTool({ commands, selection }); }
  function paint(point: ToolPointer): void {
    const prefs = settings(), size = prefs.sizes[prefs.pen], primitives: ToolPrimitive[] = [];
    if (kind === 'ink' && prefs.pen === 'eraser') {
      for (const card of workspace.scene.snapshot().cards) if (card.type === 'ink' && inkHit(card, point.world, size / 2)) erased.add(card.id);
      primitives.push({ kind: 'circle', opacity: 1, space: 'world', centre: point.world, radius: size / 2, fill: null, stroke: stroke() });
    } else if (kind === 'ink' && start) {
      samples.push([point.world.x, point.world.y, point.time]);
      primitives.push({ kind: 'path', opacity: prefs.pen === 'hi' ? .38 : 1, space: 'world', d: prefs.pen === 'pen' ? butter(samples, false, size) : centerline(samples), fill: prefs.pen === 'pen' ? previewColour(prefs.ink) : null, stroke: prefs.pen === 'pen' ? null : stroke(prefs.ink, size * engine.camera().zoom) });
    } else if (kind === 'path' && points.length) {
      primitives.push({ kind: 'path', opacity: 1, space: 'world', d: pathD([...points, point.world], false), fill: null, stroke: stroke(prefs.stroke, prefs.sw) });
    } else if (kind === 'shape' || kind === 'stamp') {
      const x = start ? Math.min(start.world.x, point.world.x) : point.world.x, y = start ? Math.min(start.world.y, point.world.y) : point.world.y;
      primitives.push({ kind: 'rect', opacity: .7, space: 'world', bounds: { x, y, width: start ? Math.max(2, Math.abs(point.world.x - start.world.x)) : 160, height: start ? Math.max(2, Math.abs(point.world.y - start.world.y)) : 100 }, radius: 4, fill: null, stroke: stroke() });
    }
    engine.preview({ cursor: 'crosshair', primitives });
  }
  function finishPath(closed = false): void {
    if (points.length > 1) {
      const box = fitPoints(points), prefs = settings(), newId = id();
      commit([CommandSchema.parse({ op: 'create', newId, type: 'path', x: box.x, y: box.y, w: box.w, h: box.h, props: { points: box.points, ow: box.w, oh: box.h, stroke: prefs.stroke, sw: prefs.sw, sdash: prefs.sdash, dl: prefs.dl, dg: prefs.dg, closed: closed && points.length > 2, fill: closed ? prefs.fill : 'none' } })], [newId]);
    }
    clear(); lastTap = null; exit();
  }
  return {
    id: name,
    accepts: point => active && point.button === 0,
    down: point => {
      if (!active) return;
      if (kind === 'path') {
        const first = points[0], last = points.at(-1);
        if (first && points.length > 2 && Math.hypot(point.world.x - first.x, point.world.y - first.y) * engine.camera().zoom < 10) { finishPath(true); return; }
        if (lastTap && last && points.length > 1 && point.time - lastTap.time < 400 && Math.hypot(point.screen.x - lastTap.screen.x, point.screen.y - lastTap.screen.y) < 6) { finishPath(); return; }
        lastTap = point;
        let at = point.world;
        if (last && point.shift) { const angle = Math.round(Math.atan2(at.y - last.y, at.x - last.x) / (Math.PI / 4)) * Math.PI / 4, length = Math.hypot(at.x - last.x, at.y - last.y); at = { x: last.x + Math.cos(angle) * length, y: last.y + Math.sin(angle) * length }; }
        points.push({ ...at });
      }
      start = point; paint(point);
    },
    move: values => { if (!active) return; for (const point of values) { if (kind === 'path' && start && point.buttons) { const last = points.at(-1); if (last) points[points.length - 1] = { ...last, ox: point.world.x, oy: point.world.y, ix: point.alt ? last.x : last.x * 2 - point.world.x, iy: point.alt ? last.y : last.y * 2 - point.world.y }; } paint(point); } },
    up: point => {
      if (!active || !start) return;
      if (kind === 'path') { start = null; return; }
      const prefs = settings(), newId = id();
      if (kind === 'ink' && prefs.pen === 'eraser') { if (erased.size) commit([{ op: 'delete', ids: [...erased] }], []); }
      else if (kind === 'ink') {
        samples.push([point.world.x, point.world.y, point.time]); const pad = prefs.sizes[prefs.pen] / 2;
        const x = Math.min(...samples.map(sample => sample[0])) - pad, y = Math.min(...samples.map(sample => sample[1])) - pad;
        const w = Math.max(40, ...samples.map(sample => sample[0] - x + pad)), h = Math.max(24, ...samples.map(sample => sample[1] - y + pad));
        commit([{ op: 'create', newId, type: 'ink', x, y, w, h, props: { ow: w, oh: h, points: samples.map(sample => [sample[0] - x, sample[1] - y, sample[2]]), pen: prefs.pen, ink: prefs.ink, size: prefs.sizes[prefs.pen] } }], []);
      } else if (kind === 'stamp') commit([{ op: 'create', newId, type: 'stamp', x: point.world.x - 40, y: point.world.y - 40, w: 80, h: 80, props: { emoji: prefs.emoji } }], [newId]);
      else {
        const dragged = Math.hypot(point.screen.x - start.screen.x, point.screen.y - start.screen.y) > 4;
        const w = dragged ? Math.max(40, Math.abs(point.world.x - start.world.x)) : 180, h = dragged ? Math.max(24, Math.abs(point.world.y - start.world.y)) : prefs.shape === 'line' ? 24 : 120;
        const x = dragged ? Math.min(start.world.x, point.world.x) : point.world.x - w / 2, y = dragged ? Math.min(start.world.y, point.world.y) : point.world.y - h / 2;
        commit([CommandSchema.parse({ op: 'create', newId, type: 'shape', x, y, w, h, props: { shape: prefs.shape, ...(prefs.shape === 'line' || prefs.shape === 'heart' ? {} : { points: shapePoints(prefs.shape, w, h), ow: w, oh: h, closed: true }), fill: prefs.fill, stroke: prefs.stroke, sw: prefs.sw, sdash: prefs.sdash, dl: prefs.dl, dg: prefs.dg } })], [newId]);
      }
      clear();
    },
    acceptsKey: key => key.key === 'Escape' || kind === 'path' && ['Enter', 'Backspace', 'Delete'].includes(key.key),
    key: key => { if (kind === 'path' && ['Backspace', 'Delete'].includes(key.key)) { points.pop(); engine.preview(null); return; } if (kind === 'path' && (key.key === 'Enter' || points.length > 1)) finishPath(); else { clear(); exit(); } },
    cancel: clear,
  };
}
