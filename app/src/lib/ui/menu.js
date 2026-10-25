import { createPopup } from './dropdown.js';
import './rows.css';

// Action menus and radio choices share the value picker's theme and input handling.
export function createMenu({ trigger, menu = document.createElement('div'), items = [], label, portal = true, onToggle = () => {}, bindTrigger = true } = {}) {
  menu.classList.add('aegis-action-menu');
  if (label) menu.setAttribute('aria-label', label);
  let pressed = null;
  menu.addEventListener('pointerdown', event => { pressed = event.target.closest('button[role^="menuitem"]'); });
  menu.addEventListener('pointercancel', () => { pressed = null; });
  const popup = createPopup({ trigger, menu, portal, duration: 160, bindTrigger, onToggle(on) {
    pressed = null;
    if (on) {
      if (typeof items === 'function') setItems(items());
      (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
    }
    onToggle(on);
  } });
  function setItems(next) {
    menu.replaceChildren();
    let section;
    for (const item of next) {
      if (section !== undefined && item.section !== section) {
        const divider = document.createElement('div'); divider.className = 'aegis-menu-separator ctx-sep'; divider.setAttribute('role', 'separator'); menu.append(divider);
      }
      section = item.section;
      const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
      button.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemradio');
      if (item.checked !== undefined) button.setAttribute('aria-checked', String(item.checked));
      button.textContent = item.title; button.dataset.label = item.title; button.disabled = !!item.disabled;
      // Round 3 navigation: menu shortcuts use the same copy as the reference and tour.
      if (item.shortcut) { const key = document.createElement('kbd'); key.className = 'aegis-menu-shortcut'; key.setAttribute('aria-hidden', 'true'); key.textContent = item.shortcut; button.append(key); }
      if (item.destructive || item.title === 'Delete') button.classList.add('aegis-menu-destructive');
      button.onclick = event => {
        // A long press can open a wide menu beneath the finger. Its release is not a choice.
        if (event.detail && pressed !== button) return;
        pressed = null; popup.close(true); item.run();
      };
      menu.append(button);
    }
  }
  if (typeof items !== 'function') setItems(items);
  if (!menu.isConnected && !portal) (trigger?.parentElement || document.body).append(menu);
  trigger?.addEventListener('keydown', event => {
    if (!popup.opened && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); popup.open(event);
      queueMicrotask(() => { if (event.key === 'ArrowUp' || event.key === 'End') menu.querySelector('button:last-of-type:not(:disabled)')?.focus(); });
    }
  });
  return { ...popup, get opened() { return popup.opened; }, get trigger() { return popup.trigger; }, setItems };
}

export function rowMenuButton(name) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'row-more icon-btn';
  button.setAttribute('aria-label', `More actions for ${name}`); button.title = `More actions for ${name}`; button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r=".75"/><circle cx="8" cy="8" r=".75"/><circle cx="13" cy="8" r=".75"/></svg>';
  return button;
}
