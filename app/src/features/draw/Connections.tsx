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
  return { u: Math.max(0, Math.min(1, .5 + (x * Math.cos(angle) - y * Math.sin(angle)) / card.w)), v: Math.max(0, Math.min(1, .5 + (x * Math.sin(angle) + y * Math.cos(angle)) / card.h)) };
}

export function startCreativeConnection(workspace: FeatureWorkspace, id: CardId): void {
  const connections = installed.get(workspace);
  if (!connections) throw new Error('CreativeConnections must be mounted before connecting cards.');
  connections.start(id);
}

function installConnections(workspace: FeatureWorkspace, engine: CanvasEngine, notify: (id: LinkId | null) => void): Connections {
  const element = document.getElementById('stage'); if (!element) throw new Error('Connections require the real scene stage.');
  const stage: HTMLElement = element;
  const layer = svg('svg', { class: 'creative-connections', width: '100%', height: '100%', 'aria-label': 'Connectors' }), group = svg('g', {});
  Object.assign(layer.style, { position: 'absolute', inset: '0', overflow: 'visible', pointerEvents: 'none', zIndex: '4' }); layer.append(group); stage.append(layer);
  let selected: LinkId | null = null, disposed = false, dirty = true;
  type Preview = { readonly source: CardId; readonly point: ToolPointer; readonly except: CardId; readonly endpoint?: 'a' | 'b' };
  let preview: Preview | null = null;
  function choose(id: LinkId | null): void {
    selected = id; notify(id); dirty = true;
    if (id) workspace.act({ kind: 'select', ids: [] });
    engine.invalidate();
  }
  const link = () => workspace.scene.snapshot().links.find(link => link.id === selected);
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
        engine.afterInput(() => choose(id));
      }
      finish();
    }, acceptsKey: key => key.key === 'Escape' || key.key === 'Enter', key: finish, cancel: () => { active = false; preview = null; dirty = true; engine.invalidate(); } });
    stage.focus({ preventScroll: true });
  }
  function edit(kind: 'select' | 'bend' | 'a' | 'b'): SceneTool {
    const current = link(); let changed = false;
    const release = toolExit(engine, 'edit-connector');
    let bend = current?.bend ?? 0;
    const move = (point: ToolPointer) => {
      if (!current || !point.buttons) return;
      if (kind === 'bend') {
        const route = engine.linkRoute(current.id); if (!route) return;
        const dx = route.end.x - route.start.x, dy = route.end.y - route.start.y, length = Math.hypot(dx, dy) || 1;
        const value = 2 * ((point.world.x - (route.start.x + route.end.x) / 2) * -dy + (point.world.y - (route.start.y + route.end.y) / 2) * dx) / length;
        bend = Math.abs(value * engine.camera().zoom) < 8 ? 0 : Math.round(value); changed = true;
      } else if (kind === 'a' || kind === 'b') {
        preview = { source: kind === 'a' ? current.b : current.a, except: kind === 'a' ? current.b : current.a, endpoint: kind, point }; changed = true;
      }
      dirty = true; engine.invalidate();
    };
    return { id: 'edit-connector', accepts: point => point.button === 0, down: move, move: points => { const point = points.at(-1); if (point) move(point); }, up: point => {
      if (current && changed && kind === 'bend') engine.commitTool({ commands: [{ op: 'link_update', id: current.id, set: { bend } }], selection: [] });
      else if (current && changed && (kind === 'a' || kind === 'b')) {
        const to = target(point, kind === 'a' ? current.b : current.a);
        if (to && !duplicate(kind === 'a' ? to.id : current.a, kind === 'b' ? to.id : current.b, current.id)) engine.commitTool({ commands: [{ op: 'link_update', id: current.id, set: kind === 'a' ? { a: to.id, pa: pin(to, point.world) } : { b: to.id, pb: pin(to, point.world) } }], selection: [] });
      }
      preview = null; dirty = true; engine.invalidate();
    }, acceptsKey: key => ['Escape', 'Delete', 'Backspace'].includes(key.key), key: key => {
      if (key.key !== 'Escape' && current) engine.commitTool({ commands: [{ op: 'link_update', id: current.id, remove: true }], selection: [] });
      engine.afterInput(() => choose(null)); release();
    }, cancel: () => { preview = null; dirty = true; engine.invalidate(); } };
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const control = event.target.closest('[data-link],[data-connect-end],[data-connect-bend]');
    if (control instanceof SVGElement && layer.contains(control)) {
      const id = control.dataset.link, found = id ? workspace.scene.snapshot().links.find(link => link.id === id)?.id : selected;
      if (!found) return;
      choose(found);
      const endpoint = control.dataset.connectEnd;
      engine.tool(edit(endpoint === 'a' || endpoint === 'b' ? endpoint : control.hasAttribute('data-connect-bend') ? 'bend' : 'select'));
    } else if (selected && !event.target.closest('.draw-inspector,.colour-pop,.ctx-menu')) {
      choose(null); if (engine.toolName() === 'edit-connector') engine.tool(null);
    }
  };
  document.addEventListener('pointerdown', down, true);
  const offScene = workspace.scene.subscribe(change => {
    if (change.kind === 'replace') { preview = null; choose(null); }
    else if (selected && !link()) choose(null);
    dirty = true; engine.invalidate();
  });
  const offFrame = engine.registerFrameParticipant({ write: () => {
    if (disposed) return;
    const camera = engine.camera(); group.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
    if (!dirty && !engine.busy()) return;
    dirty = false; group.replaceChildren();
    for (const link of workspace.scene.snapshot().links) {
      const route = engine.linkRoute(link.id); if (!route) continue;
      group.append(svg('path', { class: 'link-hit', 'data-link': link.id, d: route.d, fill: 'none', stroke: 'transparent', 'stroke-width': 16 / camera.zoom, 'pointer-events': 'stroke' }));
      if (link.id !== selected) continue;
      const knob = (point: { x: number; y: number }, attrs: Readonly<Record<string, string>>) => group.append(svg('circle', { cx: point.x, cy: point.y, r: 6 / camera.zoom, class: 'draw-link-knob', fill: 'var(--card)', stroke: 'var(--focus)', 'stroke-width': 1.5 / camera.zoom, 'pointer-events': 'all', ...attrs }));
      knob(route.start, { 'data-connect-end': 'a' }); knob(route.end, { 'data-connect-end': 'b' }); knob(route.label, { 'data-connect-bend': '1' });
    }
    if (preview) {
      const from = workspace.record(preview.source).getSnapshot(), to = target(preview.point, preview.except); if (!from) return;
      const end = to ? rect(to) : { ...preview.point.world, width: 0, height: 0 }, route = routeLink({}, rect(from), end, from.rot, to?.rot);
      if (to) group.append(svg('rect', { ...rect(to), 'data-connect-target': to.id, fill: 'none', stroke: 'var(--focus)', 'stroke-width': 2 / camera.zoom }));
      group.append(svg('path', { 'data-connect-preview': '', d: `M${route.p0.x} ${route.p0.y} Q${route.control.x} ${route.control.y} ${route.p2.x} ${route.p2.y}`, fill: 'none', stroke: 'var(--focus)', 'stroke-width': 1.5 / camera.zoom }));
    }
  } });
  return { start, clear: () => { choose(null); if (engine.toolName() === 'edit-connector' || engine.toolName() === 'connect-creative') engine.tool(null); }, dispose: () => { disposed = true; offFrame(); offScene(); document.removeEventListener('pointerdown', down, true); layer.remove(); } };
}

export function CreativeConnections({ context }: { readonly context: FeatureContext }) {
  const engine = context.engine(), [selected, setSelected] = useState<LinkId | null>(null), controller = useRef<Connections | null>(null);
  const settings = useRef<DrawSettings>({ ...readPreferences(), shape: 'rect', fill: '#aed3ff', stroke: 'ink', sw: 2.5, sdash: 'solid', dl: 8, dg: 6, emoji: '⭐' });
  useEffect(() => {
    if (!engine) return;
    const connections = installConnections(context.workspace, engine, setSelected); controller.current = connections; installed.set(context.workspace, connections);
    return () => { connections.dispose(); if (installed.get(context.workspace) === connections) installed.delete(context.workspace); controller.current = null; };
  }, [context.workspace, engine]);
  if (!selected || !engine) return null;
  return <DrawingInspector context={context} target={{ kind: 'link', id: selected }} onSettings={next => { settings.current = next; }} onFinish={() => controller.current?.clear()} onArm={request => { if (request.kind === 'edit-points') beginPointEdit(context.workspace, engine, request.id); else engine.tool(drawingTool(engine, context.workspace, request.kind, () => settings.current, () => controller.current?.clear())); }} />;
}
