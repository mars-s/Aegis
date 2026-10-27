import type { CardId } from '@aegis/domain/schema';
import { contains, intersects, union } from './geometry.js';
import type { CameraState, Point, Rect } from './geometry.js';
import type { SceneNode } from './graph.js';
import type { Representation } from './types.js';

interface Label { readonly node: SceneNode; readonly bounds: Rect; readonly label: Rect; readonly text: string }
interface Action { readonly source: HTMLButtonElement; readonly text: string; readonly label: string; readonly disabled: boolean }
const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n));
const nameOf = (node: SceneNode): string => (node.card.props?.layerName || node.card.heading || node.card.text.split('\n').find(Boolean) || node.card.kind || node.card.type).slice(0, 80);

/** Screen-space affordances share the engine's read and write phases. */
export class SceneOverlays {
  private readonly stage: HTMLElement;
  private readonly world: HTMLElement;
  private readonly layer: HTMLDivElement;
  private readonly aid: SVGSVGElement;
  private readonly outline: SVGRectElement;
  private readonly leader: SVGLineElement;
  private readonly more: HTMLButtonElement;
  private readonly strip: HTMLDivElement;
  private readonly labels = new Map<CardId, HTMLSpanElement>();
  private readonly abort = new AbortController();
  private edge = false;
  private near = false;
  private hovered: CardId | null = null;
  private hoveredWindow: CardId | null = null;
  private keyboard = false;
  private active = false;
  private layout: readonly Label[] = [];
  private omitted = 0;
  private chip: Rect = { x: 8, y: 8, width: 80, height: 44 };
  private viewport: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private origin: Point = { x: 0, y: 0 };
  private pointer: { readonly x: number; readonly y: number; readonly buttons: number; readonly target: EventTarget | null } | null = null;
  private actionId: CardId | null = null;
  private actions: readonly Action[] = [];
  private stripBox: Rect | null = null;
  private visible = false;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly invalidate: () => void;
  private readonly pick: (id: CardId, keyboard: boolean) => void;
  private nodes: ReadonlyMap<CardId, SceneNode> = new Map();

  constructor(stage: HTMLElement, world: HTMLElement, invalidate: () => void, pick: (id: CardId, keyboard: boolean) => void) {
    this.stage = stage; this.world = world; this.invalidate = invalidate; this.pick = pick;
    const doc = stage.ownerDocument, ns = 'http://www.w3.org/2000/svg';
    this.layer = doc.createElement('div'); this.layer.className = 'canvas-orientation'; this.layer.hidden = true;
    this.layer.setAttribute('role', 'group'); this.layer.setAttribute('aria-label', 'Window names');
    this.aid = doc.createElementNS(ns, 'svg'); this.aid.classList.add('orientation-aid'); this.aid.setAttribute('aria-hidden', 'true');
    this.outline = doc.createElementNS(ns, 'rect'); this.leader = doc.createElementNS(ns, 'line'); this.aid.append(this.outline, this.leader); this.layer.append(this.aid);
    this.more = doc.createElement('button'); this.more.type = 'button'; this.more.className = 'orientation-more'; this.more.hidden = true;
    this.more.setAttribute('aria-haspopup', 'menu'); this.more.setAttribute('aria-expanded', 'false'); this.layer.append(this.more);
    this.strip = doc.createElement('div'); this.strip.className = 'window-actions'; this.strip.hidden = true; this.strip.setAttribute('role', 'toolbar');
    stage.append(this.layer, this.strip);
    const signal = this.abort.signal, view = doc.defaultView;
    view?.addEventListener('pointermove', event => {
      this.pointer = { x: event.clientX, y: event.clientY, buttons: event.buttons, target: event.target };
      const point = { x: event.clientX - this.origin.x, y: event.clientY - this.origin.y };
      this.keyboard = false;
      const label = event.target instanceof Element ? event.target.closest('.canvas-orientation [data-card-id]') : null;
      this.hovered = [...this.labels].find(([, element]) => element === label)?.[0] ?? null;
      this.edge = !event.buttons && Math.min(point.x, point.y, this.viewport.width - point.x, this.viewport.height - point.y) < 48;
      this.near = !event.buttons && (this.layer.contains(event.target instanceof Node ? event.target : null) || this.layout.some(item => contains({ x: item.label.x - 24, y: item.label.y - 24, width: item.label.width + 48, height: item.label.height + 48 }, { ...point, width: 0, height: 0 })));
      const owner = event.target instanceof Node ? this.windowAt(event.target) : null;
      if (owner || this.strip.contains(event.target instanceof Node ? event.target : null)) {
        if (this.leaveTimer) { clearTimeout(this.leaveTimer); this.leaveTimer = null; }
        if (owner) this.hoveredWindow = owner;
      } else if (this.hoveredWindow && !this.leaveTimer) this.leaveTimer = setTimeout(() => { this.leaveTimer = null; this.hoveredWindow = null; invalidate(); }, 160);
      if (this.active || this.edge || this.near || this.hoveredWindow || !this.strip.hidden) invalidate();
    }, { passive: true, signal });
    view?.addEventListener('keydown', () => { this.keyboard = true; this.hovered = null; invalidate(); }, { capture: true, signal });
    view?.addEventListener('focusin', () => invalidate(), { signal });
    view?.addEventListener('blur', () => { this.pointer = null; this.edge = false; this.near = false; this.hovered = null; this.hoveredWindow = null; invalidate(); }, { signal });
    this.layer.addEventListener('pointerdown', event => event.stopPropagation(), { signal });
    this.layer.addEventListener('click', event => event.stopPropagation(), { signal });
    this.strip.addEventListener('pointerdown', event => event.stopPropagation(), { signal });
  }

