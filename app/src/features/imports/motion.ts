import type { Ctx } from '../registry';

const arrivals = new Map<string, boolean>();
let keyboard = false;
const reduced = () => document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
export const importViaKeyboard = () => keyboard;
export const pointerImport = () => { keyboard = false; };
export function rememberImportWindow(id: string, instant: boolean) { arrivals.set(id, instant); }

export function installImportMotion(ctx: Ctx) {
  addEventListener('keydown', () => { keyboard = true; }, true);
  addEventListener('pointerdown', () => { keyboard = false; }, true);
  addEventListener('drop', () => { keyboard = false; }, true);
  const toast = document.getElementById('toast');
  let toastAnimation: Animation | undefined;
  if (toast) new MutationObserver(records => {
    if (!records.some(record => record.attributeName === 'hidden')) return;
    const closing = toast.hidden;
    if (closing && !reduced() && !keyboard) toast.classList.add('toast-leaving');
    const style = getComputedStyle(toast), currentOpacity = style.opacity, currentTransform = style.transform;
    const interrupted = !!toastAnimation;
    toastAnimation?.cancel(); toastAnimation = undefined;
    toast.classList.toggle('toast-leaving', closing && !reduced() && !keyboard);
    if (reduced() || keyboard) return;
    const start = interrupted ? { opacity: currentOpacity, transform: currentTransform } : closing ? { opacity: 1, transform: 'translate(-50%, 0)' } : { opacity: 0, transform: 'translate(-50%, 6px)' };
    const animation = toast.animate([start, { opacity: closing ? 0 : 1, transform: closing ? 'translate(-50%, 6px)' : 'translate(-50%, 0)' }], { duration: closing ? 150 : 200, easing: 'cubic-bezier(.23, 1, .32, 1)' });
    toastAnimation = animation;
    animation.finished.then(() => {
      if (toastAnimation !== animation) return;
      toastAnimation = undefined; toast.classList.remove('toast-leaving');
    }).catch(() => {});
  }).observe(toast, { attributes: true, attributeFilter: ['hidden'] });

  // Watch only the canvas's direct children, never individual card content or frames.
  // The 5,000-card pan path does no new per-frame work.
  const world = document.getElementById('world');
  if (!world) return;
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const id = node.dataset.id;
      if (!id || !arrivals.has(id)) continue;
      const instant = arrivals.get(id); arrivals.delete(id);
      if (instant || reduced()) continue;
      // Animate scale separately from the engine's position transform.
      node.animate([{ opacity: 0, scale: '.975' }, { opacity: 1, scale: '1' }], { duration: 240, easing: 'cubic-bezier(.32, .72, 0, 1)' });
    }
  }).observe(world, { childList: true });

  // A deleted imported window leaves a short, inert snapshot. Panning an existing
  // card offscreen never triggers this, and keyboard deletion remains instant.
  let previous = new Set<string>();
  let previousBoard = '';
  const pointerDeletes = new Set<string>();
  document.addEventListener('click', event => {
    if (!(event instanceof MouseEvent) || event.detail === 0 || !(event.target instanceof Element)) return;
    const button = event.target.closest('.ctx-menu [role="menuitem"], #selectionBar button');
    if (!button || (button.getAttribute('aria-label') || button.textContent?.trim()) !== 'Delete') return;
    ctx.canvas.selection().forEach((id: string) => pointerDeletes.add(id));
    setTimeout(() => pointerDeletes.clear(), 0);
  }, true);
  const stage = document.getElementById('stage');
  stage?.addEventListener('boardchange', () => {
    const current = new Set<string>(ctx.canvas.board.cards.filter((card: { props?: { import?: unknown } }) => card.props?.import).map((card: { id: string }) => card.id));
    if (previousBoard === ctx.canvas.board.id && !keyboard && !reduced()) for (const id of previous) {
      if (current.has(id) || !pointerDeletes.has(id)) continue;
      const el = world.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(id)}"]`);
      if (!el) continue;
      const rect = el.getBoundingClientRect(), ghost = el.cloneNode(true);
      if (!(ghost instanceof HTMLElement)) continue;
      ghost.classList.add('import-window-exit'); ghost.removeAttribute('data-id'); ghost.inert = true;
      Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, transform: 'none', margin: '0' });
      document.body.append(ghost);
      ghost.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.98' }], { duration: 200, easing: 'cubic-bezier(.32, .72, 0, 1)' }).finished.finally(() => ghost.remove());
    }
    previous = current;
    previousBoard = ctx.canvas.board.id;
  });
  const cancelMotion = () => {
    if (!reduced()) return;
    toastAnimation?.cancel(); toastAnimation = undefined; toast?.classList.remove('toast-leaving');
    world.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    document.querySelectorAll('.import-window-exit').forEach(el => el.remove());
  };
  new MutationObserver(cancelMotion).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', cancelMotion);
}
