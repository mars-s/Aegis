import type { Card, CardId, Command, LinkId } from '@aegis/domain/schema';
import { CanvasPainter } from './draw.js';
import type { DrawLink } from './draw.js';
import { clampZoom, fitBounds, fromBounds, hitRotated, intersects, project, rotatedBounds, toBounds, union, unproject } from './geometry.js';
import type { CameraState, Point, Rect } from './geometry.js';
import { SceneGraph } from './graph.js';
import type { SceneNode } from './graph.js';
import { LeasePool } from './leases.js';
import type { LeasePlacement } from './leases.js';
import { linkBounds, routeDistance, routeLink } from './links.js';
import { FrameMetrics } from './metrics.js';
import { ToolController } from './tools.js';
import { angleFrom, resizeRect, rotationDelta } from './gestures.js';
import { SceneOverlays } from './overlays.js';
import { LIVE_LIMIT, representationMode } from './representations.js';
import type { ZoomTier } from './representations.js';
import type { CanvasAttachment, CanvasEngine, FrameParticipant, FramePhase, Navigation, Representation, ToolCommit, ToolPointer } from './types.js';

interface Modifiers { readonly shift: boolean; readonly bypass: boolean }
type Input =
  | { readonly kind: 'wheel'; readonly point: Point; readonly dx: number; readonly dy: number; readonly zoom: boolean; readonly at: number }
  | { readonly kind: 'down'; readonly point: Point; readonly pointer: number; readonly pan: boolean; readonly action: 'move' | 'selection-move' | 'resize' | 'rotate'; readonly target?: CardId; readonly modifiers: Modifiers; readonly at: number }
  | { readonly kind: 'touch-down' | 'touch-move' | 'touch-up'; readonly point: Point; readonly pointer: number; readonly at: number }
  | { readonly kind: 'move' | 'up'; readonly point: Point; readonly pointer: number; readonly bypass: boolean; readonly at: number }
  | { readonly kind: 'cancel'; readonly at: number }
  | { readonly kind: 'navigation'; readonly intent: Navigation; readonly at: number };
type Gesture =
  | { readonly kind: 'pan'; readonly pointer: number; readonly start: Point; readonly from: CameraState }
  | { readonly kind: 'move'; readonly pointer: number; readonly start: Point; readonly bases: ReadonlyMap<CardId, Rect>; moved: boolean }
  | { readonly kind: 'resize'; readonly pointer: number; readonly start: Point; readonly id: CardId; readonly base: Rect; readonly rotation: number }
  | { readonly kind: 'rotate'; readonly pointer: number; readonly start: Point; readonly id: CardId; readonly centre: Point; readonly angle: number; readonly rotation: number }
  | { readonly kind: 'pinch'; readonly pointer: number; readonly start: Point; readonly distance: number; readonly anchor: Point; readonly zoom: number }
  | { readonly kind: 'marquee'; readonly pointer: number; readonly start: Point; readonly base: readonly CardId[] };
interface Glide { readonly from: CameraState; readonly to: CameraState; readonly start: number; readonly duration: number }
interface MeasurementRequest { readonly key: string; readonly generation: number; readonly card: Card; readonly epoch: number }
const windowTypes = new Set<Card['type']>(['object', 'dataset', 'doc', 'image', 'video', 'audio', 'spotify', 'link', 'web', 'frame', 'deck', 'canvas', 'font']);

