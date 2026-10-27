import type { Card, CardId } from '@aegis/domain/schema';
import type { Rect } from './geometry.js';
import type { SceneNode } from './graph.js';
import type { LeasePool } from './leases.js';
import type { SceneChange } from './types.js';

const geometry = (card: Card): string => `${card.x},${card.y},${card.w},${card.h},${card.rot ?? 0}`;
interface Presentation { readonly transform: string; readonly opacity: string }
interface Pending {
  readonly id: CardId;
  readonly before: Card | null;
  readonly after: Card | null;
  readonly exit: HTMLElement | null;
  readonly index: number;
  presentation: Presentation | null;
}
interface Running { readonly animation: Animation; readonly element: HTMLElement; readonly exit: boolean }

/** Only authored agent batches animate. Camera motion remains the world's transform. */
export class AgentMotion {
  private readonly pending = new Map<CardId, Pending>();
  private readonly running = new Map<CardId, Running>();
  private readonly world: HTMLElement;
  private readonly pool: LeasePool;
  private readonly view: Window;

  constructor(world: HTMLElement, pool: LeasePool, view: Window) { this.world = world; this.pool = pool; this.view = view; }

  prepare(change: SceneChange, nodes: ReadonlyMap<CardId, SceneNode>, visible: (card: Card) => boolean, reduced: boolean): void {
    if (change.origin !== 'agent' || reduced) {
      for (const card of change.upserted) {
        const before = nodes.get(card.id)?.card;
        if (!before || geometry(before) !== geometry(card)) this.cancel(card.id);
      }
      for (const id of change.removed) this.cancel(id);
      return;
    }
    let index = 0;
    for (const id of [...change.upserted.map(card => card.id), ...change.removed]) {
      const before = nodes.get(id)?.card ?? null, after = change.upserted.find(card => card.id === id) ?? null;
      if (before && after && geometry(before) === geometry(after)) continue;
      const element = this.pool.element(id);
      if (!element && (!after || !visible(after))) continue;
      if (index >= 12) { this.cancel(id); continue; }
      const snapshot = !after && element ? element.cloneNode(true) : null;
      const exit = snapshot instanceof HTMLElement ? snapshot : null;
      if (exit) {
        exit.classList.remove('selected', 'glow', 'editor-source', 'in-context');
        exit.removeAttribute('data-id'); exit.removeAttribute('data-type'); exit.removeAttribute('data-kind');
        exit.setAttribute('aria-hidden', 'true'); exit.inert = true; exit.style.pointerEvents = 'none';
        for (const frame of exit.querySelectorAll('iframe')) frame.remove();
        for (const descendant of exit.querySelectorAll('[id]')) descendant.removeAttribute('id');
      }
      this.pending.set(id, { id, before, after, exit, index: index++, presentation: null });
    }
  }

  read(): void {
    for (const entry of this.pending.values()) {
      const element = this.pool.element(entry.id) ?? this.running.get(entry.id)?.element;
      if (element) { const style = this.view.getComputedStyle(element); entry.presentation = { transform: style.transform, opacity: style.opacity }; }
    }
  }

  write(): void {
    for (const [id, entry] of this.pending) {
      const element = entry.exit ?? this.pool.element(id);
      if (!element) continue;
      const target = element.style.transform;
      const before = entry.presentation;
      const frames = entry.exit ? [{ transform: before?.transform ?? target, opacity: before?.opacity ?? '1' }, { transform: before?.transform ?? target, opacity: 0 }]
        : entry.before ? [{ transform: before?.transform ?? target, opacity: before?.opacity ?? '1' }, { transform: target, opacity: 1 }]
        : [{ transform: `${target} scale(0.96)`, opacity: 0 }, { transform: target, opacity: 1 }];
      this.cancel(id);
      if (entry.exit) this.world.append(element);
      const animation = element.animate(frames, { duration: entry.exit ? 180 : entry.before ? 320 : 240, delay: entry.index * 30, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' });
      animation.id = 'aegis-agent-card';
      this.running.set(id, { animation, element, exit: entry.exit !== null });
      animation.onfinish = () => { if (this.running.get(id)?.animation === animation) this.cancel(id); };
    }
  }

  takeover(id: CardId, bounds: Rect): Rect {
    const element = this.running.get(id)?.element;
    if (!element) { this.pending.delete(id); return bounds; }
    const matrix = new DOMMatrixReadOnly(this.view.getComputedStyle(element).transform);
    this.cancel(id);
    return { ...bounds, x: matrix.e, y: matrix.f };
  }

  cancel(id: CardId): void {
    this.pending.delete(id);
    const running = this.running.get(id);
    if (running) { this.running.delete(id); running.animation.cancel(); if (running.exit) running.element.remove(); }
  }

  settle(): void { for (const id of new Set([...this.pending.keys(), ...this.running.keys()])) this.cancel(id); }
}
