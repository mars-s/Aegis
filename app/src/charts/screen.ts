import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { CanvasEngine } from '@aegis/scene';

function paint(root: HTMLElement, scale: number): void {
  const label = Math.round(Math.max(12, 12 / scale) * 2) / 2;
  const radius = Math.round(2.5 / scale * 100) / 100;
  root.style.setProperty('--chart-label-size', `${label}px`);
  root.querySelectorAll('.cartesian .dot, .radar .dot').forEach(dot => dot.setAttribute('r', String(radius)));
}
interface ScreenGroup {
  readonly roots: Set<HTMLElement>;
  readonly observer: MutationObserver;
}
const groups = new WeakMap<CanvasEngine, ScreenGroup>();

// One observer per scene, no extra frame loop or layout reads. A steady pan
// reads the camera once and does no chart DOM work or React publication.
export function useChartScreen(ref: RefObject<HTMLElement | null>, engine: CanvasEngine): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const world = root.closest('#world');
    let group = groups.get(engine);
    if (world && !group) {
      const roots = new Set<HTMLElement>();
      let previous = engine.camera().zoom;
      const observer = new MutationObserver(() => {
        const scale = engine.camera().zoom;
        if (scale === previous) return;
        previous = scale;
        for (const root of roots) paint(root, scale);
      });
      observer.observe(world, { attributes: true, attributeFilter: ['style'] });
      group = { roots, observer };
      groups.set(engine, group);
    }
    if (world) group?.roots.add(root);
    const refresh = () => paint(root, world ? engine.camera().zoom : 1);
    refresh();
    const content = new MutationObserver(refresh);
    content.observe(root, { childList: true, subtree: true });
    return () => {
      content.disconnect();
      if (!world || !group) return;
      group.roots.delete(root);
      if (!group.roots.size) { group.observer.disconnect(); groups.delete(engine); }
    };
  });
}