/** Sole owner of scene frames. Events enqueue data; layout reads precede writes. */
export function createCanvas(args: CanvasAttachment): CanvasEngine {
  const { stage, world, backdrop, overlay, workspace } = args;
  const ownerWindow = stage.ownerDocument.defaultView;
  if (!ownerWindow) throw new Error('Scene stage must belong to a window');
  const view = ownerWindow;
  const board = workspace.scene.snapshot(), graph = new SceneGraph(board);
  const painter = new CanvasPainter(backdrop, overlay), metrics = new FrameMetrics();
  let camera: CameraState = { x: board.view.x, y: board.view.y, zoom: clampZoom(board.view.z) };
  const initialRect = stage.getBoundingClientRect();
  let viewport: Rect = { x: 0, y: 0, width: Math.max(1, initialRect.width), height: Math.max(1, initialRect.height) }, stageOrigin: Point = { x: initialRect.x, y: initialRect.y };
  let dpr = view.devicePixelRatio || 1, viewportDirty = false, disposed = false, pending = 0, frameCount = 0, epoch = 0, resetLeases = false;
  let tier: ZoomTier = 'detail', glide: Glide | null = null, gesture: Gesture | null = null, spaceHeld = false;
  let fitting: Extract<Navigation, { readonly kind: 'fit' }> | null = null, measuring = false;
  let previousFrame = 0, inputAt: number | null = null, discardedMeasurements = 0;
  let representations: Representation[] = [], candidates: SceneNode[] = [], drawnLinks: DrawLink[] = [];
  let placements: LeasePlacement[] = [];
  let selected = new Set(workspace.selection.getSnapshot()), marquee: Rect | null = null;
  let focusId: CardId | null = null;
  const inputs: Input[] = [], positions = new Map<CardId, Rect>(), rotations = new Map<CardId, number>(), touches = new Map<number, Point>(), measurements = new Map<string, MeasurementRequest>(), retired = new Set<CardId>();
  let touchQuarantine = false;
  const abort = new AbortController();
  const participants = new Set<FrameParticipant>();
  const tools = new ToolController(invalidate, hitTest);
  const measuredHeights: { readonly shell: HTMLElement; readonly height: number }[] = [];
  const motionPreference = view.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = (): boolean => (args.reducedMotion ?? motionPreference.matches) || stage.ownerDocument.body.classList.contains('motion-off');
  const canLease = args.canLease ?? ((card: Card): boolean => card.type === 'note' || card.type === 'title');
  const pool = new LeasePool(world, board.id, Math.max(1, args.warmLeases ?? LIVE_LIMIT), invalidate);
  const overlays = new SceneOverlays(stage, world, invalidate, (id, keyboard) => enqueue({ kind: 'navigation', intent: { kind: 'fit', ids: [id], motion: keyboard ? 'instant' : 'glide' }, at: performance.now() }));

  function invalidate(): void {
    if (!disposed && !pending) pending = view.requestAnimationFrame(frame);
  }

  function enqueue(input: Input): void {
    if (disposed) return;
    const last = inputs.at(-1);
    if (input.kind === 'move' && last?.kind === 'move' && input.pointer === last.pointer) inputs[inputs.length - 1] = input;
    else inputs.push(input);
    inputAt ??= input.at;
    invalidate();
  }

  function post(operation: () => void): void {
    const currentEpoch = epoch;
    setTimeout(() => { if (!disposed && currentEpoch === epoch) operation(); }, 0);
  }

  function commitTool(commit: ToolCommit): void {
    const callback = args.onToolCommit;
    if (!callback) throw new Error('Scene tools require onToolCommit.');
    const boardId = workspace.scene.snapshot().id;
    post(() => callback(boardId, commit));
  }

  function select(ids: readonly CardId[]): void {
    selected = new Set(ids);
    post(() => workspace.act({ kind: 'select', ids }));
  }

  function boundsFor(node: SceneNode): Rect { return positions.get(node.card.id) ?? node.layout.bounds; }
  function rotationFor(node: SceneNode): number { return rotations.get(node.card.id) ?? node.rotation; }
  function availableArea(): Rect { return args.availableArea?.getSnapshot() ?? viewport; }

  function cancelGesture(): void {
    if (gesture?.kind === 'move') for (const id of gesture.bases.keys()) pool.pin(id, 'capture', false);
    else if (gesture?.kind === 'resize' || gesture?.kind === 'rotate') pool.pin(gesture.id, 'capture', false);
    positions.clear(); rotations.clear(); gesture = null; marquee = null;
  }

  function hitTest(point: Point): CardId | null {
    for (let i = representations.length - 1; i >= 0; i--) {
      const rep = representations[i];
      if (rep && hitRotated(point, rep.bounds, rep.rotation)) return rep.id;
    }
    return null;
  }

  function startConnection(id: CardId): void {
    if (!graph.nodes.has(id)) return;
    const update = (point: ToolPointer): void => {
      const from = graph.nodes.get(id), target = hitTest(point.screen), to = target ? graph.nodes.get(target) : null;
      if (!from) return;
      const bounds = to && to !== from ? boundsFor(to) : { x: point.world.x, y: point.world.y, width: 0, height: 0 };
      const route = routeLink({}, boundsFor(from), bounds, rotationFor(from), to ? rotationFor(to) : 0);
      const stroke = { colour: { kind: 'theme' as const, token: 'focus' as const }, width: 1.5, dash: [] };
      tools.preview({ cursor: 'crosshair', primitives: [{ kind: 'path', opacity: 1, space: 'world', d: `M${route.p0.x} ${route.p0.y} Q${route.control.x} ${route.control.y} ${route.p2.x} ${route.p2.y}`, fill: null, stroke }, ...(to && to !== from ? [{ kind: 'rect' as const, opacity: 1, space: 'world' as const, bounds, radius: 4, fill: null, stroke }] : [])] });
    };
    tools.set({
      accepts: point => point.button === 0,
      down: update, move: points => { const point = points.at(-1); if (point) update(point); },
      up: point => {
        const target = hitTest(point.screen);
        const duplicate = [...graph.links.values()].some(entry => entry.link.a === id && entry.link.b === target || entry.link.a === target && entry.link.b === id);
        post(() => { if (target && target !== id && !duplicate) workspace.submit([{ op: 'connect', a: id, b: target }]); tools.set(null); });
      },
      acceptsKey: key => key.key === 'Enter', key: () => { tools.set(null); }, cancel: () => { tools.preview(null); },
    });
  }

  function navigation(intent: Navigation, now: number): void {
    fitting = intent.kind === 'fit' ? intent : null;
    let target: CameraState;
    switch (intent.kind) {
      case 'restore': target = { x: intent.camera.x, y: intent.camera.y, zoom: clampZoom(intent.camera.zoom) }; break;
      case 'fit': {
        const ids = new Set(intent.ids);
        const items = graph.all().filter(node => !ids.size || ids.has(node.card.id)).map(node => fromBounds(rotatedBounds(boundsFor(node), rotationFor(node))));
        const available = availableArea(), area = { x: available.x + 48, y: available.y + 48, width: Math.max(1, available.width - 96), height: Math.max(1, available.height - 96) };
        target = fitBounds(union(items), area, intent.maximumZoom ?? 1);
        if (!ids.size) for (let iteration = 0; iteration < 24; iteration++) {
          const fixed = [...participants].flatMap(participant => participant.fitBounds?.(target.zoom) ?? []);
          const next = fitBounds(union([...items, ...fixed]), area, target.zoom);
          const settled = Math.abs(next.zoom - target.zoom) < 1e-10;
          target = next;
          if (settled) break;
        }
        break;
      }
      default: { const exhaustive: never = intent; return exhaustive; }
    }
    if (intent.motion === 'instant' || reducedMotion() || intent.duration === 0) { camera = target; glide = null; }
    else glide = { from: camera, to: target, start: now, duration: Math.max(1, intent.duration ?? 420) };
    if (args.onNavigation) post(args.onNavigation);
  }

  function moveGesture(point: Point, bypass: boolean): void {
    if (!gesture) return;
    const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
    switch (gesture.kind) {
      case 'pan': camera = { x: gesture.from.x + dx, y: gesture.from.y + dy, zoom: gesture.from.zoom }; break;
      case 'move': {
        if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
        gesture.moved = true;
        let worldDx = dx / camera.zoom, worldDy = dy / camera.zoom;
        const anchor = gesture.bases.values().next().value;
        if (!bypass && args.snapGrid && anchor) {
          const step = Math.max(1, args.snapGrid);
          worldDx = Math.round((anchor.x + worldDx) / step) * step - anchor.x;
          worldDy = Math.round((anchor.y + worldDy) / step) * step - anchor.y;
        }
        for (const [id, base] of gesture.bases) {
          positions.set(id, { ...base, x: Math.round(base.x + worldDx), y: Math.round(base.y + worldDy) });
        }
        break;
      }
      case 'resize': {
        if (Math.hypot(dx, dy) < 3) break;
        const node = graph.nodes.get(gesture.id), window = node && windowTypes.has(node.card.type);
        positions.set(gesture.id, resizeRect(gesture.base, { x: dx / camera.zoom, y: dy / camera.zoom }, gesture.rotation, window ? { width: 200, height: 120 } : { width: 80, height: 40 }));
        break;
      }
      case 'rotate': {
        const delta = rotationDelta(gesture.angle, angleFrom(point, gesture.centre));
        const rotation = gesture.rotation + delta;
        rotations.set(gesture.id, bypass ? rotation : Math.round(rotation / 15) * 15);
        break;
      }
      case 'pinch': break;
      case 'marquee': {
        marquee = { x: Math.min(point.x, gesture.start.x), y: Math.min(point.y, gesture.start.y), width: Math.abs(dx), height: Math.abs(dy) };
        if (marquee.width + marquee.height < 4) break;
        const hits = representations.filter(rep => intersects(marquee ?? viewport, rep.bounds) && !graph.nodes.get(rep.id)?.locked).map(rep => rep.id);
        select([...new Set([...gesture.base, ...hits])]);
        break;
      }
      default: { const exhaustive: never = gesture; return exhaustive; }
    }
  }

  function drainInput(now: number): void {
    for (const input of inputs) {
      switch (input.kind) {
        case 'navigation': navigation(input.intent, now); break;
        case 'wheel': {
          fitting = null;
          glide = null;
          if (input.zoom) {
            const anchor = unproject(input.point, camera), zoom = clampZoom(camera.zoom * Math.exp(-input.dy * 0.01));
            camera = { x: input.point.x - anchor.x * zoom, y: input.point.y - anchor.y * zoom, zoom };
          } else camera = { x: camera.x - input.dx, y: camera.y - input.dy, zoom: camera.zoom };
          break;
        }
        case 'touch-down': {
          fitting = null;
          glide = null;
          touches.set(input.pointer, input.point);
          if (touchQuarantine) break;
          if (touches.size === 1) { cancelGesture(); gesture = { kind: 'pan', pointer: input.pointer, start: input.point, from: camera }; }
          else if (touches.size === 2) {
            cancelGesture();
            const [a, b] = touches.values();
            if (a && b) {
              const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              gesture = { kind: 'pinch', pointer: input.pointer, start: centre, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), anchor: unproject(centre, camera), zoom: camera.zoom };
            }
          }
          break;
        }
        case 'touch-move': {
          if (!touches.has(input.pointer)) break;
          touches.set(input.pointer, input.point);
          if (touchQuarantine) break;
          if (gesture?.kind === 'pinch') {
            const [a, b] = touches.values();
            if (!a || !b) break;
            const zoom = clampZoom(gesture.zoom * Math.hypot(b.x - a.x, b.y - a.y) / gesture.distance);
            camera = { x: (a.x + b.x) / 2 - gesture.anchor.x * zoom, y: (a.y + b.y) / 2 - gesture.anchor.y * zoom, zoom };
          } else if (gesture?.kind === 'pan' && gesture.pointer === input.pointer) moveGesture(input.point, false);
          break;
        }
        case 'touch-up': {
          touches.delete(input.pointer);
          cancelGesture();
          touchQuarantine = touches.size > 0;
          break;
        }
        case 'down': {
          fitting = null;
          glide = null;
          if (gesture) break;
          if (input.pan) { gesture = { kind: 'pan', pointer: input.pointer, start: input.point, from: camera }; break; }
          const id = input.target ?? hitTest(input.point) ?? (input.action === 'move' ? null : [...selected].at(-1) ?? null), node = id ? graph.nodes.get(id) : undefined;
          if (id && node) {
            if (node.locked) break;
            if (input.action === 'resize' || input.action === 'rotate') {
              const base = node.layout.bounds;
              const centre = { x: (base.x + base.width / 2) * camera.zoom + camera.x, y: (base.y + base.height / 2) * camera.zoom + camera.y };
              select([id]); pool.pin(id, 'capture', true);
              gesture = input.action === 'resize'
                ? { kind: 'resize', pointer: input.pointer, start: input.point, id, base, rotation: node.rotation }
                : { kind: 'rotate', pointer: input.pointer, start: input.point, id, centre, angle: angleFrom(input.point, centre), rotation: node.rotation };
              break;
            }
            if (input.modifiers.bypass) select([id]);
            else if (input.modifiers.shift) select(selected.has(id) ? [...selected].filter(candidate => candidate !== id) : [...selected, id]);
            else if (!selected.has(id)) select([id]);
            const bases = new Map<CardId, Rect>();
            for (const candidate of selected) { const current = graph.nodes.get(candidate); if (current && !current.locked) bases.set(candidate, current.layout.bounds); }
            const descendants = [...bases.keys()];
            for (let index = 0; index < descendants.length; index++) {
              const parent = descendants[index];
              if (!parent) continue;
              for (const child of graph.children.get(parent) ?? []) {
                const current = graph.nodes.get(child);
                if (current && !current.locked && !bases.has(child)) { bases.set(child, current.layout.bounds); descendants.push(child); }
              }
            }
            gesture = { kind: 'move', pointer: input.pointer, start: input.point, bases, moved: false };
            for (const id of bases.keys()) pool.pin(id, 'capture', true);
          } else {
            const base = input.modifiers.shift ? [...selected] : [];
            select(base); gesture = { kind: 'marquee', pointer: input.pointer, start: input.point, base };
          }
          break;
        }
        case 'move': if (gesture?.pointer === input.pointer) moveGesture(input.point, input.bypass); break;
        case 'up': {
          if (gesture?.pointer !== input.pointer) break;
          moveGesture(input.point, input.bypass);
          if (gesture.kind === 'move') {
            const commands: Command[] = [];
            if (gesture.moved) for (const [id, r] of positions) commands.push({ op: 'move', id, x: r.x, y: r.y });
            for (const id of gesture.bases.keys()) pool.pin(id, 'capture', false);
            if (commands.length) post(() => { workspace.submit(commands); positions.clear(); invalidate(); });
            else positions.clear();
          } else if (gesture.kind === 'resize' || gesture.kind === 'rotate') {
            const id = gesture.id, bounds = positions.get(id), rotation = rotations.get(id);
            const commands: Command[] = [];
            if (gesture.kind === 'resize' && bounds) {
              if (bounds.x !== gesture.base.x || bounds.y !== gesture.base.y) commands.push({ op: 'move', id, x: bounds.x, y: bounds.y });
              if (bounds.width !== gesture.base.width || bounds.height !== gesture.base.height) commands.push({ op: 'update', id, set: { w: bounds.width, h: bounds.height, props: { fixedHeight: true } } });
            } else if (gesture.kind === 'rotate' && rotation !== undefined && rotation !== gesture.rotation) commands.push({ op: 'update', id, set: { rot: rotation } });
            pool.pin(id, 'capture', false);
            if (commands.length) post(() => { workspace.submit(commands); positions.delete(id); rotations.delete(id); invalidate(); });
            else { positions.delete(id); rotations.delete(id); }
          }
          gesture = null; marquee = null; break;
        }
        case 'cancel':
          cancelGesture(); touches.clear(); touchQuarantine = false; glide = null; break;
        default: { const exhaustive: never = input; return exhaustive; }
      }
    }
    inputs.length = 0;
  }

  function cull(): void {
    const margin = 32;
    const query = { x: (-camera.x - margin) / camera.zoom, y: (-camera.y - margin) / camera.zoom, width: (viewport.width + margin * 2) / camera.zoom, height: (viewport.height + margin * 2) / camera.zoom };
    candidates = graph.query(toBounds(query));
    if (positions.size) {
      candidates = candidates.filter(node => !positions.has(node.card.id));
      for (const [id, bounds] of positions) { const node = graph.nodes.get(id); if (node && !node.hidden && intersects(bounds, query)) candidates.push(node); }
      candidates.sort((a, b) => a.rank - b.rank);
    }
    const visible = candidates.filter(node => intersects(fromBounds(rotatedBounds(project(boundsFor(node), camera), rotationFor(node))), viewport));
    tier = representationMode(camera.zoom, visible.length);
    representations = []; placements = [];
    for (const node of visible) {
      const kind = pool.isPinned(node.card.id) ? 'detail' : tier;
      const bounds = boundsFor(node);
      representations.push({ id: node.card.id, kind, bounds: project(bounds, camera), rotation: rotationFor(node), text: node.text });
      if (kind === 'detail' && canLease(node.card)) placements.push({ node, ...bounds, rotation: rotationFor(node), selected: selected.has(node.card.id) });
    }
    // Selected bodies have first admission when a dense view exceeds warm capacity.
    placements.sort((a, b) => Number(b.selected) - Number(a.selected) || a.node.rank - b.node.rank);
    const links = new Map(graph.queryLinks(toBounds(query)).map(entry => [entry.link.id, entry]));
    for (const id of positions.keys()) for (const linkId of graph.incident.get(id) ?? []) { const entry = graph.links.get(linkId); if (entry) links.set(linkId, entry); }
    drawnLinks = [];
    const changedLinks = new Set<LinkId>();
    for (const id of new Set([...positions.keys(), ...rotations.keys()])) {
      const node = graph.nodes.get(id); if (!node) continue;
      for (const linkId of graph.incident.get(id) ?? []) changedLinks.add(linkId);
      for (const entry of graph.queryLinks(node.bounds)) changedLinks.add(entry.link.id);
      for (const entry of graph.queryLinks(rotatedBounds(boundsFor(node), rotationFor(node)))) changedLinks.add(entry.link.id);
    }
    for (const { link, route } of links.values()) {
      const a = graph.nodes.get(link.a), b = graph.nodes.get(link.b);
      if (!a || !b || a.hidden || b.hidden) continue;
      let current = route;
      if (changedLinks.has(link.id)) {
        const initial = routeLink(link, boundsFor(a), boundsFor(b), rotationFor(a), rotationFor(b));
        const query = linkBounds(initial, '');
        const obstacles = new Map(graph.query(query).filter(node => node !== a && node !== b).map(node => [node.card.id, fromBounds(rotatedBounds(boundsFor(node), rotationFor(node)))]));
        for (const [id, bounds] of positions) {
          const node = graph.nodes.get(id);
          if (node && node !== a && node !== b && !node.hidden) obstacles.set(id, fromBounds(rotatedBounds(bounds, rotationFor(node))));
        }
        current = routeLink(link, boundsFor(a), boundsFor(b), rotationFor(a), rotationFor(b), 1, [...obstacles.values()]);
      }
      const p = (point: Point): Point => ({ x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y });
      drawnLinks.push({ link, route: { p0: p(current.p0), p2: p(current.p2), control: p(current.control), label: p(current.label), points: current.points.map(p) } });
    }
  }

  function readMeasurements(): void {
    const commits: { readonly request: MeasurementRequest; readonly id: CardId; readonly height: number }[] = [];
    for (const request of measurements.values()) {
      const lease = pool.find(request.key, request.generation), current = lease ? graph.nodes.get(lease.cardId)?.card : null;
      if (!lease || request.epoch !== epoch || current !== request.card) { discardedMeasurements++; continue; }
      if (current.props?.fixedHeight || current.type !== 'object' && !current.props?.contentFit) continue;
      const shell = lease.host.parentElement;
      const style = shell ? view.getComputedStyle(shell) : null;
      const borders = (Number.parseFloat(style?.borderTopWidth ?? '0') || 0) + (Number.parseFloat(style?.borderBottomWidth ?? '0') || 0);
      const height = Math.max(24, Math.min(4000, Math.ceil(lease.host.scrollHeight + borders)));
      if (shell) measuredHeights.push({ shell, height });
      if (Math.abs(height - current.h) > 1) commits.push({ request, id: current.id, height });
    }
    measurements.clear();
    if (commits.length) post(() => {
      const commands: Command[] = [];
      for (const { request, id, height } of commits) if (pool.find(request.key, request.generation) && graph.nodes.get(id)?.card === request.card) commands.push({ op: 'measure', id, h: height, baseHeight: request.card.h });
      if (commands.length) {
        measuring = true;
        try { workspace.submit(commands); } finally { measuring = false; }
        // Newly mounted content can change saved heights and compact-grid positions.
        if (fitting) { navigation({ ...fitting, motion: 'instant' }, performance.now()); invalidate(); }
      }
    });
  }

  function frame(timestamp: number): void {
    pending = 0;
    if (disposed) return;
    const start = performance.now();
    const phases: Record<FramePhase, number> = { input: 0, camera: 0, cull: 0, reads: 0, writes: 0 };
    let mark = start;
    tools.flush(); drainInput(timestamp); phases.input = performance.now() - mark; mark = performance.now();
    if (glide && reducedMotion()) { camera = glide.to; glide = null; }
    if (glide) {
      const t = Math.min(1, Math.max(0, (timestamp - glide.start) / glide.duration)), k = 1 - (1 - t) ** 3;
      camera = { x: glide.from.x + (glide.to.x - glide.from.x) * k, y: glide.from.y + (glide.to.y - glide.from.y) * k, zoom: glide.from.zoom + (glide.to.zoom - glide.from.zoom) * k };
      if (t === 1) { camera = glide.to; glide = null; }
    }
    phases.camera = performance.now() - mark; mark = performance.now();
    cull(); phases.cull = performance.now() - mark; mark = performance.now();
    if (viewportDirty || dpr !== view.devicePixelRatio) {
      const rect = stage.getBoundingClientRect();
      viewport = { x: 0, y: 0, width: Math.max(1, rect.width), height: Math.max(1, rect.height) }; stageOrigin = { x: rect.x, y: rect.y };
      dpr = view.devicePixelRatio || 1; viewportDirty = false;
      invalidate();
    }
    readMeasurements();
    overlays.read(viewport, stageOrigin, camera, representations, graph.nodes, selected);
    for (const participant of participants) participant.read?.();
    phases.reads = performance.now() - mark; mark = performance.now();
    if (resetLeases) { pool.reset(workspace.scene.snapshot().id); resetLeases = false; }
    for (const id of retired) pool.retire(id);
    retired.clear();
    world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
    stage.classList.toggle('far', tier === 'far'); stage.classList.toggle('panning', gesture?.kind === 'pan' || gesture?.kind === 'pinch'); stage.classList.toggle('pan-ready', spaceHeld);
    for (const { shell, height } of measuredHeights) if (shell.dataset.intrinsicHeight !== String(height)) shell.dataset.intrinsicHeight = String(height);
    measuredHeights.length = 0;
    pool.reconcile(placements, timestamp);
    painter.paint(viewport, dpr, camera, representations, drawnLinks, id => pool.has(id), selected, marquee, tools.getPreview());
    stage.style.cursor = gesture?.kind === 'pan' ? 'grabbing' : spaceHeld ? 'grab' : tools.getPreview()?.cursor ?? '';
    overlays.write();
    for (const participant of participants) participant.write?.();
    phases.writes = performance.now() - mark;
    const end = performance.now();
    metrics.push(start, previousFrame ? timestamp - previousFrame : 0, end - start, phases, inputAt === null ? null : end - inputAt, candidates.length, drawnLinks.length, pool.stats().active);
    previousFrame = timestamp; inputAt = null; frameCount++;
    if (glide) invalidate();
  }

  function point(event: MouseEvent): Point { return { x: event.clientX - stageOrigin.x, y: event.clientY - stageOrigin.y }; }
  function toolPoint(event: PointerEvent): ToolPointer {
    const screen = point(event);
    return { pointerId: event.pointerId, pointerType: event.pointerType === 'pen' ? 'pen' : event.pointerType === 'touch' ? 'touch' : 'mouse', screen, world: unproject(screen, camera), pressure: event.pressure, time: event.timeStamp, button: event.button, buttons: event.buttons, shift: event.shiftKey, alt: event.altKey, bypass: event.metaKey || event.ctrlKey };
  }
  function editable(target: EventTarget | null): boolean { return target instanceof Element && !!target.closest('input,textarea,select,button,a,video,audio,[contenteditable]:not([contenteditable="false"]),[data-scene-interactive]'); }
  function ownsSpace(target: EventTarget | null): boolean { return target instanceof Element && !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),.side-editor,#agentIsland,#composer'); }
  function releaseSpace(): void { spaceHeld = false; stage.classList.remove('pan-ready'); }
  function pointerInFlight(): boolean {
    let pointer = gesture?.pointer ?? null;
    for (const input of inputs) {
      if (input.kind === 'down') pointer = input.pointer;
      else if (input.kind === 'cancel' || input.kind === 'up' && input.pointer === pointer) pointer = null;
    }
    return pointer !== null;
  }
  const touchPointers = new Set<number>();

  stage.addEventListener('wheel', event => {
    if (editable(event.target) && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
    enqueue({ kind: 'wheel', point: point(event), dx: event.deltaX * scale, dy: event.deltaY * scale, zoom: event.ctrlKey || event.metaKey, at: performance.now() });
  }, { passive: false, signal: abort.signal });
  view.addEventListener('pointerdown', event => {
    const pan = event.button === 1 || event.button === 0 && spaceHeld;
    const inside = event.target instanceof Node && stage.contains(event.target);
    const affordance = event.target instanceof Element && event.target.closest('.agent-window,.editing-outline');
    if (!inside && !(pan && affordance)) return;
    if (!pan && !editable(event.target) && tools.down(toolPoint(event))) { event.preventDefault(); event.stopImmediatePropagation(); stage.focus({ preventScroll: true }); stage.setPointerCapture(event.pointerId); return; }
    if (pan) tools.cancel('pan');
    if (event.pointerType === 'touch' && (touchPointers.size || tools.name())) tools.cancel('pan');
    if (event.pointerType === 'touch') {
      if (editable(event.target) && !touchPointers.size) return;
      event.preventDefault(); event.stopImmediatePropagation(); stage.setPointerCapture(event.pointerId);
      touchPointers.add(event.pointerId);
      enqueue({ kind: 'touch-down', point: point(event), pointer: event.pointerId, at: performance.now() });
      return;
    }
    const handle = event.target instanceof Element ? event.target.closest('.resize,.selection-resize,.rotation-handle,.selection-move,[data-scene-gesture]') : null;
    const action = handle?.matches('.resize,.selection-resize,[data-scene-gesture="resize"]') ? 'resize' : handle?.matches('.rotation-handle,[data-scene-gesture="rotate"]') ? 'rotate' : handle?.matches('.selection-move,[data-scene-gesture="move"]') ? 'selection-move' : 'move';
    const sceneControl = event.target instanceof Element && !!event.target.closest('.canvas-orientation,.window-actions');
    if ((!pan && (event.button !== 0 || sceneControl || !handle && editable(event.target))) || pointerInFlight()) return;
    event.preventDefault(); stage.focus({ preventScroll: true }); stage.setPointerCapture(event.pointerId);
    if (pan) { stage.classList.add('panning'); event.stopImmediatePropagation(); }
    else if (handle) event.stopImmediatePropagation();
    enqueue({ kind: 'down', point: point(event), pointer: event.pointerId, pan, action, modifiers: { shift: event.shiftKey, bypass: event.metaKey || event.ctrlKey }, at: performance.now() });
  }, { capture: true, signal: abort.signal });
  stage.addEventListener('pointermove', event => {
    if (touchPointers.has(event.pointerId)) enqueue({ kind: 'touch-move', point: point(event), pointer: event.pointerId, at: performance.now() });
    else if (!gesture && !spaceHeld && tools.move((event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event]).map(toolPoint))) return;
    else if (stage.hasPointerCapture(event.pointerId)) enqueue({ kind: 'move', point: point(event), pointer: event.pointerId, bypass: event.metaKey || event.ctrlKey, at: performance.now() });
  }, { signal: abort.signal });
  stage.addEventListener('pointerup', event => {
    if (tools.up(toolPoint(event))) return;
    if (touchPointers.delete(event.pointerId)) enqueue({ kind: 'touch-up', point: point(event), pointer: event.pointerId, at: performance.now() });
    else enqueue({ kind: 'up', point: point(event), pointer: event.pointerId, bypass: event.metaKey || event.ctrlKey, at: performance.now() });
    stage.classList.remove('panning');
  }, { signal: abort.signal });
  stage.addEventListener('pointercancel', event => {
    if (tools.owns(event.pointerId)) { tools.cancel('pointer-cancel'); return; }
    stage.classList.remove('panning');
    if (touchPointers.delete(event.pointerId)) enqueue({ kind: 'touch-up', point: point(event), pointer: event.pointerId, at: performance.now() });
    else enqueue({ kind: 'cancel', at: performance.now() });
  }, { signal: abort.signal });
  stage.addEventListener('lostpointercapture', event => {
    if (tools.owns(event.pointerId)) { tools.cancel('lost-capture'); return; }
    if (touchPointers.delete(event.pointerId)) { enqueue({ kind: 'touch-up', point: point(event), pointer: event.pointerId, at: performance.now() }); return; }
    if (inputs.some(input => input.kind === 'touch-up' && input.pointer === event.pointerId)) return;
    if (!inputs.some(input => input.kind === 'up' && input.pointer === event.pointerId) && (gesture?.pointer === event.pointerId || inputs.some(input => input.kind === 'down' && input.pointer === event.pointerId))) enqueue({ kind: 'cancel', at: performance.now() });
  }, { signal: abort.signal });
  view.addEventListener('blur', () => { tools.cancel('pointer-cancel'); releaseSpace(); touchPointers.clear(); stage.classList.remove('panning'); enqueue({ kind: 'cancel', at: performance.now() }); }, { signal: abort.signal });
  view.addEventListener('keydown', event => {
    if (event.code === 'Space') {
      if (ownsSpace(event.target) || ownsSpace(stage.ownerDocument.activeElement)) return;
      tools.cancel('pan'); spaceHeld = true; stage.classList.add('pan-ready');
      if (event.target === stage.ownerDocument.body || event.target instanceof Node && stage.contains(event.target)) event.preventDefault();
      invalidate(); return;
    }
    if (editable(event.target)) return;
    if (tools.key({ key: event.key, shift: event.shiftKey, alt: event.altKey, bypass: event.metaKey || event.ctrlKey })) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.key === 'Escape') tools.cancel('escape');
    if (event.key === '0' && !event.metaKey && !event.ctrlKey) enqueue({ kind: 'navigation', intent: { kind: 'fit', ids: [], motion: 'glide' }, at: performance.now() });
    if (event.key === 'Escape') { select([]); enqueue({ kind: 'cancel', at: performance.now() }); }
    if (event.key === 'a' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); select(graph.all().filter(node => !node.locked).map(node => node.card.id)); invalidate(); }
  }, { capture: true, signal: abort.signal });
  view.addEventListener('keyup', event => { if (event.code === 'Space') { releaseSpace(); invalidate(); } }, { capture: true, signal: abort.signal });
  view.addEventListener('focusin', event => { if (ownsSpace(event.target)) { releaseSpace(); invalidate(); } }, { capture: true, signal: abort.signal });
  stage.addEventListener('focusin', event => {
    if (!(event.target instanceof Node)) return;
    if (focusId) pool.pin(focusId, 'focus', false);
    focusId = pool.cardAt(event.target); if (focusId) pool.pin(focusId, 'focus', true);
    if (ownsSpace(event.target)) releaseSpace();
    invalidate();
  }, { signal: abort.signal });
  stage.addEventListener('focusout', () => post(() => {
    if (focusId) pool.pin(focusId, 'focus', false);
    const active = stage.ownerDocument.activeElement; focusId = active ? pool.cardAt(active) : null;
    if (focusId) pool.pin(focusId, 'focus', true);
    invalidate();
  }), { signal: abort.signal });
  for (const type of ['compositionstart', 'compositionend'] as const) stage.addEventListener(type, event => {
    if (event.target instanceof Node) { const id = pool.cardAt(event.target); if (id) pool.pin(id, 'ime', type === 'compositionstart'); invalidate(); }
  }, { signal: abort.signal });
  const observer = new ResizeObserver(() => { viewportDirty = true; invalidate(); }); observer.observe(stage);
  view.addEventListener('resize', () => { viewportDirty = true; invalidate(); }, { signal: abort.signal });
  view.addEventListener('scroll', () => { viewportDirty = true; invalidate(); }, { capture: true, signal: abort.signal });
  const unsubscribeScene = workspace.scene.subscribe(change => {
    if (disposed) return;
    if (change.kind === 'replace' || change.boardId !== workspace.scene.snapshot().id) {
      fitting = null;
      const next = workspace.scene.snapshot(); epoch++; tools.reset('board-change'); graph.replace(next); measurements.clear(); positions.clear(); inputs.length = 0;
      cancelGesture(); touchPointers.clear(); touches.clear(); touchQuarantine = false;
      camera = { x: next.view.x, y: next.view.y, zoom: clampZoom(next.view.z) }; gesture = null; glide = null; resetLeases = true;
    } else { if (!measuring && change.origin !== 'sync') fitting = null; if (change.origin !== 'local' && (change.upserted.length || change.removed.length)) { tools.cancel('scene-change'); cancelGesture(); } graph.apply(change); for (const id of change.removed) retired.add(id); }
    invalidate();
  });
  const unsubscribeSelection = workspace.selection.subscribe(() => { selected = new Set(workspace.selection.getSnapshot()); invalidate(); });
  if (args.theme) painter.themeChanged(args.theme.getSnapshot());
  const unsubscribeTheme = args.theme?.subscribe(() => { if (args.theme) painter.themeChanged(args.theme.getSnapshot()); invalidate(); });
  const unsubscribeArea = args.availableArea?.subscribe(invalidate);
  invalidate();

  return {
    leases: pool.source,
    navigate: intent => {
      if (disposed) return;
      if (intent.motion === 'instant' || reducedMotion() || intent.duration === 0) {
        for (let index = inputs.length - 1; index >= 0; index--) if (inputs[index]?.kind === 'wheel' || inputs[index]?.kind === 'navigation') inputs.splice(index, 1);
        navigation(intent, performance.now()); invalidate();
      } else enqueue({ kind: 'navigation', intent, at: performance.now() });
    },
    camera: () => ({ ...camera }),
    screenToWorld: p => unproject(p, camera),
    representations: () => representations,
    hitTest,
    hitTestLink: point => { for (let index = drawnLinks.length - 1; index >= 0; index--) { const entry = drawnLinks[index]; if (entry && routeDistance(point, entry.route) <= 8) return entry.link.id; } return null; },
    linkGeometry: () => drawnLinks.map(entry => ({ id: entry.link.id, route: entry.route })),
    tool: tool => { if (tool && !args.onToolCommit) throw new Error('Scene tools require onToolCommit.'); tools.set(tool); },
    commitTool,
    linkRoute: id => { const entry = graph.links.get(id); if (!entry) return null; const from = graph.nodes.get(entry.link.a), to = graph.nodes.get(entry.link.b); if (!from || !to) return null; const route = routeLink(entry.link, boundsFor(from), boundsFor(to), rotationFor(from), rotationFor(to)); return { d: route.points.length ? 'M' + route.points.map(point => `${point.x} ${point.y}`).join(' L') : `M${route.p0.x} ${route.p0.y} Q${route.control.x} ${route.control.y} ${route.p2.x} ${route.p2.y}`, start: route.p0, control: route.control, end: route.p2, label: route.label }; },
    toolName: () => tools.name(),
    busy: () => glide !== null || gesture !== null || inputs.length > 0,
    preview: preview => tools.preview(preview),
    afterInput: post,
    startTransform: intent => {
      const id = intent.ids.at(-1); if (!id || disposed) return;
      select(intent.ids); stage.setPointerCapture(intent.pointer.id);
      enqueue({ kind: 'down', pointer: intent.pointer.id, point: intent.pointer.point, pan: false, action: intent.kind, target: id, modifiers: { shift: intent.shift, bypass: false }, at: performance.now() });
    },
    startConnection,
    pin: (id, reason, pinned) => { pool.pin(id, reason, pinned); invalidate(); },
    requestMeasurement: (key, generation) => {
      const lease = pool.find(key, generation), card = lease ? graph.nodes.get(lease.cardId)?.card : null;
      if (lease && card) measurements.set(key, { key, generation, card, epoch });
      else discardedMeasurements++;
      invalidate();
    },
    registerFrameParticipant: participant => { participants.add(participant); invalidate(); return () => { participants.delete(participant); }; },
    viewport: () => viewport,
    availableArea,
    invalidate,
    inspect: () => { const stats = pool.stats(); return { pendingFrames: pending ? 1 : 0, frameCount, visibleCards: representations.length, visibleLinks: drawnLinks.length, activeLeases: stats.active, pinnedLeases: stats.pinned, releasingLeases: stats.releasing, queuedMounts: stats.queued, discardedMeasurements, tier, camera: { ...camera } }; },
    recordMetrics: enabled => { metrics.record(enabled); previousFrame = 0; },
    samples: () => metrics.samples(),
    dispose: () => {
      if (disposed) return;
      disposed = true; epoch++; if (pending) view.cancelAnimationFrame(pending); pending = 0;
      tools.dispose(); stage.style.cursor = ''; abort.abort(); observer.disconnect(); unsubscribeScene(); unsubscribeSelection(); unsubscribeArea?.(); unsubscribeTheme?.(); participants.clear(); pool.dispose(); overlays.dispose();
      releaseSpace(); stage.classList.remove('panning', 'far');
      metrics.record(false);
      graph.clear(); measurements.clear(); inputs.length = 0; positions.clear(); representations = []; placements = []; drawnLinks = []; candidates = [];
    },
  };
}
