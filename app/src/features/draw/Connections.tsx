import { useEffect, useRef, useState } from 'react';
import { LinkIdSchema } from '@aegis/domain/schema';
import type { Card, CardId, LinkId } from '@aegis/domain';
import { routeLink } from '@aegis/scene';
import type { CanvasEngine, SceneTool, ToolPointer } from '@aegis/scene';
import type { FeatureContext, FeatureWorkspace } from '../../composition.js';
import { DrawingInspector } from './Inspector.js';
import type { DrawSettings } from './Inspector.js';
import { readPreferences } from './preferences.js';
import { drawingTool } from './tool.js';
import { beginPointEdit } from './point-editor.js';
import { toolExit } from '../../platform/tool-lifetime.js';

export type ConnectionSelectionChange = (id: LinkId | null) => void;

interface Connections { readonly start: (id: CardId) => void; readonly clear: () => void; readonly dispose: () => void }
const installed = new WeakMap<FeatureWorkspace, Connections>();
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Readonly<Record<string, string | number>>) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
};
const rect = (card: Card) => ({ x: card.x, y: card.y, width: card.w, height: card.h });
function pin(card: Card, point: { readonly x: number; readonly y: number }) {
  const x = point.x - card.x - card.w / 2, y = point.y - card.y - card.h / 2, angle = -(card.rot ?? 0) * Math.PI / 180;
  const u = Math.max(0, Math.min(1, .5 + (x * Math.cos(angle) - y * Math.sin(angle)) / card.w));
  const v = Math.max(0, Math.min(1, .5 + (x * Math.sin(angle) + y * Math.cos(angle)) / card.h));
  const distances = [u, 1 - u, v, 1 - v], side = distances.indexOf(Math.min(...distances));
  return side === 0 ? { u: 0, v } : side === 1 ? { u: 1, v } : side === 2 ? { u, v: 0 } : { u, v: 1 };
}

export function startCreativeConnection(workspace: FeatureWorkspace, id: CardId): void {
  const connections = installed.get(workspace);
  if (!connections) throw new Error('CreativeConnections must be mounted before connecting cards.');
  connections.start(id);
}

