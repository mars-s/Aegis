import { z } from 'zod/v4';
import type { AgentId, CardId } from '@aegis/domain/schema';
import type { CameraState } from '@aegis/scene';
import type { FeatureContext } from '../../composition.js';
import type { AgentSnapshot } from './schema.js';
import { cardRect, COLLAPSED_HEIGHT, edgeLayout, freeAgentRect, intersects, WINDOW_WIDTH } from './geometry.js';
import type { EdgeGroup, EdgeSide, WindowRect } from './geometry.js';

/** The integration adapter must register these phases in the scene's sole scheduler. */
export interface AgentFrameSchedule {
  readonly register: (participant: { readonly read: () => void; readonly write: () => void }) => () => void;
  readonly invalidate: () => void;
  readonly availableArea: () => WindowRect;
}
const WindowPositionSchema = z.object({ x: z.number().finite(), y: z.number().finite(), collapsed: z.boolean(), closed: z.boolean() });
export function savedAgentWindow(id: AgentId): z.output<typeof WindowPositionSchema> | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`aegis:agent-window:${id}`) ?? 'null');
    const parsed = WindowPositionSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
interface WindowBinding {
  readonly agent: AgentSnapshot;
  readonly element: HTMLElement;
  readonly edge: HTMLButtonElement;
  readonly reveal: () => void;
  x: number; y: number; height: number; collapsed: boolean; closed: boolean; placed: boolean; dirty: boolean; manuallyMoved: boolean;
  screenX: number; screenY: number; offscreen: boolean;
}
export interface AgentScene {
  readonly bind: (agent: AgentSnapshot, element: HTMLElement, edge: HTMLButtonElement, reveal: () => void) => () => void;
  readonly collapsed: (id: AgentId, collapsed: boolean) => void;
  readonly closed: (id: AgentId, closed: boolean) => void;
  readonly drag: (id: AgentId, dx: number, dy: number, start: boolean, end: boolean) => void;
  readonly recover: (id: AgentId, keyboard: boolean) => void;
  readonly show: (id: AgentId) => void;
  readonly near: (id: AgentId, ids: readonly CardId[]) => void;
  readonly bounds: () => readonly WindowRect[];
  readonly fitBounds: (zoom: number) => readonly WindowRect[];
  readonly group: (side: EdgeSide) => EdgeGroup | undefined;
  readonly cluster: (side: EdgeSide, button: HTMLButtonElement | null) => void;
  readonly frame: (ids: readonly CardId[], islandHeight: number, instant: boolean) => void;
  readonly draft: (agentId: AgentId, element: HTMLElement, index: number, width: number, height: number) => () => void;
  readonly identity: (agentId: AgentId, element: HTMLElement | null) => void;
  readonly dispose: () => void;
}
export function createAgentScene(context: FeatureContext, schedule: AgentFrameSchedule): AgentScene {
  const windows = new Map<string, WindowBinding>();
  const drafts = new Map<HTMLElement, { agentId: AgentId; index: number; width: number; height: number; x: number; y: number }>();
  const clusters = new Map<EdgeSide, HTMLButtonElement>();
  const dragOrigins = new Map<AgentId, { x: number; y: number }>();
  let camera: CameraState = { x: 0, y: 0, zoom: 1 }, area: WindowRect = { x: 0, y: 0, w: 0, h: 0 };
  let groups: readonly EdgeGroup[] = [];
  let identity: { id: AgentId; element: HTMLElement; camera: CameraState; positioned: boolean; visible: boolean; x: number; y: number } | null = null;
  let cardSpace = context.workspace.scene.snapshot().cards.map(cardRect);
  let movingSpace: WindowRect[] = [], movingTimer: ReturnType<typeof setTimeout> | null = null;
  const save = (id: AgentId, w: WindowBinding): void => localStorage.setItem(`aegis:agent-window:${id}`, JSON.stringify({ x: w.x, y: w.y, closed: w.closed, collapsed: w.collapsed }));
  const viewport = (): WindowRect => ({ x: (area.x - camera.x) / camera.zoom, y: (area.y - camera.y) / camera.zoom, w: area.w / camera.zoom, h: area.h / camera.zoom });
  const size = (w: WindowBinding): WindowRect => ({ x: w.x, y: w.y, w: WINDOW_WIDTH / camera.zoom, h: (w.collapsed ? COLLAPSED_HEIGHT : w.height) / camera.zoom });
  const mark = (): void => { for (const w of windows.values()) w.dirty = true; schedule.invalidate(); };
  const offScene = context.workspace.scene.subscribe(() => {
    const next = context.workspace.scene.snapshot().cards.map(cardRect);
    movingSpace = [...cardSpace, ...next]; cardSpace = next;
    if (movingTimer) clearTimeout(movingTimer);
    movingTimer = setTimeout(() => { movingSpace = []; movingTimer = null; mark(); }, 1000);
    mark();
  });
  const offFrame = schedule.register({
    read() {
      camera = context.engine()?.camera() ?? camera; area = schedule.availableArea();
      for (const w of windows.values()) {
        if (!w.dirty || w.closed) continue;
        w.height = Math.max(COLLAPSED_HEIGHT, w.element.offsetHeight);
        const neighbours = [...windows.values()].filter(other => other !== w && !other.closed).map(size);
        const preferred = w.placed ? { x: w.x, y: w.y } : null;
        if (!preferred || [...cardSpace, ...movingSpace, ...neighbours].some(card => intersects(size(w), card))) {
          const position = freeAgentRect([...cardSpace, ...movingSpace], neighbours, preferred ?? { x: viewport().x + viewport().w / 2 - WINDOW_WIDTH / 2 / camera.zoom, y: viewport().y + viewport().h / 2 - 180 / camera.zoom }, size(w).h, preferred, viewport(), size(w).w);
          w.x = position.x; w.y = position.y;
        }
        w.placed = true; w.dirty = false; save(w.agent.id, w);
      }
      for (const w of windows.values()) {
        w.screenX = w.x * camera.zoom + camera.x; w.screenY = w.y * camera.zoom + camera.y;
        w.offscreen = !w.closed && (w.screenX + WINDOW_WIDTH <= area.x || w.screenX >= area.x + area.w || w.screenY + (w.collapsed ? COLLAPSED_HEIGHT : w.height) <= area.y || w.screenY >= area.y + area.h);
      }
      groups = edgeLayout([...windows.values()].filter(w => w.offscreen).map(w => ({ id: w.agent.id, created: w.agent.created, dx: w.screenX + WINDOW_WIDTH / 2 - area.w / 2, dy: w.screenY + (w.collapsed ? COLLAPSED_HEIGHT : w.height) / 2 - area.h / 2 })), area.w, area.h);
      const heights = new Map<AgentId, [number, number]>();
      const columns = new Map<AgentId, number>();
      for (const d of drafts.values()) columns.set(d.agentId, Math.max(columns.get(d.agentId) ?? 0, d.width + 16));
      for (const d of drafts.values()) {
        const w = windows.get(d.agentId), start = w && !w.closed ? { x: w.x + WINDOW_WIDTH / camera.zoom + 24, y: w.y } : { x: viewport().x + viewport().w / 2 - 160, y: viewport().y + viewport().h / 2 - 160 };
        let mine = heights.get(d.agentId); if (!mine) { mine = [0, 0]; heights.set(d.agentId, mine); }
        const column = d.index % 2 === 0 ? 0 : 1;
        d.x = (start.x + column * (columns.get(d.agentId) ?? 0)) * camera.zoom + camera.x;
        d.y = (start.y + mine[column]) * camera.zoom + camera.y;
        mine[column] += d.height + 16;
      }
      if (identity) {
        const w = windows.get(identity.id);
        const unchanged = identity.camera.x === camera.x && identity.camera.y === camera.y && identity.camera.zoom === camera.zoom;
        identity.visible = !!w && w.collapsed && !w.closed && camera.zoom < 12 / 13 && (!identity.positioned || unchanged);
        if (identity.visible && w && !identity.positioned) {
          const width = identity.element.offsetWidth / camera.zoom, height = identity.element.offsetHeight / camera.zoom;
          const rect = viewport();
          const p = freeAgentRect(cardSpace, [...windows.values()].filter(w => !w.closed).map(size), { x: w.x, y: w.y + (COLLAPSED_HEIGHT + 8) / camera.zoom }, height, null, rect, width);
          identity.visible = p.x >= rect.x && p.y >= rect.y && p.x + width <= rect.x + rect.w && p.y + height <= rect.y + rect.h;
          identity.x = p.x * camera.zoom + camera.x; identity.y = p.y * camera.zoom + camera.y;
          identity.positioned = true; identity.camera = camera;
        }
      }
    },
    write() {
      for (const w of windows.values()) {
        w.element.style.transform = `translate(${w.screenX}px, ${w.screenY}px)`;
        w.element.dataset.sceneReady = 'true';
        w.element.hidden = w.closed; w.edge.hidden = !w.offscreen;
      }
      for (const [element, draft] of drafts) element.style.transform = `translate(${draft.x}px, ${draft.y}px) scale(${camera.zoom})`;
      for (const group of groups) {
        const cluster = clusters.get(group.side);
        if (cluster) {
          cluster.hidden = !group.crowded;
          cluster.style.transform = `translate(${group.x}px, ${group.y}px)`;
          cluster.setAttribute('aria-label', `${group.entries.length} agents off-screen ${group.side}`);
          const count = cluster.firstElementChild; if (count) count.textContent = String(group.entries.length);
        }
        for (const entry of group.entries) {
          const w = windows.get(entry.id);
          if (!w) continue;
          w.edge.hidden = group.crowded; w.edge.style.transform = `translate(${entry.x}px, ${entry.y}px)`;
          w.edge.style.setProperty('--direction', `${entry.direction}rad`);
        }
      }
      if (identity) {
        identity.element.hidden = !identity.visible; identity.element.style.visibility = identity.visible ? 'visible' : 'hidden';
        identity.element.style.transform = `translate(${identity.x}px, ${identity.y}px)`;
        const button = windows.get(identity.id)?.element.querySelector('.agent-window-toggle');
        if (identity.visible) button?.setAttribute('aria-describedby', 'agentIdentity'); else button?.removeAttribute('aria-describedby');
      }
    },
  });
  const recover = (id: AgentId, keyboard: boolean): void => {
    const w = windows.get(id), engine = context.engine(); if (!w || !engine) return;
    const v = engine.camera(), viewport = engine.viewport();
    engine.navigate({ kind: 'restore', camera: { x: viewport.x + viewport.width / 2 - w.x * v.zoom - WINDOW_WIDTH / 2, y: viewport.y + viewport.height / 2 - w.y * v.zoom - (w.collapsed ? COLLAPSED_HEIGHT : w.height) / 2, zoom: v.zoom }, motion: keyboard ? 'instant' : 'glide' });
    if (keyboard) w.element.querySelector<HTMLButtonElement>('.agent-window-toggle')?.focus({ preventScroll: true });
  };
  return {
    bind(agent, element, edge, reveal) {
      const saved = savedAgentWindow(agent.id);
      const w: WindowBinding = { agent, element, edge, reveal, x: saved?.x ?? 0, y: saved?.y ?? 0, height: COLLAPSED_HEIGHT, collapsed: saved?.collapsed ?? true, closed: saved?.closed ?? false, placed: !!saved, dirty: true, manuallyMoved: !!saved, screenX: 0, screenY: 0, offscreen: false };
      windows.set(agent.id, w);
      const observer = new ResizeObserver(() => { w.dirty = true; schedule.invalidate(); }); observer.observe(element); schedule.invalidate();
      return () => { observer.disconnect(); windows.delete(agent.id); schedule.invalidate(); };
    },
    collapsed(id, collapsed) { const w = windows.get(id); if (w) { w.collapsed = collapsed; w.dirty = true; save(id, w); schedule.invalidate(); } },
    closed(id, closed) { const w = windows.get(id); if (w) { w.closed = closed; w.dirty = true; save(id, w); schedule.invalidate(); } },
    drag(id, dx, dy, start, end) {
      const w = windows.get(id); if (!w) return;
      if (start) dragOrigins.set(id, { x: w.x, y: w.y });
      const origin = dragOrigins.get(id); if (!origin) return;
      w.x = origin.x + dx / camera.zoom; w.y = origin.y + dy / camera.zoom; w.placed = true;
      if (Math.hypot(dx, dy) >= 4) w.manuallyMoved = true;
      if (end) { dragOrigins.delete(id); w.dirty = true; save(id, w); }
      schedule.invalidate();
    },
    recover, show(id) { const w = windows.get(id); if (w) { w.closed = false; w.collapsed = false; w.dirty = true; w.reveal(); save(id, w); schedule.invalidate(); recover(id, true); } },
    near(id, ids) {
      const w = windows.get(id), target = context.workspace.scene.snapshot().cards.find(card => ids.includes(card.id));
      if (w && target && !w.manuallyMoved) { w.x = target.x - WINDOW_WIDTH / camera.zoom - 24; w.y = target.y; w.placed = true; w.dirty = true; schedule.invalidate(); }
    },
    bounds: () => [...windows.values()].filter(w => !w.closed).map(size),
    fitBounds: zoom => [...windows.values()].filter(w => !w.closed).map(w => ({ x: w.x, y: w.y, w: WINDOW_WIDTH / zoom, h: (w.collapsed ? COLLAPSED_HEIGHT : w.height) / zoom })),
    group: side => groups.find(group => group.side === side),
    cluster(side, button) { if (button) clusters.set(side, button); else clusters.delete(side); schedule.invalidate(); },
    frame(ids, islandHeight, instant) {
      const cards = context.workspace.scene.snapshot().cards.filter(card => ids.includes(card.id)).map(cardRect);
      if (!cards.length) return;
      const a = schedule.availableArea(), left = Math.min(...cards.map(card => card.x)), top = Math.min(...cards.map(card => card.y));
      const right = Math.max(...cards.map(card => card.x + card.w)), bottom = Math.max(...cards.map(card => card.y + card.h));
      const h = Math.max(80, a.h - islandHeight - 24);
      const zoom = Math.max(.05, Math.min(1, (a.w - 48) / Math.max(1, right - left), (h - 48) / Math.max(1, bottom - top)));
      context.engine()?.navigate({ kind: 'restore', camera: { x: a.x + a.w / 2 - (left + right) / 2 * zoom, y: a.y + h / 2 - (top + bottom) / 2 * zoom, zoom }, motion: instant ? 'instant' : 'glide' });
    },
    draft(agentId, element, index, width, height) { drafts.set(element, { agentId, index, width, height, x: 0, y: 0 }); schedule.invalidate(); return () => { drafts.delete(element); schedule.invalidate(); }; },
    identity(id, element) {
      if (identity) windows.get(identity.id)?.element.querySelector('.agent-window-toggle')?.removeAttribute('aria-describedby');
      identity = element ? { id, element, camera, positioned: false, visible: false, x: 0, y: 0 } : null;
      schedule.invalidate();
    },
    dispose() { offFrame(); offScene(); if (movingTimer) clearTimeout(movingTimer); windows.clear(); clusters.clear(); drafts.clear(); },
  };
}