  read(viewport: Rect, origin: Point, camera: CameraState, representations: readonly Representation[], nodes: ReadonlyMap<CardId, SceneNode>, selected: ReadonlySet<CardId>): void {
    this.viewport = viewport; this.origin = origin; this.nodes = nodes;
    if (this.pointer) {
      const pointer = this.pointer, point = { x: pointer.x - origin.x, y: pointer.y - origin.y };
      const within = point.x >= 0 && point.x <= viewport.width && point.y >= 0 && point.y <= viewport.height;
      this.edge = !pointer.buttons && within && Math.min(point.x, point.y, viewport.width - point.x, viewport.height - point.y) < 48;
      this.near = camera.zoom < .2 && !pointer.buttons && (this.layer.contains(pointer.target instanceof Node ? pointer.target : null) || this.layout.some(item => contains({ x: item.label.x - 24, y: item.label.y - 24, width: item.label.width + 48, height: item.label.height + 48 }, { ...point, width: 0, height: 0 })));
    }
    const doc = this.stage.ownerDocument, focus = doc.activeElement;
    this.active = camera.zoom < 0.2 && doc.hasFocus() && (this.edge || this.near || this.more.getAttribute('aria-expanded') === 'true' || this.layer.contains(focus) || focus === this.stage && this.keyboard);
    this.layout = []; this.omitted = 0;
    if (this.active) {
      const height = doc.defaultView?.matchMedia('(pointer: coarse)').matches ? 44 : 20;
      const candidates = representations.map(rep => ({ rep, node: nodes.get(rep.id) })).filter(item => item.node !== undefined).sort((a, b) => b.rep.bounds.width * b.rep.bounds.height - a.rep.bounds.width * a.rep.bounds.height);
      const labels: Label[] = [];
      for (const { rep, node } of candidates.slice(0, 30)) {
        if (!node) continue;
        const text = nameOf(node), width = Math.min(160, text.length * 6.5 + 8), x = clamp(rep.bounds.x, 8, viewport.width - 168);
        for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
          const y = clamp(rep.bounds.y - height - 8 + offset * height, 8, viewport.height - height - 4);
          const label = { x, y, width, height };
          if (!(y + height <= rep.bounds.y - 4 || y >= rep.bounds.y + rep.bounds.height + 4) || labels.some(item => intersects(label, item.label))) continue;
          labels.push({ node, bounds: rep.bounds, label, text }); break;
        }
      }
      this.layout = labels; this.omitted = representations.length - labels.length;
      if (this.omitted) {
        const bounds = union(labels.map(item => item.label)) ?? union(representations.map(rep => rep.bounds)) ?? viewport;
        const width = Math.max(80, `${this.omitted}`.length * 8 + 68), height = 44;
        const x = bounds.x + bounds.width + 12 + width <= viewport.width - 8 ? bounds.x + bounds.width + 12 : bounds.x - 12 - width >= 8 ? bounds.x - 12 - width : bounds.x;
        const y = x === bounds.x ? bounds.y + bounds.height + 12 : bounds.y + (bounds.height - height) / 2;
        this.chip = { x: clamp(x, 8, viewport.width - width - 8), y: clamp(y, 8, viewport.height - height - 8), width, height };
      }
    }
    const focusedCard = focus instanceof Node ? this.windowAt(focus) : null;
    const editorSource = this.world.querySelector('.editor-source');
    const editorId = editorSource instanceof HTMLElement ? [...nodes.keys()].find(id => id === editorSource.dataset.id) : null;
    const id = editorId || (this.strip.contains(focus) ? this.actionId : this.hoveredWindow || focusedCard || [...selected].at(-1));
    const rep = representations.find(item => item.id === id && item.kind === 'detail');
    const shell = id ? [...this.world.children].find(element => element instanceof HTMLElement && element.dataset.id === id) : null;
    this.actions = shell ? [...shell.querySelectorAll('button.win-open,button.deck-open,button.canvas-open')].filter(source => source instanceof HTMLButtonElement).map(source => ({ source, text: source.textContent?.trim() || 'Open', label: source.getAttribute('aria-label') || source.textContent?.trim() || 'Open', disabled: source.disabled })) : [];
    this.visible = !!rep && this.actions.length > 0 && !this.stage.classList.contains('connecting') && !this.stage.classList.contains('placing');
    this.actionId = id ?? null; this.stripBox = null;
    if (rep && this.visible) {
      const measured = this.strip.getBoundingClientRect();
      const width = measured.width || this.actions.reduce((total, action) => total + action.text.length * 7 + 28, 0), height = measured.height || 32;
      const r = rep.bounds;
      let x = clamp(camera.zoom < .9 && r.width < 180 ? r.x + r.width + 8 : r.x + r.width - width - 4, 8, viewport.width - width - 8);
      let y = clamp(camera.zoom < .9 ? r.y - height - 8 : r.y + 2, 48, viewport.height - height - 8);
      for (const cue of doc.querySelectorAll('.agent-edges .agent-edge:not([hidden])')) {
        const b = cue.getBoundingClientRect(), obstacle = { x: b.x - origin.x - 4, y: b.y - origin.y - 4, width: b.width + 8, height: b.height + 8 };
        if (!intersects({ x, y, width, height }, obstacle)) continue;
        if (obstacle.y > 100 && obstacle.y + obstacle.height < viewport.height - 100) x = obstacle.x < viewport.width / 2 ? obstacle.x + obstacle.width : obstacle.x - width;
        else y = obstacle.y < viewport.height / 2 ? obstacle.y + obstacle.height : obstacle.y - height;
      }
      this.stripBox = { x: clamp(x, 8, viewport.width - width - 8), y: clamp(y, 48, viewport.height - height - 8), width, height };
    }
  }

  write(): void {
    this.layer.hidden = !this.active;
    if (!this.active) { this.aid.style.display = 'none'; delete this.aid.dataset.cardId; this.more.hidden = true; }
    const ids = new Set(this.active ? this.layout.map(item => item.node.card.id) : []);
    for (const [id, label] of this.labels) if (!ids.has(id)) { label.remove(); this.labels.delete(id); }
    if (this.active) {
      for (const item of this.layout) {
        const id = item.node.card.id;
        let label = this.labels.get(id);
        if (!label) {
          label = this.stage.ownerDocument.createElement('span'); label.dataset.cardId = id; label.tabIndex = 0;
          label.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.pick(id, true); } }, { signal: this.abort.signal });
          label.addEventListener('dblclick', () => this.pick(id, false), { signal: this.abort.signal });
          label.addEventListener('click', () => label?.focus({ preventScroll: true }), { signal: this.abort.signal });
          this.labels.set(id, label); this.layer.insertBefore(label, this.more);
        }
        if (label.textContent !== item.text) label.textContent = item.text;
        Object.assign(label.style, { left: `${item.label.x}px`, top: `${item.label.y}px`, width: `${item.label.width}px`, height: `${item.label.height}px` });
      }
      this.more.hidden = this.omitted === 0;
      const text = `+${this.omitted} more`;
      if (this.more.textContent !== text) this.more.textContent = text;
      this.more.setAttribute('aria-label', `Show ${this.omitted} more windows`);
      Object.assign(this.more.style, { left: `${this.chip.x}px`, top: `${this.chip.y}px`, width: `${this.chip.width}px`, height: `${this.chip.height}px` });
      const focused = this.stage.ownerDocument.activeElement;
      const focusId = [...this.labels].find(([, label]) => label === focused)?.[0];
      const item = this.layout.find(item => item.node.card.id === (this.keyboard ? focusId : this.hovered ?? focusId));
      this.aid.style.display = item ? '' : 'none';
      if (item) {
        this.aid.dataset.cardId = item.node.card.id;
        for (const [key, value] of Object.entries({ x: item.bounds.x, y: item.bounds.y, width: item.bounds.width, height: item.bounds.height })) this.outline.setAttribute(key, String(value));
        const x = clamp(item.bounds.x + item.bounds.width / 2, item.label.x, item.label.x + item.label.width), y = clamp(item.bounds.y + item.bounds.height / 2, item.label.y, item.label.y + item.label.height);
        for (const [key, value] of Object.entries({ x1: x, y1: y, x2: clamp(x, item.bounds.x, item.bounds.x + item.bounds.width), y2: clamp(y, item.bounds.y, item.bounds.y + item.bounds.height) })) this.leader.setAttribute(key, String(value));
      } else delete this.aid.dataset.cardId;
    }
    this.strip.hidden = !this.visible;
    if (this.stripBox && this.visible) {
      const old = [...this.strip.children];
      const stable = old.length === this.actions.length && old.every(button => button instanceof HTMLButtonElement && button.dataset.windowAction === this.actionId);
      if (!stable) {
        this.strip.replaceChildren(...this.actions.map((action, index) => {
          const button = this.stage.ownerDocument.createElement('button'); button.type = 'button'; button.dataset.windowAction = this.actionId ?? ''; button.textContent = action.text;
          button.addEventListener('click', () => this.actions[index]?.source.click(), { signal: this.abort.signal });
          return button;
        }));
        this.invalidate();
      }
      for (const [index, button] of [...this.strip.children].entries()) {
        const action = this.actions[index];
        if (button instanceof HTMLButtonElement && action) {
          if (button.textContent !== action.text) button.textContent = action.text;
          button.disabled = action.disabled; button.setAttribute('aria-label', action.label);
        }
      }
      this.strip.setAttribute('aria-label', 'Window actions');
      this.strip.style.left = `${this.stripBox.x}px`; this.strip.style.top = `${this.stripBox.y}px`;
    }
  }

  private windowAt(target: Node): CardId | null {
    const shell = target instanceof Element ? target.closest('.scene-card') : null;
    if (!(shell instanceof HTMLElement)) return null;
    // The shell's id was assigned from a canonical scene node, never from event payloads.
    for (const id of this.nodes.keys()) if (id === shell.dataset.id) return id;
    return null;
  }
  dispose(): void { this.abort.abort(); if (this.leaveTimer) clearTimeout(this.leaveTimer); this.layer.remove(); this.strip.remove(); this.labels.clear(); }
}
