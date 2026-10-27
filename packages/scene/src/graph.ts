import RBush from 'rbush';
import type { Board, Card, CardId, Link, LinkId } from '@aegis/domain/schema';
import { fromBounds, rotatedBounds } from './geometry.js';
import type { Bounds, Rect } from './geometry.js';
import { linkBounds, routeLink } from './links.js';
import type { LinkRoute } from './links.js';
import type { LayoutItem } from './representations.js';
import type { SceneChange } from './types.js';

export interface SceneNode {
  card: Card;
  rank: number;
  hidden: boolean;
  locked: boolean;
  readonly layout: LayoutItem<CardId>;
  readonly rotation: number;
  readonly bounds: Bounds;
  readonly text: string;
}
interface CardEntry extends Bounds { readonly node: SceneNode }
export interface SceneLink extends Bounds { readonly link: Link; readonly route: LinkRoute }

const rect = (card: Card): Rect => ({ x: card.x, y: card.y, width: card.w, height: card.h });
const summarised = (card: Card): boolean => !['title', 'frame', 'coll', 'template-group', 'draw-ink', 'draw-shape'].includes(card.type);
const label = (card: Card): string => (card.heading || card.text || (card.type === 'object' ? card.kind : card.type)).replace(/\s+/g, ' ').slice(0, 160);

/** Canonical deltas update these indexes. Camera frames only query them. */
export class SceneGraph {
  readonly nodes = new Map<CardId, SceneNode>();
  readonly links = new Map<LinkId, SceneLink>();
  readonly children = new Map<CardId, Set<CardId>>();
  private readonly parents = new Map<CardId, Set<CardId>>();
  readonly incident = new Map<CardId, Set<LinkId>>();
  private readonly cards = new RBush<CardEntry>();
  private readonly wires = new RBush<SceneLink>();
  private readonly entries = new Map<CardId, CardEntry>();

  constructor(board: Board) { this.replace(board); }

  replace(board: Board): void {
    this.clear();
    for (const [rank, card] of board.cards.entries()) this.put(card, rank);
    this.refreshFlags();
    this.cards.load([...this.entries.values()]);
    for (const link of board.links) this.putLink(link);
    this.wires.load([...this.links.values()]);
  }

  apply(change: SceneChange): void {
    const dirtyLinks = new Set<LinkId>();
    for (const id of [...change.removed, ...change.upserted.map(card => card.id)]) {
      for (const link of this.incident.get(id) ?? []) dirtyLinks.add(link);
      const entry = this.entries.get(id);
      if (entry) this.cards.remove(entry);
      this.entries.delete(id);
      const node = this.nodes.get(id);
      if (node?.card.parent) this.children.get(node.card.parent)?.delete(id);
      if (change.removed.includes(id)) this.nodes.delete(id);
    }
    for (const card of change.upserted) {
      const rank = this.nodes.get(card.id)?.rank ?? this.nodes.size;
      this.put(card, rank);
      const entry = this.entries.get(card.id);
      if (entry) this.cards.insert(entry);
    }
    if (change.order) for (const [rank, id] of change.order.entries()) { const node = this.nodes.get(id); if (node) node.rank = rank; }
    this.refreshFlags();
    if (change.links) {
      this.links.clear(); this.incident.clear(); this.wires.clear();
      for (const link of change.links) this.putLink(link);
      this.wires.load([...this.links.values()]);
    } else for (const id of dirtyLinks) {
      const old = this.links.get(id);
      if (old) { this.removeLink(id); this.putLink(old.link); const next = this.links.get(id); if (next) this.wires.insert(next); }
    }
  }

  query(bounds: Bounds): SceneNode[] { return this.cards.search(bounds).map(entry => entry.node).filter(node => !node.hidden).sort((a, b) => a.rank - b.rank); }
  queryLinks(bounds: Bounds): SceneLink[] { return this.wires.search(bounds).filter(entry => !this.nodes.get(entry.link.a)?.hidden && !this.nodes.get(entry.link.b)?.hidden); }
  all(): SceneNode[] { return [...this.nodes.values()].filter(node => !node.hidden).sort((a, b) => a.rank - b.rank); }
  bounds(ids: readonly CardId[]): Rect[] { const selected = new Set(ids); return this.all().filter(node => !ids.length || selected.has(node.card.id)).map(node => fromBounds(node.bounds)); }
  clear(): void { this.nodes.clear(); this.links.clear(); this.children.clear(); this.parents.clear(); this.incident.clear(); this.entries.clear(); this.cards.clear(); this.wires.clear(); }

  private put(card: Card, rank: number): void {
    const rotation = card.rot ?? 0, bounds = rotatedBounds(rect(card), rotation);
    const node: SceneNode = { card, rank, bounds, rotation, hidden: false, locked: false, text: label(card), layout: { id: card.id, bounds: rect(card), summarised: summarised(card), kind: card.type === 'object' ? card.kind : card.type } };
    this.nodes.set(card.id, node); this.entries.set(card.id, { ...bounds, node });
    if (card.parent) { const children = this.children.get(card.parent); if (children) children.add(card.id); else this.children.set(card.parent, new Set([card.id])); }
  }

  private refreshFlags(): void {
    this.parents.clear(); this.children.clear();
    const add = (child: CardId, parent: CardId): void => {
      const parents = this.parents.get(child); if (parents) parents.add(parent); else this.parents.set(child, new Set([parent]));
      const children = this.children.get(parent); if (children) children.add(child); else this.children.set(parent, new Set([child]));
    };
    for (const node of this.nodes.values()) {
      if (node.card.parent) add(node.card.id, node.card.parent);
      for (const child of node.card.props?.kids ?? []) add(child, node.card.id);
    }
    const resolve = (node: SceneNode, flag: 'hidden' | 'locked', seen: Set<CardId>): boolean => {
      if (seen.has(node.card.id)) return false;
      seen.add(node.card.id);
      if (node.card.props?.[flag]) return true;
      for (const id of this.parents.get(node.card.id) ?? []) { const parent = this.nodes.get(id); if (parent && resolve(parent, flag, seen)) return true; }
      return false;
    };
    for (const node of this.nodes.values()) { node.hidden = resolve(node, 'hidden', new Set()); node.locked = resolve(node, 'locked', new Set()); }
  }

  private putLink(link: Link): void {
    const a = this.nodes.get(link.a), b = this.nodes.get(link.b);
    if (!a || !b) return;
    const route = routeLink(link, a.layout.bounds, b.layout.bounds, a.rotation, b.rotation);
    const entry = { ...linkBounds(route, link.label ?? ''), link, route };
    this.links.set(link.id, entry);
    for (const id of [link.a, link.b]) { const links = this.incident.get(id); if (links) links.add(link.id); else this.incident.set(id, new Set([link.id])); }
  }

  private removeLink(id: LinkId): void {
    const entry = this.links.get(id);
    if (!entry) return;
    this.wires.remove(entry); this.links.delete(id);
    for (const cardId of [entry.link.a, entry.link.b]) {
      const links = this.incident.get(cardId); links?.delete(id);
      if (!links?.size) this.incident.delete(cardId);
    }
  }
}
