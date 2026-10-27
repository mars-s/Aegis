import type { Card, CardId, Command } from '@aegis/domain/schema';
import { CanvasPainter } from './draw.js';
import type { DrawLink } from './draw.js';
import { clampZoom, contains, fromBounds, hitRotated, intersects, project, rotatedBounds, toBounds, unproject } from './geometry.js';
import type { CameraState, Point, Rect } from './geometry.js';
import { SceneGraph } from './graph.js';
import type { SceneNode } from './graph.js';
import { LeasePool } from './leases.js';
import type { LeasePlacement } from './leases.js';
import { routeLink } from './links.js';
import { FrameMetrics } from './metrics.js';
import { fitSpatial, RepresentationLayout, zoomTier } from './representations.js';
import type { DisplayRect, LayoutItem, ZoomTier } from './representations.js';
import type { CanvasAttachment, CanvasEngine, FramePhase, Navigation, Representation } from './types.js';

interface Modifiers { readonly shift: boolean; readonly bypass: boolean }
type Input =
  | { readonly kind: 'wheel'; readonly point: Point; readonly dx: number; readonly dy: number; readonly zoom: boolean; readonly at: number }
  | { readonly kind: 'down'; readonly point: Point; readonly pointer: number; readonly pan: boolean; readonly modifiers: Modifiers; readonly at: number }
  | { readonly kind: 'move' | 'up'; readonly point: Point; readonly pointer: number; readonly bypass: boolean; readonly at: number }
  | { readonly kind: 'cancel'; readonly at: number }
  | { readonly kind: 'navigation'; readonly intent: Navigation; readonly at: number };
type Gesture =
  | { readonly kind: 'pan'; readonly pointer: number; readonly start: Point; readonly from: CameraState }
  | { readonly kind: 'move'; readonly pointer: number; readonly start: Point; readonly bases: ReadonlyMap<CardId, Rect>; moved: boolean }
  | { readonly kind: 'marquee'; readonly pointer: number; readonly start: Point; readonly base: readonly CardId[] };
interface Glide { readonly from: CameraState; readonly to: CameraState; readonly start: number }
interface MeasurementRequest { readonly key: string; readonly generation: number; readonly card: Card; readonly epoch: number }

