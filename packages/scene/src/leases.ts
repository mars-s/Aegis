import type { CardId } from '@aegis/domain/schema';
import type { SceneNode } from './graph.js';
import type { PinReason, SlotLease } from './types.js';

interface Shell {
  readonly element: HTMLElement;
  readonly host: HTMLElement;
  generation: number;
  residency: { readonly kind: 'free' } | { readonly kind: 'bound' | 'releasing'; readonly lease: SlotLease };
  lastSeen: number;
  geometry: string;
  readonly pins: Set<PinReason>;
}
export interface LeasePlacement { readonly node: SceneNode; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rotation: number; readonly selected: boolean }

/** Every live host remains under its original, connected shell and world. */
export class LeasePool {
  private readonly shells: Shell[] = [];
  private readonly byCard = new Map<CardId, Shell>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly SlotLease[] = [];
  private posted = false;
  private disposed = false;
  private serial = 0;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private queued = 0;
  private boardId: string;
  private readonly world: HTMLElement;
  private readonly capacity: number;
  private readonly invalidate: () => void;

  constructor(world: HTMLElement, boardId: string, capacity: number, invalidate: () => void) {
    this.world = world; this.boardId = boardId; this.capacity = capacity; this.invalidate = invalidate;
  }

  readonly source = {
    getSnapshot: (): readonly SlotLease[] => this.snapshot,
    subscribe: (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); },
    acknowledgeUnmount: (key: string, generation: number): void => {
      const shell = this.shells.find(candidate => candidate.residency.kind === 'releasing' && candidate.residency.lease.key === key && candidate.residency.lease.generation === generation);
      if (!shell) return;
      shell.residency = { kind: 'free' }; shell.generation++; shell.geometry = '';
      if (this.disposed) { shell.element.remove(); this.finishDisposal(); }
      else this.invalidate();
    },
  };

  reconcile(placements: readonly LeasePlacement[], now: number): void {
    if (this.disposed) return;
    if (this.expiry) { clearTimeout(this.expiry); this.expiry = null; }
    const visible = new Set(placements.map(placement => placement.node.card.id));
    const selected = new Set(placements.filter(placement => placement.selected).map(placement => placement.node.card.id));
    const pinnedOutside = [...this.byCard].filter(([id, shell]) => !visible.has(id) && shell.pins.size > 0).length;
    const capacity = Math.max(this.capacity, visible.size) + pinnedOutside;
    let expiresAt = Infinity;
    for (const [id, shell] of this.byCard) {
      if (visible.has(id)) continue;
      if (shell.pins.size) continue;
      shell.element.hidden = true; shell.element.inert = true;
      if (now - shell.lastSeen >= 2000) this.release(shell);
      else expiresAt = Math.min(expiresAt, shell.lastSeen + 2000);
    }
    this.queued = 0;
    let admitted = 0;
    for (const placement of placements) {
      let shell = this.byCard.get(placement.node.card.id);
      if (!shell) {
        // Bound recency entries can be evicted, but never reused before cleanup.
        if (this.byCard.size >= capacity) {
          const oldest = [...this.byCard.values()].filter(candidate => !candidate.pins.size && candidate.residency.kind === 'bound' && (!visible.has(candidate.residency.lease.cardId) || placement.selected && !selected.has(candidate.residency.lease.cardId))).sort((a, b) => a.lastSeen - b.lastSeen)[0];
          if (oldest) this.release(oldest);
        }
        if (this.byCard.size >= capacity) { this.queued++; continue; }
        if (admitted >= 2) { this.queued++; continue; }
        shell = this.bind(placement.node.card.id);
        admitted++;
      }
      shell.lastSeen = now;
      this.place(shell, placement);
    }
    if (Number.isFinite(expiresAt)) this.expiry = setTimeout(() => { this.expiry = null; this.invalidate(); }, Math.max(1, expiresAt - now));
    if (this.queued && this.byCard.size < capacity) setTimeout(this.invalidate, 0);
  }

  pin(id: CardId, reason: PinReason, pinned: boolean): void {
    const shell = this.byCard.get(id);
    if (!shell) return;
    if (pinned) shell.pins.add(reason); else shell.pins.delete(reason);
  }

  has(id: CardId): boolean { return this.byCard.has(id); }
  isPinned(id: CardId): boolean { return (this.byCard.get(id)?.pins.size ?? 0) > 0; }
  retire(id: CardId): void { const shell = this.byCard.get(id); if (shell) { shell.pins.clear(); this.release(shell); } }
  cardAt(target: Node): CardId | null {
    for (const [id, shell] of this.byCard) if (shell.element.contains(target)) return id;
    return null;
  }
  find(key: string, generation: number): SlotLease | null {
    for (const shell of this.byCard.values()) if (shell.residency.kind === 'bound' && shell.residency.lease.key === key && shell.residency.lease.generation === generation) return shell.residency.lease;
    return null;
  }
  stats(): { readonly active: number; readonly pinned: number; readonly releasing: number; readonly queued: number } {
    let pinned = 0, releasing = 0;
    for (const shell of this.shells) { if (shell.pins.size) pinned++; if (shell.residency.kind === 'releasing') releasing++; }
    return { active: this.byCard.size, pinned, releasing, queued: this.queued };
  }

  reset(boardId: string): void {
    this.boardId = boardId;
    for (const shell of this.byCard.values()) { shell.pins.clear(); this.release(shell); }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.expiry) clearTimeout(this.expiry);
    for (const shell of this.byCard.values()) { shell.pins.clear(); this.release(shell); }
    for (const shell of this.shells) if (shell.residency.kind === 'free') shell.element.remove();
    this.publish(); this.finishDisposal();
  }

  private bind(id: CardId): Shell {
    let shell = this.shells.find(candidate => candidate.residency.kind === 'free');
    if (!shell) {
      const element = this.world.ownerDocument.createElement('div'), host = this.world.ownerDocument.createElement('div');
      element.className = 'card scene-card'; host.className = 'content scene-body';
      element.style.position = 'absolute'; element.style.transformOrigin = 'center';
      host.style.height = '100%'; element.append(host); this.world.append(element);
      shell = { element, host, generation: 0, residency: { kind: 'free' }, lastSeen: 0, geometry: '', pins: new Set() };
      this.shells.push(shell);
    }
    const lease: SlotLease = { key: `${this.boardId}:${id}:${this.serial++}`, cardId: id, generation: shell.generation, host: shell.host };
    shell.residency = { kind: 'bound', lease }; this.byCard.set(id, shell); this.postPublish();
    return shell;
  }

  private release(shell: Shell): void {
    if (shell.residency.kind !== 'bound') return;
    const lease = shell.residency.lease;
    this.byCard.delete(lease.cardId); shell.residency = { kind: 'releasing', lease };
    shell.element.hidden = true; shell.element.inert = true;
    this.postPublish();
  }

  private place(shell: Shell, placement: LeasePlacement): void {
    const { node, x, y, width, height, rotation, selected } = placement;
    const geometry = `${x},${y},${width},${height},${rotation},${node.rank}`;
    if (shell.geometry !== geometry) {
      shell.element.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
      shell.element.style.width = `${width}px`; shell.element.style.height = `${height}px`; shell.element.style.zIndex = `${node.rank}`;
      shell.geometry = geometry;
    }
    shell.element.dataset.id = node.card.id; shell.element.dataset.type = node.card.type;
    shell.element.classList.toggle('selected', selected); shell.element.classList.toggle('locked', node.locked);
    shell.element.classList.toggle('note', node.card.type === 'note'); shell.element.classList.toggle('title', node.card.type === 'title');
    shell.element.hidden = false; shell.element.inert = false;
  }

  private postPublish(): void {
    if (this.posted) return;
    this.posted = true;
    setTimeout(() => { this.posted = false; this.publish(); }, 0);
  }

  private publish(): void {
    const next = [...this.byCard.values()].flatMap(shell => shell.residency.kind === 'bound' ? [shell.residency.lease] : []);
    if (next.length === this.snapshot.length && next.every((lease, index) => lease === this.snapshot[index])) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private finishDisposal(): void {
    if (this.disposed && this.shells.every(shell => shell.residency.kind === 'free')) { this.shells.length = 0; this.listeners.clear(); }
  }
}
