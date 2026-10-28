import type { CardId } from '@aegis/domain/schema';
import type { Point } from './geometry.js';
import type { SceneNode } from './graph.js';
import type { AgentLineStyle } from './types.js';

// The line touches each window's top edge, so only the edge's position matters. A height that
// settles after the content is measured keeps the line; a move by a person removes it.
const geometry = (node: SceneNode): string => `${node.card.x},${node.card.y},${node.card.w},${node.rotation}`;

/** A bounded, transient cue. The world transform carries it through camera frames. */
export class AgentLine {
  private readonly element: SVGSVGElement;
  private readonly targets = new Map<CardId, string>();
  private readonly animations = new Map<SVGPathElement, Animation>();
  private expiry: ReturnType<typeof setTimeout> | null = null;

  constructor(world: HTMLElement) {
    this.element = world.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.element.setAttribute('class', 'agent-line');
    this.element.setAttribute('width', '1'); this.element.setAttribute('height', '1');
    this.element.setAttribute('aria-hidden', 'true');
    this.element.style.position = 'absolute'; this.element.style.left = '0'; this.element.style.top = '0'; this.element.style.pointerEvents = 'none'; this.element.style.overflow = 'visible'; this.element.style.zIndex = '-1';
    this.element.style.setProperty('--agent-colour', 'rgb(63 141 253)');
    world.append(this.element);
  }

  ring(nodes: readonly SceneNode[], ms: number, label: string, origin: Point | undefined, style: AgentLineStyle, reduced: boolean): void {
    this.clear();
    const cards = nodes.filter(node => !node.hidden).slice(0, 12).sort((a, b) => a.card.x - b.card.x);
    const first = cards[0];
    if (!first) return;
    for (const node of cards) this.targets.set(node.card.id, geometry(node));
    this.element.dataset.lineStyle = style;
    const top = Math.min(...cards.map(node => node.card.y)) - 56, start = first.card.x + 10;
    const stations = cards.map(node => Math.min(node.card.x + node.card.w / 2, node.card.x + 180));
    const add = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Readonly<Record<string, string | number>>): SVGElementTagNameMap[K] => {
      const element = this.element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
      this.element.append(element); return element;
    };
    const path = (d: string, length: number, className = ''): void => {
      const element = add('path', { d, class: className, fill: 'none', stroke: '#3f8dfd', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' });
      element.style.strokeLinecap = 'round';
      element.style.strokeDasharray = style === 'dashed' ? '6 4' : style === 'dotted' ? '1.5 4' : 'none';
      if (reduced) return;
      const delay = this.animations.size ? 360 + this.animations.size * 60 : 0;
      if (style === 'solid') element.style.strokeDasharray = String(length);
      const animation = element.animate(style === 'solid' ? [{ strokeDashoffset: length }, { strokeDashoffset: 0 }] : [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: style === 'solid' ? delay : 0, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' });
      this.animations.set(element, animation);
      animation.onfinish = () => { if (this.animations.get(element) !== animation) return; this.animations.delete(element); if (style === 'solid') element.style.strokeDasharray = 'none'; animation.cancel(); };
    };
    add('circle', { class: 'origin', cx: origin?.x ?? start, cy: origin?.y ?? top - 24, r: 3.5, fill: '#3f8dfd' });
    if (origin) path(`M${origin.x} ${origin.y}V${top - 24}H${start}`, Math.abs(origin.y - top + 24) + Math.abs(origin.x - start));
    const title = add('text', { x: start + 10, y: top - 20, fill: '#c3c8d0', stroke: '#000', 'stroke-width': 5, 'stroke-linejoin': 'round', 'paint-order': 'stroke' });
    title.style.font = '12px var(--font, Inter, sans-serif)'; title.textContent = label;
    path(`M${start} ${top - 24}V${top - 12}L${start + 12} ${top}H${Math.max(...stations)}`, 12 + Math.hypot(12, 12) + Math.abs(Math.max(...stations) - start - 12), 'trunk');
    cards.forEach((node, index) => {
      const x = stations[index]; if (x === undefined) return;
      path(`M${x} ${top}V${node.card.y}`, Math.abs(node.card.y - top), 'drop');
      add('circle', { class: 'station', cx: x, cy: node.card.y, r: 4.5, fill: '#fff', stroke: '#3f8dfd', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' });
    });
    this.expiry = setTimeout(() => { this.expiry = null; this.element.classList.add('spent'); }, Math.max(0, ms));
  }

  reconcile(nodes: ReadonlyMap<CardId, SceneNode>): void {
    for (const [id, before] of this.targets) {
      const node = nodes.get(id);
      if (!node || node.hidden || geometry(node) !== before) { this.clear(); return; }
    }
  }

  settle(): void {
    for (const [path, animation] of this.animations) { if (this.element.dataset.lineStyle === 'solid') path.style.strokeDasharray = 'none'; animation.cancel(); }
    this.animations.clear();
  }

  clear(): void {
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null; this.targets.clear(); this.settle(); this.element.replaceChildren(); this.element.classList.remove('spent');
  }

  dispose(): void { this.clear(); this.element.remove(); }
}
