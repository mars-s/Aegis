import type { CardId } from '@aegis/domain';
import type { CanvasWorkspace } from '@aegis/scene';

/** Import feedback belongs to the authored import, never a later viewport lease. */
export function createImportArrival(workspace: Pick<CanvasWorkspace, 'scene' | 'selection'>) {
  const arrivals = new Map<string, boolean>();
  let keyboard = false;
  const reduced = () => document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function install(world: HTMLElement): () => void {
    const animations = new Set<Animation>(), ghosts = new Set<HTMLElement>(), deletes = new Set<CardId>();
    const rememberAnimation = (animation: Animation) => { animations.add(animation); void animation.finished.then(() => animations.delete(animation), () => animations.delete(animation)); };
    let imported = new Set(workspace.scene.snapshot().cards.filter(card => card.props?.import).map(card => card.id));
    const key = () => { keyboard = true; };
    const pointer = () => { keyboard = false; };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('drop', pointer, true);
    const deletion = (event: MouseEvent) => {
      if (!event.detail || !(event.target instanceof Element)) return;
      const button = event.target.closest('.ctx-menu [role="menuitem"], #selectionBar button, .aegis-confirm button');
      if (!button || (button.getAttribute('aria-label') || button.textContent?.trim()) !== 'Delete') return;
      for (const id of workspace.selection.getSnapshot()) deletes.add(id);
      setTimeout(() => deletes.clear(), 0);
    };
    document.addEventListener('click', deletion, true);
    const identities = new WeakMap<HTMLElement, string>(), entering = new Map<HTMLElement, Animation>();
    const arrive = (node: Node) => {
      if (!(node instanceof HTMLElement) || node.parentElement !== world || !node.matches('.card')) return;
      const id = node.dataset.id ?? '';
      if (identities.get(node) === id) return;
      identities.set(node, id);
      entering.get(node)?.cancel(); entering.delete(node);
      if (!id || !arrivals.has(id)) return;
      const instant = arrivals.get(id); arrivals.delete(id);
      if (instant || reduced()) return;
      const animation = node.animate([{ opacity: 0, scale: '.975' }, { opacity: 1, scale: '1' }], { duration: 240, easing: 'cubic-bezier(.32, .72, 0, 1)' });
      entering.set(node, animation); rememberAnimation(animation);
      const complete = () => { if (entering.get(node) === animation) entering.delete(node); };
      void animation.finished.then(complete, complete);
    };
    const identity = new MutationObserver(records => { for (const record of records) arrive(record.target); });
    const observeShells = () => {
      identity.disconnect();
      for (const node of world.children) if (node instanceof HTMLElement && node.matches('.card')) {
        identity.observe(node, { attributes: true, attributeFilter: ['data-id'] }); arrive(node);
      }
    };
    const observer = new MutationObserver(observeShells);
    observer.observe(world, { childList: true }); observeShells();
    const off = workspace.scene.subscribe(change => {
      if (change.kind === 'replace') { arrivals.clear(); deletes.clear(); for (const animation of entering.values()) animation.cancel(); entering.clear(); }
      else if (change.origin === 'local' && !keyboard && !reduced()) for (const id of change.removed) {
        if (!deletes.has(id) || !imported.has(id)) continue;
        const node = world.querySelector(`.card[data-id="${CSS.escape(id)}"]`); if (!(node instanceof HTMLElement)) continue;
        const rect = node.getBoundingClientRect(), ghost = node.cloneNode(true); if (!(ghost instanceof HTMLElement)) continue;
        ghost.classList.add('import-window-exit'); ghost.removeAttribute('data-id'); ghost.inert = true;
        Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, transform: 'none', margin: '0', pointerEvents: 'none' });
        document.body.append(ghost); ghosts.add(ghost);
        const animation = ghost.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.98' }], { duration: 200, easing: 'cubic-bezier(.32, .72, 0, 1)' });
        rememberAnimation(animation);
        const remove = () => { ghost.remove(); ghosts.delete(ghost); };
        void animation.finished.then(remove, remove);
      }
      imported = new Set(workspace.scene.snapshot().cards.filter(card => card.props?.import).map(card => card.id));
    });
    const cancel = () => { if (reduced()) { for (const animation of animations) animation.cancel(); for (const ghost of ghosts) ghost.remove(); ghosts.clear(); } };
    const motion = new MutationObserver(cancel), media = matchMedia('(prefers-reduced-motion: reduce)');
    motion.observe(document.body, { attributes: true, attributeFilter: ['class'] }); media.addEventListener('change', cancel);
    return () => {
      observer.disconnect(); identity.disconnect(); motion.disconnect(); media.removeEventListener('change', cancel); off(); arrivals.clear();
      for (const animation of animations) animation.cancel(); for (const ghost of ghosts) ghost.remove();
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('drop', pointer, true);
      document.removeEventListener('click', deletion, true);
    };
  }
  return { install, viaKeyboard: () => keyboard, remember: (ids: readonly CardId[], instant: boolean) => { for (const id of ids) arrivals.set(id, instant); } };
}
