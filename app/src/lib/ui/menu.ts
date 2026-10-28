import { createPopup } from './dropdown.js';
import type { Popup } from './dropdown.js';
import './rows.css';
import { createTooltip } from './tooltip.js';
import type { TooltipTrigger } from './tooltip.js';

// Action menus and radio choices share the value picker's theme and input handling.
export interface MenuItem {
  readonly title: string;
  readonly run?: ((event: MouseEvent) => unknown) | undefined;
  readonly items?: readonly MenuItem[] | (() => readonly MenuItem[]) | undefined;
  readonly ariaLabel?: string | undefined;
  readonly checked?: boolean | undefined;
  readonly checkType?: 'radio' | 'checkbox' | undefined;
  readonly section?: string | undefined;
  readonly shortcut?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly destructive?: boolean | undefined;
}
export interface MenuOptions {
  readonly trigger?: HTMLElement | undefined;
  readonly menu?: HTMLElement;
  readonly items?: readonly MenuItem[] | (() => readonly MenuItem[]);
  readonly label?: string | undefined;
  readonly heading?: string | undefined;
  readonly portal?: boolean;
  readonly onToggle?: (open: boolean) => void;
  readonly bindTrigger?: boolean;
  readonly placement?: string;
}
export interface Menu extends Popup { setItems(items: readonly MenuItem[]): void }

const menuButton = (target: EventTarget | null): HTMLButtonElement | null => {
  const button = target instanceof Element ? target.closest('button[role^="menuitem"]') : null;
  return button instanceof HTMLButtonElement ? button : null;
};

export function createMenu({ trigger, menu = document.createElement('div'), items = [], label, heading, portal = true, onToggle = () => {}, bindTrigger = true, placement = 'bottom' }: MenuOptions = {}): Menu {
  menu.classList.add('aegis-action-menu');
  menu.setAttribute('aria-label', label || heading || 'Actions');
  let pressed: HTMLButtonElement | null = null; const children: Menu[] = [];
  menu.addEventListener('pointerdown', event => { pressed = menuButton(event.target); });
  menu.addEventListener('pointercancel', () => { pressed = null; });
  const focusFirst = (): void => {
    const target = menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button:not(:disabled)');
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  };
  const popup = createPopup({ trigger, menu, portal, placement, duration: 160, bindTrigger, onToggle(on) {
    pressed = null;
    if (on) { if (typeof items === 'function') setItems(items()); focusFirst(); }
    onToggle(on);
  } });
  function setItems(next: readonly MenuItem[]): void {
    for (const child of children.splice(0)) child.destroy();
    menu.replaceChildren();
    // PM4.6: one context heading keeps individual action labels short.
    if (heading) { const title = document.createElement('div'); title.className = 'aegis-menu-heading'; title.textContent = heading; menu.append(title); }
    let section: string | undefined;
    for (const item of next) {
      if (section !== undefined && item.section !== section) {
        const divider = document.createElement('div'); divider.className = 'aegis-menu-separator ctx-sep'; divider.setAttribute('role', 'separator'); menu.append(divider);
      }
      section = item.section;
      const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
      button.setAttribute('role', item.checked === undefined ? 'menuitem' : item.checkType === 'checkbox' ? 'menuitemcheckbox' : 'menuitemradio');
      if (item.checked !== undefined) button.setAttribute('aria-checked', String(item.checked));
      button.textContent = item.title; button.dataset.label = item.title; button.disabled = !!item.disabled;
      button.setAttribute('aria-label', item.ariaLabel || item.title);
      // Round 3 navigation: menu shortcuts use the same copy as the reference and tour.
      if (item.shortcut) { const key = document.createElement('kbd'); key.className = 'aegis-menu-shortcut'; key.setAttribute('aria-hidden', 'true'); key.textContent = item.shortcut; button.append(key); }
      if (item.checked !== undefined) button.insertAdjacentHTML('beforeend', item.checkType === 'checkbox'
        ? '<svg class="aegis-menu-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8 3 3 6-6"/></svg>'
        : '<svg class="aegis-menu-check aegis-menu-radio" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/></svg>');
      if (item.destructive || item.title === 'Delete') button.classList.add('aegis-menu-destructive');
      if (item.items) {
        children.push(createMenu({ trigger: button, label: item.title, items: item.items, placement: 'right' }));
        button.insertAdjacentHTML('beforeend', '<svg class="aegis-submenu-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>');
      } else button.onclick = event => {
        // A long press can open a wide menu beneath the finger. Its release is not a choice.
        if (event.detail && pressed !== button) return;
        // PM5.6: actions may distinguish keyboard activation from a pointer click.
        pressed = null; popup.close(true); item.run?.(event);
      };
      menu.append(button);
    }
  }
  if (typeof items !== 'function') setItems(items);
  if (!menu.isConnected && !portal) (trigger?.parentElement ?? document.body).append(menu);
  const triggerKey = (event: KeyboardEvent): void => {
    if (!popup.opened && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); popup.open(event);
      queueMicrotask(() => {
        if (event.key !== 'ArrowUp' && event.key !== 'End') return;
        const last = menu.querySelector('button:last-of-type:not(:disabled)'); if (last instanceof HTMLElement) last.focus();
      });
    }
  };
  trigger?.addEventListener('keydown', triggerKey);
  return {
    ...popup, setItems,
    get opened() { return popup.opened; },
    get trigger() { return popup.trigger; },
    destroy() { trigger?.removeEventListener('keydown', triggerKey); for (const child of children.splice(0)) child.destroy(); popup.destroy(); },
  };
}

export function rowMenuButton(name: string): HTMLButtonElement {
  const button: HTMLButtonElement & TooltipTrigger = document.createElement('button'); button.type = 'button'; button.className = 'row-more icon-btn';
  button.setAttribute('aria-label', `More actions for ${name}`); button.title = `More actions for ${name}`; button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r=".75"/><circle cx="8" cy="8" r=".75"/><circle cx="13" cy="8" r=".75"/></svg>';
  button.classList.add('aegis-tooltip-trigger'); button.uiTooltip = createTooltip(button);
  return button;
}
