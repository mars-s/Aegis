import type { DragGuide } from './types.js';

export class DragGuides {
  private readonly element: SVGSVGElement;
  private previous: readonly DragGuide[] = [];
  constructor(world: HTMLElement) {
    this.element = world.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.element.setAttribute('class', 'drag-guides'); this.element.setAttribute('width', '1'); this.element.setAttribute('height', '1'); this.element.setAttribute('aria-hidden', 'true');
    this.element.style.position = 'absolute'; this.element.style.left = '0'; this.element.style.top = '0'; this.element.style.overflow = 'visible'; this.element.style.pointerEvents = 'none';
    world.append(this.element);
  }
  write(guides: readonly DragGuide[]): void {
    if (guides === this.previous) return;
    this.previous = guides;
    this.element.replaceChildren(...guides.map(guide => {
      const line = this.element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
      for (const [key, value] of Object.entries(guide)) line.setAttribute(key, String(value));
      line.setAttribute('stroke', '#3f8dfd'); line.setAttribute('stroke-width', '1'); line.setAttribute('vector-effect', 'non-scaling-stroke');
      return line;
    }));
  }
  dispose(): void { this.element.remove(); }
}
