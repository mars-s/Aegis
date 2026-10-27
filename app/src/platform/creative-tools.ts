import { CardIdSchema, CommandSchema } from '@aegis/domain/schema';
import type { CardId, Command } from '@aegis/domain/schema';
import type { CanvasEngine, PreviewColour, SceneTool, ToolPointer, ToolPrimitive } from '@aegis/scene';
import type { FeatureWorkspace } from '../composition.js';
import { butter, centerline, colour, pathD, shapePoints } from '../features/draw/art.js';
import type { InkPoint, VectorPoint } from '../features/draw/art.js';
import type { DrawSettings } from '../features/draw/Inspector.js';
import { pieceCommands, screenCommand, wireCard } from '../features/wireframe/commands.js';
import { toolExit } from './tool-lifetime.js';
import type { WirePlacement } from '../features/wireframe/WireframePanel.js';

const id = (): CardId => CardIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 16));
const previewColour = (value: string): PreviewColour => { const hex = colour(value); return hex.startsWith('#') ? { kind: 'hex', value: hex } : { kind: 'theme', token: 'text' }; };
const stroke = (value = 'ink', width = 1.5) => ({ colour: previewColour(value), width, dash: [] });
export function drawingTool(engine: CanvasEngine, workspace: FeatureWorkspace, kind: 'ink' | 'shape' | 'path' | 'stamp', settings: () => DrawSettings, finished: () => void): SceneTool {
  const name = kind === 'ink' ? 'draw-ink' : kind === 'path' ? 'vector' : `draw-${kind}`;
  const exit = toolExit(engine, name, finished);
  let start: ToolPointer | null = null, samples: InkPoint[] = [], points: VectorPoint[] = [], erased = new Set<CardId>();
  function clear(): void { start = null; samples = []; points = []; erased = new Set(); engine.preview(null); }
  function commit(commands: readonly Command[], selection: readonly CardId[]): void { engine.commitTool({ commands, selection }); }
  function paint(point: ToolPointer): void {
    const prefs = settings(), size = prefs.sizes[prefs.pen], primitives: ToolPrimitive[] = [];
    if (kind === 'ink' && prefs.pen === 'eraser') {
      for (const card of workspace.scene.snapshot().cards) if (card.type === 'ink' && point.world.x >= card.x - size / 2 && point.world.x <= card.x + card.w + size / 2 && point.world.y >= card.y - size / 2 && point.world.y <= card.y + card.h + size / 2) erased.add(card.id);
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
  function finishPath(): void {
    if (points.length > 1) {
      const x = Math.min(...points.map(point => Math.min(point.x, point.ix ?? point.x, point.ox ?? point.x))), y = Math.min(...points.map(point => Math.min(point.y, point.iy ?? point.y, point.oy ?? point.y)));
      const w = Math.max(40, ...points.map(point => Math.max(point.x, point.ix ?? point.x, point.ox ?? point.x) - x)), h = Math.max(24, ...points.map(point => Math.max(point.y, point.iy ?? point.y, point.oy ?? point.y) - y));
      const prefs = settings(), newId = id();
      commit([{ op: 'create', newId, type: 'path', x, y, w, h, props: { points: points.map(point => ({ x: point.x - x, y: point.y - y, ...(point.ox === undefined ? {} : { ox: point.ox - x, oy: (point.oy ?? point.y) - y, ix: (point.ix ?? point.x) - x, iy: (point.iy ?? point.y) - y }) })), ow: w, oh: h, stroke: prefs.stroke, sw: prefs.sw, closed: false } }], [newId]);
    }
    clear(); exit();
  }
  return {
    id: name,
    accepts: point => point.button === 0,
    down: point => { start = point; if (kind === 'path') points.push({ ...point.world }); paint(point); },
    move: values => { for (const point of values) { if (kind === 'path' && start && point.buttons) { const last = points.at(-1); if (last) points[points.length - 1] = { ...last, ox: point.world.x, oy: point.world.y, ix: last.x * 2 - point.world.x, iy: last.y * 2 - point.world.y }; } paint(point); } },
    up: point => {
      if (!start) return;
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
        commit([CommandSchema.parse({ op: 'create', newId, type: 'shape', x, y, w, h, props: { shape: prefs.shape, points: shapePoints(prefs.shape, w, h), ow: w, oh: h, fill: prefs.fill, stroke: prefs.stroke, sw: prefs.sw, sdash: prefs.sdash, dl: prefs.dl, dg: prefs.dg } })], [newId]);
      }
      clear();
    },
    acceptsKey: key => key.key === 'Escape' || kind === 'path' && key.key === 'Enter',
    key: key => { if (kind === 'path' && (key.key === 'Enter' || points.length > 1)) finishPath(); else { clear(); exit(); } },
    cancel: clear,
  };
}
export function placementTool(engine: CanvasEngine, workspace: FeatureWorkspace, request: WirePlacement): SceneTool {
  const exit = toolExit(engine, `wire-${request.kind}`);
  let start: ToolPointer | null = null;
  const commandsAt = (point: ToolPointer): readonly Command[] => request.kind === 'screen' ? [screenCommand(request.device, point.world)] : request.kind === 'piece' ? pieceCommands(request.name, point.world, workspace.scene.snapshot().cards) : [wireCard({ type: request.kind, ...(request.kind === 'icon' ? { text: request.name, w: 48, h: 48 } : request.kind === 'text' ? { text: 'Text', w: 200, h: 40 } : {}) }, point.world.x, point.world.y)];
  return { id: `wire-${request.kind}`, accepts: point => point.button === 0, down: point => { start = point; }, move: points => {
    const point = points.at(-1); if (!point) return; engine.preview({ cursor: 'crosshair', primitives: [{ kind: 'rect', opacity: .6, space: 'world', bounds: { x: start ? Math.min(start.world.x, point.world.x) : point.world.x, y: start ? Math.min(start.world.y, point.world.y) : point.world.y, width: start ? Math.max(40, Math.abs(point.world.x - start.world.x)) : 160, height: start ? Math.max(24, Math.abs(point.world.y - start.world.y)) : 100 }, radius: 4, fill: null, stroke: stroke() }] });
  }, up: point => {
    const initial = start; if (!initial) return;
    const dragged = Math.hypot(point.screen.x - initial.screen.x, point.screen.y - initial.screen.y) > 4;
    const commands = commandsAt(dragged ? initial : point).map(command => command.op === 'create' && dragged && (request.kind === 'box' || request.kind === 'section') ? CommandSchema.parse({ ...command, x: Math.min(initial.world.x, point.world.x), y: Math.min(initial.world.y, point.world.y), w: Math.max(40, Math.abs(point.world.x - initial.world.x)), h: Math.max(24, Math.abs(point.world.y - initial.world.y)) }) : command);
    engine.commitTool({ commands, selection: commands.flatMap(command => command.op === 'create' && command.newId ? [command.newId] : []) }); engine.preview(null); start = null;
    exit();
  }, acceptsKey: key => key.key === 'Escape', key: () => { engine.preview(null); exit(); }, cancel: () => { start = null; engine.preview(null); } };
}
