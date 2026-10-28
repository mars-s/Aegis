let keyboard = false, installed = false;
export const isKeyboard = (): boolean => keyboard;
export const reduceMotion = (): boolean => document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
export function mountInteraction(): void {
  if (installed) return;
  installed = true;
  addEventListener('keydown', () => { keyboard = true; }, true);
  addEventListener('pointerdown', () => { keyboard = false; }, true);
}
