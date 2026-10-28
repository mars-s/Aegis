import { isKeyboard, reduceMotion } from './interaction.js';
let serial = 0, warmUntil = 0;
export interface Tooltip { readonly close: () => void; readonly destroy: () => void }
const tooltips = new WeakMap<HTMLElement, Tooltip>();
export const tooltipFor = (trigger: HTMLElement): Tooltip | undefined => tooltips.get(trigger);
export function createTooltip(trigger: HTMLElement, text = trigger.title): Tooltip {
  const tip = document.createElement('div'); tip.className = 'aegis-tooltip'; tip.id = `aegis-tooltip-${++serial}`; tip.role = 'tooltip'; tip.textContent = text; tip.hidden = true;
  trigger.removeAttribute('title'); let timer: ReturnType<typeof setTimeout> | undefined, animation: Animation | undefined;
  function close() { clearTimeout(timer); animation?.cancel(); if (!tip.hidden) warmUntil = performance.now() + 400; tip.hidden = true; trigger.removeAttribute('aria-describedby'); }
  function show() {
    clearTimeout(timer); const instant = isKeyboard() || performance.now() < warmUntil;
    timer = setTimeout(() => {
      if (!trigger.isConnected || trigger.getAttribute('aria-expanded') === 'true') return;
      (trigger.closest('dialog[open]') ?? document.body).append(tip); tip.hidden = false; trigger.setAttribute('aria-describedby', tip.id);
      const r = trigger.getBoundingClientRect(), top = r.top - tip.offsetHeight - 6;
      tip.style.left = `${Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
      tip.style.top = `${top >= 8 ? top : r.bottom + 6}px`;
      tip.style.transformOrigin = top >= 8 ? '50% 100%' : '50% 0';
      if (!instant && !reduceMotion()) animation = tip.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 120, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }, instant ? 0 : 450);
  }
  trigger.addEventListener('pointerenter', show); trigger.addEventListener('pointerleave', close); trigger.addEventListener('focus', show); trigger.addEventListener('blur', close); trigger.addEventListener('pointerdown', close);
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); }; trigger.addEventListener('keydown', key);
  const api = { close, destroy() { close(); tip.remove(); trigger.removeEventListener('pointerenter', show); trigger.removeEventListener('pointerleave', close); trigger.removeEventListener('focus', show); trigger.removeEventListener('blur', close); trigger.removeEventListener('pointerdown', close); trigger.removeEventListener('keydown', key); tooltips.delete(trigger); } };
  tooltips.set(trigger, api); return api;
}