function installConnections(workspace: FeatureWorkspace, engine: CanvasEngine, notify: ConnectionSelectionChange): Connections {
  const element = document.getElementById('stage'); if (!element) throw new Error('Connections require the real scene stage.');
  const stage: HTMLElement = element;
  const layer = svg('svg', { class: 'creative-connections', width: '100%', height: '100%', 'aria-label': 'Connectors' }), group = svg('g', {});
  Object.assign(layer.style, { position: 'absolute', inset: '0', overflow: 'visible', pointerEvents: 'none', zIndex: '4' }); layer.append(group); stage.append(layer);
  const selection = svg('g', {}), feedback = svg('path', { class: 'draw-link-selection', fill: 'none', stroke: 'var(--focus)', 'stroke-width': 7, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' });
  const knobs = (['a', 'b', 'bend'] as const).map(kind => {
    const host = svg('g', {}), circle = svg('circle', { r: 6, class: 'draw-link-knob', fill: 'var(--card)', stroke: 'var(--focus)', 'stroke-width': 1.5, 'pointer-events': 'all', ...(kind === 'bend' ? { 'data-connect-bend': '1' } : { 'data-connect-end': kind }) });
    host.append(circle); selection.append(host); return { kind, host, circle };
  });
  selection.prepend(feedback); selection.style.display = 'none';
  const previewGroup = svg('g', {}), previewTarget = svg('rect', { fill: 'none', stroke: 'var(--focus)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }), previewPath = svg('path', { 'data-connect-preview': '', fill: 'none', stroke: 'var(--focus)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
  previewGroup.style.display = 'none';
  let selected: LinkId | null = null, disposed = false, dirty = true;
  let selectedLink: ReturnType<FeatureWorkspace['scene']['snapshot']>['links'][number] | undefined;
  let paintedRoute = '', paintedZoom = 0, paintedCamera = '';
  previewGroup.append(previewTarget, previewPath);
  type Preview = { readonly source: CardId; readonly point: ToolPointer; readonly except: CardId; readonly endpoint?: 'a' | 'b' };
  let preview: Preview | null = null;
  let bending: { readonly id: LinkId; readonly bend: number } | null = null;
  function choose(id: LinkId | null): void {
    const changed = selected !== id; selected = id; selectedLink = id ? workspace.scene.snapshot().links.find(link => link.id === id) : undefined; if (changed) notify(id); dirty = true;
    if (id) workspace.act({ kind: 'select', ids: [] });
    engine.invalidate();
  }
  const link = () => selectedLink;
  function target(at: ToolPointer, except: CardId) {
    const id = engine.hitTest(at.screen); return id && id !== except ? workspace.record(id).getSnapshot() : null;
  }
  function duplicate(a: CardId, b: CardId, except?: LinkId): boolean {
    return workspace.scene.snapshot().links.some(link => link.id !== except && (link.a === a && link.b === b || link.a === b && link.b === a));
  }
  function start(source: CardId): void {
    if (!workspace.record(source).getSnapshot()) return;
    choose(null);
    const release = toolExit(engine, 'connect-creative'); let active = true;
    const finish = () => { active = false; preview = null; dirty = true; engine.invalidate(); release(); };
    const move = (point: ToolPointer) => { if (!active) return; preview = { source, point, except: source }; dirty = true; engine.invalidate(); };
    engine.tool({ id: 'connect-creative', accepts: point => active && point.button === 0, down: move, move: points => { const point = points.at(-1); if (point) move(point); }, up: point => {
      if (!active) return;
      const from = workspace.record(source).getSnapshot(), to = target(point, source);
      if (from && to && !duplicate(source, to.id)) {
        const id = LinkIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 16));
        engine.commitTool({ commands: [{ op: 'connect', a: source, b: to.id, newId: id }, { op: 'link_update', id, set: { pa: pin(from, point.world), pb: pin(to, point.world) } }], selection: [] });
        engine.afterInput(() => { choose(id); engine.tool(edit()); });
      }
      finish();
    }, acceptsKey: key => key.key === 'Escape' || key.key === 'Enter', key: finish, cancel: reason => { if (reason !== 'pan' && reason !== 'pointer-cancel' && reason !== 'lost-capture') active = false; preview = null; dirty = true; engine.invalidate(); } });
    stage.focus({ preventScroll: true });
  }
  function handleAt(point: ToolPointer): 'select' | 'bend' | 'a' | 'b' {
    const route = selected ? engine.linkRoute(selected) : null;
    if (!route) return 'select';
    const radius = 10 / engine.camera().zoom;
    for (const [kind, at] of [['a', route.start], ['b', route.end], ['bend', route.label]] as const) if (Math.hypot(point.world.x - at.x, point.world.y - at.y) <= radius) return kind;
    return 'select';
  }
  function edit(): SceneTool {
    let current = link(), changed = false, kind: 'select' | 'bend' | 'a' | 'b' = 'select';
    const release = toolExit(engine, 'edit-connector');
    let bend = current?.bend ?? 0;
    const move = (point: ToolPointer) => {
      if (!current || !point.buttons) return;
      if (kind === 'bend') {
        const route = engine.linkRoute(current.id); if (!route) return;
        const dx = route.end.x - route.start.x, dy = route.end.y - route.start.y, length = Math.hypot(dx, dy) || 1;
        const value = 2 * ((point.world.x - (route.start.x + route.end.x) / 2) * -dy + (point.world.y - (route.start.y + route.end.y) / 2) * dx) / length;
        bend = Math.abs(value * engine.camera().zoom) < 8 ? 0 : Math.round(value); bending = { id: current.id, bend }; changed = true;
      } else if (kind === 'a' || kind === 'b') {
        preview = { source: kind === 'a' ? current.b : current.a, except: kind === 'a' ? current.b : current.a, endpoint: kind, point }; changed = true;
      }
      dirty = true; engine.invalidate();
    };
    return { id: 'edit-connector', accepts: (point, hit) => point.button === 0 && (handleAt(point) !== 'select' || !hit && engine.hitTestLink(point.screen) === selected), down: point => { current = link(); kind = handleAt(point); changed = false; bend = current?.bend ?? 0; move(point); }, move: points => { const point = points.at(-1); if (point) move(point); }, up: point => {
      if (current && changed && kind === 'bend') engine.commitTool({ commands: [{ op: 'link_update', id: current.id, set: { bend } }], selection: [] });
      else if (current && changed && (kind === 'a' || kind === 'b')) {
        const to = target(point, kind === 'a' ? current.b : current.a);
        if (to && !duplicate(kind === 'a' ? to.id : current.a, kind === 'b' ? to.id : current.b, current.id)) engine.commitTool({ commands: [{ op: 'link_update', id: current.id, set: kind === 'a' ? { a: to.id, pa: pin(to, point.world) } : { b: to.id, pb: pin(to, point.world) } }], selection: [] });
      }
      preview = null; bending = null; dirty = true; engine.invalidate();
    }, acceptsKey: key => ['Escape', 'Delete', 'Backspace'].includes(key.key), key: key => {
      if (key.key !== 'Escape' && current) engine.commitTool({ commands: [{ op: 'link_update', id: current.id, remove: true }], selection: [] });
      engine.afterInput(() => choose(null)); release();
    }, cancel: reason => { preview = null; bending = null; dirty = true; engine.invalidate(); if (reason === 'tool-change') engine.afterInput(() => { if (!disposed && engine.toolName() !== 'edit-connector') choose(null); }); } };
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || event.defaultPrevented && stage.classList.contains('pan-ready') || !(event.target instanceof Element)) return;
    if (event.target.closest('.draw-inspector,.colour-pop,.ctx-menu')) return;
    const tool = engine.toolName();
    if (tool && tool !== 'edit-connector') return;
    const inside = stage.contains(event.target) && !event.target.closest('.card,[data-scene-interactive],button,input,textarea,select,a,[contenteditable="true"],[contenteditable="plaintext-only"]');
    const bounds = inside ? stage.getBoundingClientRect() : null;
    const found = bounds ? engine.hitTestLink({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }) : null;
    if (found) { choose(found); engine.tool(edit()); }
    else if (selected) { choose(null); if (engine.toolName() === 'edit-connector') engine.tool(null); }
  };
  document.addEventListener('pointerdown', down, true);
  const offScene = workspace.scene.subscribe(change => {
    if (change.kind === 'replace') { preview = null; bending = null; choose(null); }
    else if (selected) { selectedLink = workspace.scene.snapshot().links.find(link => link.id === selected); if (!selectedLink) choose(null); }
    dirty = true; engine.invalidate();
  });
  const offFrame = engine.registerFrameParticipant({ write: () => {
    if (disposed) return;
    const camera = engine.camera(), transform = `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`;
    if (transform !== paintedCamera) { group.setAttribute('transform', transform); paintedCamera = transform; }
    if (camera.zoom !== paintedZoom) { for (const knob of knobs) knob.circle.setAttribute('transform', `scale(${1 / camera.zoom})`); paintedZoom = camera.zoom; }
    const current = link();
    let route = current ? engine.linkRoute(current.id) : null;
    if (current && route && bending?.id === current.id) {
      const from = workspace.record(current.a).getSnapshot(), to = workspace.record(current.b).getSnapshot();
      if (from && to) {
        const curved = routeLink({ ...current, bend: bending.bend }, rect(from), rect(to), from.rot, to.rot);
        route = { d: `M${curved.p0.x} ${curved.p0.y} Q${curved.control.x} ${curved.control.y} ${curved.p2.x} ${curved.p2.y}`, start: curved.p0, end: curved.p2, control: curved.control, label: curved.label };
      }
    }
    const routeKey = route ? `${route.d}:${route.label.x},${route.label.y}` : '';
    if (!dirty && routeKey === paintedRoute) return;
    dirty = false; paintedRoute = routeKey;
    if (!route) selection.remove();
    if (route && current) {
      if (!selection.isConnected) group.prepend(selection);
      selection.style.display = '';
      feedback.setAttribute('d', route.d); feedback.setAttribute('stroke', current.colour || 'var(--focus)');
      feedback.setAttribute('opacity', bending ? '1' : '.18'); feedback.setAttribute('stroke-width', bending ? '2' : '7');
      for (const knob of knobs) { const at = knob.kind === 'a' ? route.start : knob.kind === 'b' ? route.end : route.label; knob.host.setAttribute('transform', `translate(${at.x} ${at.y})`); }
    }
    if (!preview) { previewGroup.remove(); return; }
    const from = workspace.record(preview.source).getSnapshot(), to = target(preview.point, preview.except);
    if (!from) { previewGroup.remove(); return; }
    const end = to ? rect(to) : { ...preview.point.world, width: 0, height: 0 }, next = routeLink({}, rect(from), end, from.rot, to?.rot);
    previewTarget.style.display = to ? '' : 'none';
    if (to) { for (const [key, value] of Object.entries(rect(to))) previewTarget.setAttribute(key, String(value)); previewTarget.setAttribute('data-connect-target', to.id); }
    else previewTarget.removeAttribute('data-connect-target');
    previewPath.setAttribute('d', `M${next.p0.x} ${next.p0.y} Q${next.control.x} ${next.control.y} ${next.p2.x} ${next.p2.y}`);
    previewGroup.style.display = ''; if (!previewGroup.isConnected) group.append(previewGroup);
  } });
  return { start, clear: () => { choose(null); if (engine.toolName() === 'edit-connector' || engine.toolName() === 'connect-creative') engine.tool(null); }, dispose: () => { disposed = true; offFrame(); offScene(); document.removeEventListener('pointerdown', down, true); layer.remove(); } };
}

export function CreativeConnections({ context, onSelectionChange }: { readonly context: FeatureContext; readonly onSelectionChange: ConnectionSelectionChange }) {
  const engine = context.engine(), [selected, setSelected] = useState<LinkId | null>(null), controller = useRef<Connections | null>(null);
  const settings = useRef<DrawSettings>({ ...readPreferences(), shape: 'rect', fill: '#aed3ff', stroke: 'ink', sw: 2.5, sdash: 'solid', dl: 8, dg: 6, emoji: '⭐' });
  useEffect(() => {
    if (!engine) return;
    const connections = installConnections(context.workspace, engine, id => { setSelected(id); onSelectionChange(id); }); controller.current = connections; installed.set(context.workspace, connections);
    return () => { connections.dispose(); if (installed.get(context.workspace) === connections) installed.delete(context.workspace); controller.current = null; };
  }, [context.workspace, engine, onSelectionChange]);
  if (!selected || !engine) return null;
  return <DrawingInspector context={context} target={{ kind: 'link', id: selected }} onSettings={next => { settings.current = next; }} onFinish={() => controller.current?.clear()} onArm={request => { if (request.kind === 'edit-points') beginPointEdit(context.workspace, engine, request.id); else engine.tool(drawingTool(engine, context.workspace, request.kind, () => settings.current, () => controller.current?.clear())); }} />;
}
