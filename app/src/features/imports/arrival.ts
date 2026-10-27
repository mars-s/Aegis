import type { CardId } from '@aegis/domain';
import type { FeatureWorkspace } from '../../composition.js';

/** Import feedback belongs to the authored import, never a later viewport lease. */
export function createImportArrival(workspace: FeatureWorkspace) {
  const arrivals = new Map<string, boolean>();
  let keyboard = false;
  const reduced = () => document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function install(world: HTMLElement): () => void {
    const key = () => { keyboard = true; };
    const pointer = () => { keyboard = false; };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('drop', pointer, true);
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const id = node.dataset.id;
        if (!id || !arrivals.has(id)) continue;
        const instant = arrivals.get(id); arrivals.delete(id);
        if (instant || reduced()) continue;
        node.animate([{ opacity: 0, scale: '.975' }, { opacity: 1, scale: '1' }], { duration: 240, easing: 'cubic-bezier(.32, .72, 0, 1)' });
      }
    });
    observer.observe(world, { childList: true });
    const off = workspace.scene.subscribe(change => { if (change.kind === 'replace') arrivals.clear(); });
    return () => {
      observer.disconnect(); off(); arrivals.clear();
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('drop', pointer, true);
    };
  }
  return { install, viaKeyboard: () => keyboard, remember: (ids: readonly CardId[], instant: boolean) => { for (const id of ids) arrivals.set(id, instant); } };
}
