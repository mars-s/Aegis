import { isKeyboard, reduceMotion } from './interaction.js';

export interface Tooltip { readonly close: () => void; readonly destroy: () => void }
export type TooltipTrigger = HTMLElement & { uiTooltip?: Tooltip };
let serial = 0, warmUntil = 0;

export function createTooltip(trigger: HTMLElement, text = trigger.title): Tooltip {
  const tip = document.createElement('div'); tip.className = 'aegis-tooltip'; tip.id = `aegis-tooltip-${++serial}`; tip.role = 'tooltip'; tip.textContent = text; tip.hidden = true;
  trigger.removeAttribute('title');
  let timer = 0, animation: Animation | undefined;
  function close(): void { clearTimeout(timer); animation?.cancel(); if (!tip.hidden) warmUntil = performance.now() + 400; tip.hidden = true; trigger.removeAttribute('aria-describedby'); }
  function show(): void {
    clearTimeout(timer); const instant = isKeyboard() || performance.now() < warmUntil;
    timer = window.setTimeout(() => {
      if (!trigger.isConnected || trigger.getAttribute('aria-expanded') === 'true') return;
      (trigger.closest('dialog[open]') ?? document.body).append(tip); tip.hidden = false; trigger.setAttribute('aria-describedby', tip.id);
      const r = trigger.getBoundingClientRect(), top = r.top - tip.offsetHeight - 6;
      tip.style.left = `${Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
      tip.style.top = `${top >= 8 ? top : r.bottom + 6}px`;
      tip.style.transformOrigin = top >= 8 ? '50% 100%' : '50% 0';
      if (!instant && !reduceMotion()) animation = tip.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 120, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }, instant ? 0 : 450);
  }
  const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') close(); };
  trigger.addEventListener('pointerenter', show); trigger.addEventListener('pointerleave', close); trigger.addEventListener('focus', show); trigger.addEventListener('blur', close); trigger.addEventListener('pointerdown', close); trigger.addEventListener('keydown', key);
  return { close, destroy() { close(); tip.remove(); trigger.removeEventListener('pointerenter', show); trigger.removeEventListener('pointerleave', close); trigger.removeEventListener('focus', show); trigger.removeEventListener('blur', close); trigger.removeEventListener('pointerdown', close); trigger.removeEventListener('keydown', key); } };
}
