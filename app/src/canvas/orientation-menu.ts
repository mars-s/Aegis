import type { CanvasEngine } from '@aegis/scene';
import type { Card } from '@aegis/domain';
import { createMenu } from '../lib/ui/menu.js';
import { mountDropdowns } from '../lib/ui/dropdown.js';

/** Reuse the app's shared menu, rather than introducing another menu implementation. */
export function bindOrientationMenu(stage: HTMLElement, engine: CanvasEngine, cards: () => readonly Card[], cameraChanged: () => void): () => void {
  mountDropdowns();
  const abort = new AbortController();
  let menu: ReturnType<typeof createMenu> | null = null;
  const changed = new MutationObserver(() => {
    if (stage.querySelector('.canvas-orientation')?.hasAttribute('hidden')) menu?.close(false, true);
  });
  changed.observe(stage, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
  function show(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('.orientation-more');
    if (!(trigger instanceof HTMLButtonElement) || trigger.hidden) return;
    if (event instanceof KeyboardEvent && !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!menu) {
      menu = createMenu({ trigger, bindTrigger: false, label: 'More window names', heading: 'More windows',
      items: () => {
        const visible = new Set(engine.representations().map(rep => rep.id));
        const labelled = new Set([...stage.querySelectorAll('.canvas-orientation span')].map(label => label instanceof HTMLElement ? label.dataset.cardId : ''));
        return cards().filter(card => visible.has(card.id) && !labelled.has(card.id)).map(card => ({
          title: (card.props?.layerName || card.heading || card.text.split('\n').find(Boolean) || card.kind || card.type).slice(0, 80),
          run: event => { stage.focus({ preventScroll: true }); engine.navigate({ kind: 'fit', ids: [card.id], motion: event.detail === 0 ? 'instant' : 'glide' }); cameraChanged(); },
        }));
      }, onToggle: engine.invalidate,
      });
      menu.menu.classList.add('scene-orientation-menu');
    }
    if (event instanceof MouseEvent && menu.opened) menu.close();
    else {
      menu.open(event);
      if (event instanceof KeyboardEvent && ['ArrowUp', 'End'].includes(event.key)) {
        const last = menu.menu.querySelector('button:last-of-type');
        if (last instanceof HTMLElement) last.focus({ preventScroll: true });
      }
    }
  }
  stage.addEventListener('click', show, { capture: true, signal: abort.signal });
  stage.addEventListener('keydown', show, { signal: abort.signal });
  return () => { abort.abort(); changed.disconnect(); menu?.destroy(); };
}
