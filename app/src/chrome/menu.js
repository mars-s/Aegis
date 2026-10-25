import { createMenu as actionMenu } from '../lib/ui/menu.js';

// Keep the canvas context-menu call shape while sharing all menu behaviour.
export function createMenu() {
  const el = document.createElement('div'); el.className = 'ctx-menu'; document.body.append(el);
  const menu = actionMenu({ menu: el, bindTrigger: false });
  return {
    el,
    show(x, y, items, event, trigger = document.activeElement) {
      menu.close(false, true); menu.setTrigger(trigger);
      menu.setItems([...items].sort((a, b) => (a.section ?? '').localeCompare(b.section ?? '')));
      menu.open(event, { x, y });
    },
    close: menu.close,
  };
}
