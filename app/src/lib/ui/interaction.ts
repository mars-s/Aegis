let keyboard = false, installed = false;
export const isKeyboard = () => keyboard;
export const reduceMotion = () => document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
export function mountInteraction() {
  if (installed) return;
  installed = true;
  addEventListener('keydown', () => { keyboard = true; }, true);
  addEventListener('pointerdown', () => { keyboard = false; }, true);
}
