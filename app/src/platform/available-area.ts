import type { CanvasEngine, Rect } from '@aegis/scene';
import { createSource } from '../workspace/source.js';

/** Layout observers invalidate cached insets. Only the scene read phase measures them. */
export function createAvailableArea() {
  const source = createSource<Rect>({ x: 0, y: 48, width: innerWidth, height: Math.max(1, innerHeight - 72) });
  let invalidate: (() => void) | null = null;
  const attach = (engine: CanvasEngine): (() => void) => {
    let dirty = true;
    let dockX = NaN, dockWidth = NaN;
    const observed = new Set<Element>();
    invalidate = () => { dirty = true; engine.invalidate(); };
    const resized = new ResizeObserver(() => invalidate?.());
    const layoutTargets = '#stage, #side, #sideRight, .side-editor, #agentIsland';
    const changed = new MutationObserver(records => {
      for (const record of records) for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (node instanceof Element && (node.matches(layoutTargets) || node.querySelector(layoutTargets))) {
          invalidate?.(); return;
        }
      }
    });
    changed.observe(document.body, { subtree: true, childList: true });
    const release = engine.registerFrameParticipant({
      read() {
        if (!dirty) return;
        dirty = false;
        const viewport = engine.viewport();
        let left = 0, right = viewport.width, bottom = viewport.height - 24;
        const elements = document.querySelectorAll<HTMLElement>(layoutTargets);
        for (const element of elements) {
          if (!observed.has(element)) { observed.add(element); resized.observe(element); }
          if (element.hidden || element.id === 'stage') continue;
          if ((element.id === 'side' || element.id === 'sideRight') && !element.classList.contains('open')) continue;
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          if (element.id === 'agentIsland') bottom = Math.min(bottom, rect.top - 20);
          else if (element.id === 'side') left = Math.max(left, rect.right + 16);
          else right = Math.min(right, rect.left - 16);
        }
        for (const element of observed) if (!element.isConnected) { resized.unobserve(element); observed.delete(element); }
        const next = { x: left, y: 68, width: Math.max(1, right - left), height: Math.max(1, bottom - 68) };
        const previous = source.getSnapshot();
        if (next.x !== previous.x || next.y !== previous.y || next.width !== previous.width || next.height !== previous.height) source.set(next);
      },
      write() {
        // The island rides the window's centre, never the free-area centre: opening a panel must not slide it.
        const area = source.getSnapshot(), x = engine.viewport().width / 2;
        const half = Math.min(x - area.x, area.x + area.width - x);
        const width = Math.max(280, Math.min(area.width - 24, half * 2 - 24));
        if (x !== dockX) { document.documentElement.style.setProperty('--dock-x', `${x}px`); dockX = x; }
        if (width !== dockWidth) { document.documentElement.style.setProperty('--composer-max-width', `${width}px`); dockWidth = width; }
      },
    });
    const transition = (event: TransitionEvent): void => { if (event.target instanceof Element && event.target.matches('#side, #sideRight, .side-editor, #agentIsland')) invalidate?.(); };
    document.addEventListener('transitionend', transition, true);
    engine.invalidate();
    return () => { release(); resized.disconnect(); changed.disconnect(); document.removeEventListener('transitionend', transition, true); observed.clear(); invalidate = null; };
  };
  return { source, attach, invalidate: () => invalidate?.() };
}