/** Sole owner of scene frames. Events enqueue data; layout reads precede writes. */
export function createCanvas(args: CanvasAttachment): CanvasEngine {
  const { stage, world, backdrop, overlay, workspace } = args;
  const ownerWindow = stage.ownerDocument.defaultView;
  if (!ownerWindow) throw new Error('Scene stage must belong to a window');
  const view = ownerWindow;
  const board = workspace.scene.snapshot(), graph = new SceneGraph(board);
  const painter = new CanvasPainter(backdrop, overlay), metrics = new FrameMetrics();
  const layout = new RepresentationLayout<CardId>();
  let camera: CameraState = { x: board.view.x, y: board.view.y, zoom: clampZoom(board.view.z) };
  const initialRect = stage.getBoundingClientRect();
  let viewport: Rect = { x: 0, y: 0, width: Math.max(1, initialRect.width), height: Math.max(1, initialRect.height) }, stageOrigin: Point = { x: initialRect.x, y: initialRect.y };
  let dpr = view.devicePixelRatio || 1, viewportDirty = false, disposed = false, pending = 0, frameCount = 0, epoch = 0, resetLeases = false;
  let tier: ZoomTier = 'detail', glide: Glide | null = null, gesture: Gesture | null = null, spaceHeld = false;
  let previousFrame = 0, inputAt: number | null = null, discardedMeasurements = 0;
  let representations: Representation[] = [], candidates: SceneNode[] = [], drawnLinks: DrawLink[] = [];
  let displayed: ReadonlyMap<CardId, DisplayRect> = new Map(), placements: LeasePlacement[] = [];
  let selected = new Set(workspace.selection.getSnapshot()), marquee: Rect | null = null;
  let focusId: CardId | null = null;
  const inputs: Input[] = [], positions = new Map<CardId, Rect>(), measurements = new Map<string, MeasurementRequest>(), retired = new Set<CardId>();
  const abort = new AbortController();
  const reduced = args.reducedMotion ?? view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canLease = args.canLease ?? ((card: Card): boolean => card.type === 'note' || card.type === 'title');
  const pool = new LeasePool(world, board.id, Math.max(1, args.warmLeases ?? 256), invalidate);

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

  function select(ids: readonly CardId[]): void {
    selected = new Set(ids);
    post(() => workspace.act({ kind: 'select', ids }));
  }

  function boundsFor(node: SceneNode): Rect { return positions.get(node.card.id) ?? node.layout.bounds; }

  function hitTest(point: Point): CardId | null {
    for (let i = representations.length - 1; i >= 0; i--) {
      const rep = representations[i];
      if (rep && hitRotated(point, rep.bounds, rep.rotation)) return rep.id;
    }
    return null;
  }

  function navigation(intent: Navigation, now: number): void {
    let target: CameraState;
    switch (intent.kind) {
      case 'restore': target = { x: intent.camera.x, y: intent.camera.y, zoom: clampZoom(intent.camera.zoom) }; break;
      case 'fit': {
        const ids = new Set(intent.ids);
        const items = graph.all().filter(node => !ids.size || ids.has(node.card.id)).map(node => node.layout);
        target = fitSpatial(items, { x: 48, y: 48, width: Math.max(1, viewport.width - 96), height: Math.max(1, viewport.height - 96) });
        break;
      }
      default: { const exhaustive: never = intent; return exhaustive; }
    }
    if (intent.motion === 'instant' || reduced) { camera = target; glide = null; }
    else glide = { from: camera, to: target, start: now };
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
      case 'marquee': {
        marquee = { x: Math.min(point.x, gesture.start.x), y: Math.min(point.y, gesture.start.y), width: Math.abs(dx), height: Math.abs(dy) };
        if (marquee.width + marquee.height < 4) break;
        const hits = representations.filter(rep => contains(marquee ?? viewport, rep.bounds) && !graph.nodes.get(rep.id)?.locked).map(rep => rep.id);
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
          glide = null;
          if (input.zoom) {
            const anchor = unproject(input.point, camera), zoom = clampZoom(camera.zoom * Math.exp(-input.dy * 0.01));
            camera = { x: input.point.x - anchor.x * zoom, y: input.point.y - anchor.y * zoom, zoom };
          } else camera = { x: camera.x - input.dx, y: camera.y - input.dy, zoom: camera.zoom };
          break;
        }
        case 'down': {
          glide = null;
          if (gesture) break;
          if (input.pan) { gesture = { kind: 'pan', pointer: input.pointer, start: input.point, from: camera }; break; }
          const id = hitTest(input.point), node = id ? graph.nodes.get(id) : undefined;
          if (id && node) {
            if (node.locked) break;
            if (input.modifiers.bypass) select([id]);
            else if (input.modifiers.shift) select(selected.has(id) ? [...selected].filter(candidate => candidate !== id) : [...selected, id]);
            else if (!selected.has(id)) select([id]);
            const bases = new Map<CardId, Rect>();
            for (const candidate of selected) { const current = graph.nodes.get(candidate); if (current && !current.locked) bases.set(candidate, current.layout.bounds); }
            gesture = { kind: 'move', pointer: input.pointer, start: input.point, bases, moved: false };
            pool.pin(id, 'capture', true);
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
          }
          gesture = null; marquee = null; break;
        }
        case 'cancel':
          if (gesture?.kind === 'move') for (const id of gesture.bases.keys()) pool.pin(id, 'capture', false);
          positions.clear(); gesture = null; marquee = null; glide = null; break;
        default: { const exhaustive: never = input; return exhaustive; }
      }
    }
    inputs.length = 0;
  }

  function cull(): void {
    tier = zoomTier(camera.zoom, tier);
    // Labels can extend 360 screen pixels beyond their world anchor.
    const margin = tier === 'detail' && camera.zoom >= 12 / 11 ? 32 : 384;
    const query = { x: (-camera.x - margin) / camera.zoom, y: (-camera.y - margin) / camera.zoom, width: (viewport.width + margin * 2) / camera.zoom, height: (viewport.height + margin * 2) / camera.zoom };
    candidates = graph.query(toBounds(query));
    if (positions.size) {
      candidates = candidates.filter(node => !positions.has(node.card.id));
      for (const [id, bounds] of positions) { const node = graph.nodes.get(id); if (node && !node.hidden && intersects(bounds, query)) candidates.push(node); }
      candidates.sort((a, b) => a.rank - b.rank);
    }
    const items: LayoutItem<CardId>[] = candidates.map(node => positions.has(node.card.id) ? { ...node.layout, bounds: boundsFor(node) } : node.layout);
    displayed = layout.layout(items, camera, tier, viewport);
    representations = []; placements = [];
    for (const node of candidates) {
      let r = displayed.get(node.card.id);
      if (r && r.kind !== 'detail' && pool.isPinned(node.card.id)) {
        r = { ...project(boundsFor(node), camera), kind: 'detail' };
        const next = new Map(displayed); next.set(node.card.id, r); displayed = next;
      }
      if (!r || !intersects(fromBounds(rotatedBounds(r, r.kind === 'summary' ? 0 : node.rotation)), viewport)) continue;
      const rotation = r.kind === 'summary' ? 0 : node.rotation;
      representations.push({ id: node.card.id, kind: r.kind, bounds: r, rotation, text: node.text });
      if (r.kind === 'detail' && canLease(node.card)) {
        const bounds = boundsFor(node);
        placements.push({ node, ...bounds, rotation, selected: selected.has(node.card.id) });
      }
    }
    // Selected bodies have first admission when a dense view exceeds warm capacity.
    placements.sort((a, b) => Number(b.selected) - Number(a.selected) || a.node.rank - b.node.rank);
    const links = new Map(graph.queryLinks(toBounds(query)).map(entry => [entry.link.id, entry]));
    for (const id of positions.keys()) for (const linkId of graph.incident.get(id) ?? []) { const entry = graph.links.get(linkId); if (entry) links.set(linkId, entry); }
    drawnLinks = [];
    for (const { link, route } of links.values()) {
      const a = graph.nodes.get(link.a), b = graph.nodes.get(link.b);
      if (!a || !b || a.hidden || b.hidden) continue;
      const ra = displayed.get(link.a), rb = displayed.get(link.b);
      if (positions.size || ra?.kind === 'summary' || rb?.kind === 'summary') {
        drawnLinks.push({ link, route: routeLink(link, ra ?? project(boundsFor(a), camera), rb ?? project(boundsFor(b), camera), ra?.kind === 'summary' ? 0 : a.rotation, rb?.kind === 'summary' ? 0 : b.rotation, camera.zoom) });
      } else {
        const p = (point: Point): Point => ({ x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y });
        drawnLinks.push({ link, route: { p0: p(route.p0), p2: p(route.p2), control: p(route.control), label: p(route.label) } });
      }
    }
  }

  function readMeasurements(): void {
    const commits: { readonly request: MeasurementRequest; readonly id: CardId; readonly height: number }[] = [];
    for (const request of measurements.values()) {
      const lease = pool.find(request.key, request.generation), current = lease ? graph.nodes.get(lease.cardId)?.card : null;
      if (!lease || request.epoch !== epoch || current !== request.card) { discardedMeasurements++; continue; }
      if (current.props?.fixedHeight) continue;
      const height = Math.max(24, Math.min(4000, Math.ceil(lease.host.scrollHeight)));
      if (Math.abs(height - current.h) > 1) commits.push({ request, id: current.id, height });
    }
    measurements.clear();
    if (commits.length) post(() => {
      const commands: Command[] = [];
      for (const { request, id, height } of commits) if (pool.find(request.key, request.generation) && graph.nodes.get(id)?.card === request.card) commands.push({ op: 'measure', id, h: height, baseHeight: request.card.h });
      if (commands.length) workspace.submit(commands);
    });
  }

  function frame(timestamp: number): void {
    pending = 0;
    if (disposed) return;
    const start = performance.now();
    const phases: Record<FramePhase, number> = { input: 0, camera: 0, cull: 0, reads: 0, writes: 0 };
    let mark = start;
    drainInput(timestamp); phases.input = performance.now() - mark; mark = performance.now();
    if (glide) {
      const t = Math.min(1, Math.max(0, (timestamp - glide.start) / 420)), k = 1 - (1 - t) ** 3;
      camera = { x: glide.from.x + (glide.to.x - glide.from.x) * k, y: glide.from.y + (glide.to.y - glide.from.y) * k, zoom: glide.from.zoom + (glide.to.zoom - glide.from.zoom) * k };
      if (t === 1) glide = null;
    }
    phases.camera = performance.now() - mark; mark = performance.now();
    cull(); phases.cull = performance.now() - mark; mark = performance.now();
    if (viewportDirty || dpr !== view.devicePixelRatio) {
      const rect = stage.getBoundingClientRect();
      viewport = { x: 0, y: 0, width: Math.max(1, rect.width), height: Math.max(1, rect.height) }; stageOrigin = { x: rect.x, y: rect.y };
      dpr = view.devicePixelRatio || 1; viewportDirty = false;
      invalidate();
    }
    readMeasurements(); phases.reads = performance.now() - mark; mark = performance.now();
    if (resetLeases) { pool.reset(workspace.scene.snapshot().id); resetLeases = false; }
    for (const id of retired) pool.retire(id);
    retired.clear();
    world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
    stage.dataset.zoomTier = tier; stage.classList.toggle('panning', gesture?.kind === 'pan'); stage.classList.toggle('pan-ready', spaceHeld);
    pool.reconcile(placements, timestamp);
    painter.paint(viewport, dpr, camera, representations, drawnLinks, id => pool.has(id), selected, marquee);
    phases.writes = performance.now() - mark;
    const end = performance.now();
    metrics.push(start, previousFrame ? timestamp - previousFrame : 0, end - start, phases, inputAt === null ? null : end - inputAt, candidates.length, drawnLinks.length, pool.stats().active);
    previousFrame = timestamp; inputAt = null; frameCount++;
    if (glide) invalidate();
  }

  function point(event: MouseEvent): Point { return { x: event.clientX - stageOrigin.x, y: event.clientY - stageOrigin.y }; }
  function editable(target: EventTarget | null): boolean { return target instanceof Element && !!target.closest('input,textarea,select,button,a,video,audio,[contenteditable]:not([contenteditable="false"]),[data-scene-interactive]'); }

  stage.addEventListener('wheel', event => {
    if (editable(event.target) && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
    enqueue({ kind: 'wheel', point: point(event), dx: event.deltaX * scale, dy: event.deltaY * scale, zoom: event.ctrlKey || event.metaKey, at: performance.now() });
  }, { passive: false, signal: abort.signal });
  stage.addEventListener('pointerdown', event => {
    const pan = event.button === 1 || event.button === 0 && spaceHeld;
    if ((!pan && (event.button !== 0 || editable(event.target))) || gesture) return;
    event.preventDefault(); stage.focus({ preventScroll: true }); stage.setPointerCapture(event.pointerId);
    if (pan) event.stopImmediatePropagation();
    enqueue({ kind: 'down', point: point(event), pointer: event.pointerId, pan, modifiers: { shift: event.shiftKey, bypass: event.metaKey || event.ctrlKey }, at: performance.now() });
  }, { capture: true, signal: abort.signal });
  stage.addEventListener('pointermove', event => { if (stage.hasPointerCapture(event.pointerId)) enqueue({ kind: 'move', point: point(event), pointer: event.pointerId, bypass: event.metaKey || event.ctrlKey, at: performance.now() }); }, { signal: abort.signal });
  stage.addEventListener('pointerup', event => { enqueue({ kind: 'up', point: point(event), pointer: event.pointerId, bypass: event.metaKey || event.ctrlKey, at: performance.now() }); }, { signal: abort.signal });
  stage.addEventListener('pointercancel', () => enqueue({ kind: 'cancel', at: performance.now() }), { signal: abort.signal });
  stage.addEventListener('lostpointercapture', event => {
    if (!inputs.some(input => input.kind === 'up' && input.pointer === event.pointerId) && (gesture?.pointer === event.pointerId || inputs.some(input => input.kind === 'down' && input.pointer === event.pointerId))) enqueue({ kind: 'cancel', at: performance.now() });
  }, { signal: abort.signal });
  view.addEventListener('blur', () => { spaceHeld = false; enqueue({ kind: 'cancel', at: performance.now() }); }, { signal: abort.signal });
  view.addEventListener('keydown', event => {
    if (editable(event.target)) return;
    if (event.code === 'Space') { spaceHeld = true; event.preventDefault(); invalidate(); }
    if (event.key === '0' && !event.metaKey && !event.ctrlKey) enqueue({ kind: 'navigation', intent: { kind: 'fit', ids: [], motion: 'glide' }, at: performance.now() });
    if (event.key === 'Escape') { select([]); enqueue({ kind: 'cancel', at: performance.now() }); }
    if (event.key === 'a' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); select(graph.all().filter(node => !node.locked).map(node => node.card.id)); invalidate(); }
  }, { signal: abort.signal });
  view.addEventListener('keyup', event => { if (event.code === 'Space') { spaceHeld = false; invalidate(); } }, { signal: abort.signal });
  stage.addEventListener('focusin', event => {
    if (!(event.target instanceof Node)) return;
    if (focusId) pool.pin(focusId, 'focus', false);
    focusId = pool.cardAt(event.target); if (focusId) pool.pin(focusId, 'focus', true);
    if (editable(event.target)) spaceHeld = false;
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
      const next = workspace.scene.snapshot(); epoch++; graph.replace(next); layout.clear(); measurements.clear(); positions.clear(); inputs.length = 0;
      camera = { x: next.view.x, y: next.view.y, zoom: clampZoom(next.view.z) }; gesture = null; glide = null; resetLeases = true;
    } else { graph.apply(change); for (const id of change.removed) retired.add(id); }
    invalidate();
  });
  const unsubscribeSelection = workspace.selection.subscribe(() => { selected = new Set(workspace.selection.getSnapshot()); invalidate(); });
  invalidate();

  return {
    leases: pool.source,
    navigate: intent => enqueue({ kind: 'navigation', intent, at: performance.now() }),
    camera: () => ({ ...camera }),
    screenToWorld: p => unproject(p, camera),
    representations: () => representations,
    hitTest,
    pin: (id, reason, pinned) => { pool.pin(id, reason, pinned); invalidate(); },
    requestMeasurement: (key, generation) => {
      const lease = pool.find(key, generation), card = lease ? graph.nodes.get(lease.cardId)?.card : null;
      if (lease && card) measurements.set(key, { key, generation, card, epoch });
      else discardedMeasurements++;
      invalidate();
    },
    invalidate,
    inspect: () => { const stats = pool.stats(); return { pendingFrames: pending ? 1 : 0, frameCount, visibleCards: representations.length, visibleLinks: drawnLinks.length, activeLeases: stats.active, pinnedLeases: stats.pinned, releasingLeases: stats.releasing, queuedMounts: stats.queued, discardedMeasurements, tier, camera: { ...camera } }; },
    recordMetrics: enabled => { metrics.record(enabled); previousFrame = 0; },
    samples: () => metrics.samples(),
    dispose: () => {
      if (disposed) return;
      disposed = true; epoch++; if (pending) view.cancelAnimationFrame(pending); pending = 0;
      abort.abort(); observer.disconnect(); unsubscribeScene(); unsubscribeSelection(); pool.dispose();
      metrics.record(false);
      graph.clear(); layout.clear(); measurements.clear(); inputs.length = 0; positions.clear(); representations = []; placements = []; drawnLinks = []; candidates = [];
    },
  };
}
