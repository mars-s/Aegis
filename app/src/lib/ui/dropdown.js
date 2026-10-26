import './dropdown.css';
import './surface.css';
import { mountInteraction } from './interaction.js';
import { mountDialogs } from './dialog.js';
let serial = 0, active, keyboardInput = false;
const reduced = () => document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const visibleItems = menu => [...menu.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(el => !el.closest('[hidden]') && el.getClientRects().length);

// Shared positioning, dismissal and keyboard behaviour for value pickers and action menus.
export function createPopup({ trigger, menu, onToggle = () => {}, portal = false, role = 'menu', duration, bindTrigger = true, placement = 'bottom' }) {
  menu.classList.add('aegis-dropdown-menu', 'aegis-surface'); menu.setAttribute('role', role); menu.hidden = true;
  if (!menu.id) menu.id = `aegis-menu-${++serial}`;
  if (trigger) { trigger.setAttribute('aria-controls', menu.id); trigger.setAttribute('aria-haspopup', role); trigger.setAttribute('aria-expanded', 'false'); }
  let opened = false, point, parent, animation, search = '', lastKey = 0, positionFrame = 0;
  const originalMaxHeight = menu.style.maxHeight, originalMaxWidth = menu.style.maxWidth, originalMinWidth = menu.style.minWidth;
  let desiredMinWidth = originalMinWidth;
  const resizeObserver = new ResizeObserver(() => queuePosition());
  function queuePosition(event) {
    if (!opened || event?.target instanceof Element && menu.contains(event.target)) return;
    if (!positionFrame) positionFrame = requestAnimationFrame(() => { positionFrame = 0; position(); });
  }
  function watchPosition() {
    resizeObserver.disconnect();
    resizeObserver.observe(menu);
    // The trigger can move when an ancestor, including the island, grows.
    for (let el = trigger; el && el !== document.body; el = el.parentElement) resizeObserver.observe(el);
  }
  const easing = () => getComputedStyle(menu).getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)';
  function motion(show, instant = false) {
    const current = !menu.hidden && animation ? { opacity: getComputedStyle(menu).opacity, transform: getComputedStyle(menu).transform } : { opacity: show ? 0 : 1, transform: show ? 'scale(.97)' : 'scale(1)' };
    animation?.cancel(); animation = null;
    if (instant || keyboardInput || reduced()) { menu.hidden = !show; return; }
    menu.hidden = false;
    animation = menu.animate([current, { opacity: show ? 1 : 0, transform: show ? 'scale(1)' : 'scale(.97)' }], { duration: duration ?? (parseFloat(getComputedStyle(menu).getPropertyValue('--motion-menu')) || 140), easing: easing(), fill: 'both' });
    animation.onfinish = () => { menu.hidden = !opened; animation?.cancel(); animation = null; };
  }
  function position() {
    if (!opened) return;
    for (const item of menu.querySelectorAll('button[role^=menuitem]')) item.tabIndex = -1;
    const margin = 10, gap = parseFloat(getComputedStyle(menu).getPropertyValue('--menu-gap')) || 6, viewportWidth = document.documentElement.clientWidth, viewportHeight = innerHeight;
    const r = trigger?.getBoundingClientRect();
    // Measure the themed height before applying the current side's space limit.
    menu.style.position = placement === 'right' ? 'absolute' : 'fixed'; menu.style.right = 'auto'; menu.style.bottom = 'auto';
    menu.style.maxHeight = originalMaxHeight; menu.style.maxWidth = originalMaxWidth;
    const maxWidth = getComputedStyle(menu).maxWidth;
    menu.style.maxWidth = maxWidth === 'none' ? `${viewportWidth - margin * 2}px` : `min(${maxWidth}, ${viewportWidth - margin * 2}px)`;
    menu.style.minWidth = desiredMinWidth;
    const minWidth = getComputedStyle(menu).minWidth;
    menu.style.minWidth = `min(${minWidth}, ${viewportWidth - margin * 2}px)`;
    const themedMaxHeight = getComputedStyle(menu).maxHeight, wantedHeight = menu.offsetHeight;
    if (placement === 'right' && r && !point) {
      const available = viewportHeight - margin * 2;
      menu.style.maxHeight = themedMaxHeight === 'none' ? `${available}px` : `min(${themedMaxHeight}, ${available}px)`;
      const width = menu.offsetWidth, height = menu.offsetHeight, flip = r.right + gap + width > viewportWidth - margin;
      const left = Math.max(margin, Math.min(viewportWidth - width - margin, flip ? r.left - gap - width : r.right + gap));
      const top = Math.max(margin, Math.min(viewportHeight - height - margin, r.top + r.height / 2 - height / 2));
      const container = menu.offsetParent, origin = container?.getBoundingClientRect();
      menu.style.left = `${left - (origin?.left ?? 0) - (container?.clientLeft ?? 0) + (container?.scrollLeft ?? 0)}px`;
      menu.style.top = `${top - (origin?.top ?? 0) - (container?.clientTop ?? 0) + (container?.scrollTop ?? 0)}px`; menu.dataset.side = flip ? 'left' : 'right';
      menu.style.transformOrigin = `${flip ? '100%' : '0'} ${Math.max(0, Math.min(height, r.top + r.height / 2 - top))}px`;
      return;
    }
    const below = Math.max(margin, Math.min(viewportHeight - margin, point?.y ?? (r ? r.bottom + gap : margin)));
    const above = Math.max(margin, Math.min(viewportHeight - margin, point?.y ?? (r ? r.top - gap : margin)));
    const belowSpace = viewportHeight - margin - below, aboveSpace = above - margin;
    const flip = wantedHeight > belowSpace && aboveSpace > belowSpace;
    const available = Math.max(0, flip ? aboveSpace : belowSpace);
    menu.style.maxHeight = themedMaxHeight === 'none' ? `${available}px` : `min(${themedMaxHeight}, ${available}px)`;
    const width = menu.offsetWidth, height = menu.offsetHeight;
    const left = Math.max(margin, Math.min(viewportWidth - width - margin, point?.x ?? r?.left ?? margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(margin, Math.min(viewportHeight - height - margin, flip ? above - height : below))}px`;
    menu.dataset.side = flip ? 'top' : 'bottom';
    menu.style.transformOrigin = `${r ? Math.max(0, Math.min(width, r.left + r.width / 2 - left)) : 12}px ${flip ? '100%' : '0'}`;
  }

  function close(focus = false, instant = false) {
    if (!opened) return;
    if (active !== api && active && menu.contains(active.trigger)) active.close();
    resizeObserver.disconnect(); cancelAnimationFrame(positionFrame); positionFrame = 0;
    removeEventListener('resize', queuePosition); removeEventListener('scroll', queuePosition, true);
    opened = false; menu.inert = true; menu.setAttribute('aria-hidden', 'true'); trigger?.setAttribute('aria-expanded', 'false'); onToggle(false); motion(false, instant);
    if (active === api) active = parent?.opened ? parent : null;
    if (focus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }
  function open(event, at) {
    if (opened || trigger?.disabled) return;
    parent = active?.menu.contains(trigger) ? active : null; if (!parent) active?.close(); active = api; point = at; if (event) keyboardInput = event.type === 'keydown' || event.type === 'click' && event.detail === 0; search = '';
    if (portal) (trigger?.closest('dialog[open]') ?? [...document.querySelectorAll('dialog[open]')].findLast(d => d.matches(':modal')) ?? document.body).append(menu);
    trigger?.uiTooltip?.close();
    opened = true; menu.inert = false; menu.removeAttribute('aria-hidden');
    motion(true); menu.hidden = false; trigger?.setAttribute('aria-expanded', 'true');
    menu.style.minWidth = originalMinWidth; onToggle(true); desiredMinWidth = menu.style.minWidth; position(); watchPosition();
    addEventListener('resize', queuePosition); addEventListener('scroll', queuePosition, true);
  }
  function key(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { if (role !== 'dialog') close(true); return; }
    const navigation = event.target.closest('[role=menu]') ?? menu;
    if (role === 'dialog' && navigation === menu) return;
    if (['Enter', ' '].includes(event.key) && document.activeElement.matches('button[role=option], button[role=menuitem], button[role=menuitemradio], button[role=menuitemcheckbox]')) { event.preventDefault(); document.activeElement.click(); return; }
    const items = visibleItems(navigation); if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowUp' ? items.length - 1 : 0) : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus({ preventScroll: true }); items[next].scrollIntoView({ block: 'nearest' });
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !document.activeElement.matches('input, textarea')) {
      event.preventDefault(); const now = performance.now(); search = now - lastKey < 600 ? search + event.key.toLowerCase() : event.key.toLowerCase(); lastKey = now;
      const needle = [...search].every(c => c === search[0]) ? search[0] : search;
      const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)]; ordered.find(el => (el.dataset.label || el.textContent).trim().toLowerCase().startsWith(needle))?.focus();
    }
  }
  const click = e => { e.preventDefault(); opened ? close() : open(e); };
  function setTrigger(next) {
    if (bindTrigger) trigger?.removeEventListener('click', click);
    trigger = next;
    if (opened) { watchPosition(); queuePosition(); }
    if (trigger) { trigger.setAttribute('aria-controls', menu.id); trigger.setAttribute('aria-haspopup', role); trigger.setAttribute('aria-expanded', String(opened)); if (bindTrigger) trigger.addEventListener('click', click); }
  }
  setTrigger(trigger);
  const api = { open, close, position, key, menu, setTrigger, get trigger() { return trigger; }, get opened() { return opened; }, destroy() { close(false, true); animation?.cancel(); if (bindTrigger) trigger?.removeEventListener('click', click); if (portal) menu.remove(); } };
  return api;
}

export function createDropdown({ label, options = [], value, onChange = () => {} }) {
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'aegis-dropdown'; trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-label', label); trigger.setAttribute('aria-autocomplete', 'none');
  const caption = document.createElement('span'); caption.className = 'aegis-dropdown-value';
  trigger.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6.5 3 3 3-3"/></svg>'; trigger.prepend(caption);
  const menu = document.createElement('div'); menu.className = 'aegis-value-menu'; menu.setAttribute('aria-label', label + ' options');
  let choices = [], selected = value == null ? undefined : String(value);
  const popup = createPopup({ trigger, menu, portal: true, role: 'listbox', onToggle(on) { if (on) menu.style.minWidth = `${trigger.offsetWidth}px`; } });
  function sync() {
    const choice = choices.find(o => o.value === selected); caption.textContent = choice?.label || label;
    for (const el of menu.querySelectorAll('[role=option]')) el.setAttribute('aria-selected', String(el.dataset.value === selected));
  }
  function setOptions(values) {
    choices = values.map(o => Array.isArray(o) ? { value: String(o[0]), label: o[1] } : { ...o, value: String(o.value) });
    if (selected === undefined) selected = choices[0]?.value ?? '';
    menu.replaceChildren();
    // PM4.7: grouped model pickers share the regular dropdown's keyboard handling.
    const groups = new Map();
    for (const o of choices) {
      let parent = menu;
      if (o.group) {
        if (!groups.has(o.group)) {
          const group = document.createElement('div'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', `${o.group}, ${o.groupDescription || ''}`);
          const heading = document.createElement('div'); heading.className = 'aegis-model-group'; heading.setAttribute('aria-hidden', 'true');
          for (const text of [o.group, o.groupDescription]) { const span = document.createElement('span'); span.textContent = text || ''; heading.append(span); }
          group.append(heading); groups.set(o.group, group); menu.append(group);
        }
        parent = groups.get(o.group);
      }
      const item = document.createElement('button'); item.type = 'button'; item.setAttribute('role', 'option'); item.tabIndex = -1; item.disabled = !!o.disabled; item.dataset.value = o.value; item.dataset.label = o.label;
      if (o.description) item.setAttribute('aria-description', o.description);
      const text = document.createElement('span'); text.textContent = o.label; item.append(text);
      item.insertAdjacentHTML('beforeend', '<svg class="aegis-option-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8 3 3 6-6"/></svg>');
      item.onclick = () => { selected = o.value; sync(); popup.close(true); onChange(selected); trigger.dispatchEvent(new Event('change', { bubbles: true })); };
      parent.append(item);
    }
    sync();
  }
  Object.defineProperty(trigger, 'value', { get: () => selected ?? '', set: v => { selected = String(v ?? ''); sync(); } });
  trigger.setOptions = setOptions; trigger.dropdown = popup;
  trigger.dropdownKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey && e.key !== 'ArrowDown' || e.key === 'Tab') return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) || e.key.length === 1) {
      e.preventDefault(); popup.open(e); const current = menu.querySelector('[aria-selected="true"]:not(:disabled)') || menu.querySelector('[role=option]:not(:disabled)'); current?.focus();
      if (e.key.length === 1 && e.key !== ' ') popup.key(e);
    }
  };
  setOptions(options); return trigger;
}

// For feature-owned controls that still build a select: retain its live handlers off-DOM.
// There is one visible implementation; no native select or duplicate focus stop stays in the app.
export function replaceSelect(source) {
  const dropdown = createDropdown({ label: source.getAttribute('aria-label') || source.closest('label')?.textContent.trim() || source.title || 'Choose an option', value: source.value, onChange(value) { source.value = value; source.dispatchEvent(new Event('change', { bubbles: true })); } });
  for (const attr of source.attributes) if (!['class', 'aria-label', 'role'].includes(attr.name)) dropdown.setAttribute(attr.name, attr.value);
  dropdown.className += source.className ? ` ${source.className}` : '';
  const refresh = () => { dropdown.setOptions([...source.options].map(o => ({ value: o.value, label: o.label, disabled: o.disabled, group: o.dataset.group, groupDescription: o.dataset.groupDescription, description: o.getAttribute('aria-description') }))); dropdown.value = source.value; dropdown.disabled = source.disabled; };
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(source, 'value', { get() { return descriptor.get.call(this); }, set(value) { descriptor.set.call(this, value); dropdown.value = descriptor.get.call(this); } });
  const observer = new MutationObserver(refresh); observer.observe(source, { childList: true, subtree: true, attributes: true, characterData: true });
  dropdown.dropdown.disposeSource = () => observer.disconnect();
  source.addEventListener('change', refresh); refresh(); source.replaceWith(dropdown); return dropdown;
}

let installed = false;
export function mountDropdowns() {
  if (installed) return; installed = true; mountInteraction(); mountDialogs();
  // The island's hidden data selects stay native: its menu reads their .options and draws its own themed choices.
  const excluded = '[data-native-select], #model, #count, .composer, .ask-island, #mobileHub, .side-editor, .docs-toolbar, .docs-panel, .docview, .docs-bubble, .docs-bubble-menu, .docs-format, .doc-window, .card.doc';
  const scan = root => { if (root.nodeType !== 1) return; for (const select of [...root.matches('select') ? [root] : [], ...root.querySelectorAll('select')]) if (select.isConnected && !select.closest(excluded)) replaceSelect(select); };
  new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) scan(node); if (active && (!active.menu.isConnected || active.trigger && !active.trigger.isConnected)) active.close(); for (const record of records) for (const node of record.removedNodes) if (node.nodeType === 1 && !node.isConnected) for (const el of [...node.matches('.aegis-dropdown, .aegis-combobox, .aegis-tooltip-trigger') ? [node] : [], ...node.querySelectorAll('.aegis-dropdown, .aegis-combobox, .aegis-tooltip-trigger')]) { el.dropdown?.destroy(); el.dropdown?.disposeSource?.(); el.uiTooltip?.destroy(); } }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
  addEventListener('pointerdown', e => { keyboardInput = false; while (active && !active.menu.contains(e.target) && !active.trigger?.contains(e.target)) active.close(); }, true);
  addEventListener('keydown', e => {
    keyboardInput = true;
    // A select inside a mixed-control popover owns its opening keys before its parent.
    const dropdown = e.target.closest?.('.aegis-dropdown');
    if (dropdown?.dropdownKey && active?.trigger !== dropdown && !e.metaKey && !e.ctrlKey && !['Tab', 'Escape'].includes(e.key)) {
      e.stopImmediatePropagation(); dropdown.dropdownKey(e); return;
    }
    if (active && (['Escape', 'Tab'].includes(e.key) || active.menu.contains(e.target) || active.trigger?.contains(e.target))) {
      if (e.target.matches('input, textarea, [contenteditable]') && !['Escape', 'Tab'].includes(e.key)) return;
      e.stopImmediatePropagation(); active.key(e);
    }
    else if (e.target.closest?.('.aegis-dropdown')?.dropdownKey && !e.metaKey && !e.ctrlKey && e.key !== 'Tab') { e.stopImmediatePropagation(); e.target.closest('.aegis-dropdown').dropdownKey(e); }
  }, true);
  addEventListener('focusin', e => { if (active?.menu.getAttribute('role') === 'dialog' && !active.menu.contains(e.target) && !active.trigger?.contains(e.target)) active.close(); });
  addEventListener('blur', () => { while (active) active.close(); });
}

// Retain a disclosure's live content and open state while sharing the popup lifecycle.
export function bindDisclosure(details, { label, role = 'dialog' } = {}) {
  const trigger = details.firstElementChild, menu = details.lastElementChild;
  if (label) menu.setAttribute('aria-label', label);
  const popup = createPopup({ trigger, menu, role, onToggle(open) { details.open = open; } });
  const toggle = () => { if (details.open) popup.open(); else popup.close(); };
  const key = event => {
    if (event.target !== trigger || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault(); popup.open(event);
    const items = visibleItems(menu); (event.key === 'ArrowUp' ? items.at(-1) : items[0])?.focus({ preventScroll: true });
  };
  details.addEventListener('toggle', toggle); trigger.addEventListener('keydown', key);
  return { ...popup, get opened() { return popup.opened; }, destroy() { details.removeEventListener('toggle', toggle); trigger.removeEventListener('keydown', key); popup.destroy(); } };
}

// Editable listbox for font names. Typing and native change events keep existing editor handlers intact.
export function createCombobox({ label, options = [], value = '' }) {
  const input = document.createElement('input'); input.className = 'aegis-combobox'; input.value = value;
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-label', label); input.setAttribute('aria-autocomplete', 'list');
  const menu = document.createElement('div'); menu.className = 'aegis-value-menu'; menu.setAttribute('aria-label', label + ' choices');
  let values = options, highlighted = -1;
  const popup = createPopup({ trigger: input, menu, portal: true, role: 'listbox', bindTrigger: false, onToggle(open) { if (!open) input.removeAttribute('aria-activedescendant'); } });
  const rows = () => [...menu.querySelectorAll('[role=option]:not(:disabled)')];
  function highlight(index) {
    const items = rows(); highlighted = index;
    items.forEach((item, at) => item.toggleAttribute('data-highlighted', at === index));
    if (items[index]) { input.setAttribute('aria-activedescendant', items[index].id); items[index].scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  function render(query = '') {
    menu.replaceChildren(); highlighted = -1; input.removeAttribute('aria-activedescendant');
    for (const value of values.filter(value => value.toLowerCase().includes(query.toLowerCase()))) {
      const item = document.createElement('button'); item.type = 'button'; item.role = 'option'; item.id = `aegis-option-${++serial}`; item.tabIndex = -1;
      item.textContent = value; item.dataset.label = value; item.setAttribute('aria-selected', String(value === input.value));
      item.onpointerdown = event => event.preventDefault();
      item.onclick = () => { input.value = value; popup.close(true); input.dispatchEvent(new Event('change', { bubbles: true })); };
      menu.append(item);
    }
    if (!menu.childElementCount) { const empty = document.createElement('div'); empty.className = 'aegis-menu-heading'; empty.textContent = 'Press Return to use this font'; menu.append(empty); }
  }
  input.addEventListener('input', () => { render(input.value); popup.open(); popup.position(); });
  input.addEventListener('click', event => { render(); popup.open(event); });
  input.addEventListener('keydown', event => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); if (!popup.opened) { render(); popup.open(event); }
      const count = rows().length; if (count) highlight((highlighted + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    } else if (event.key === 'Enter' && popup.opened) {
      event.preventDefault(); const item = rows()[highlighted];
      if (item) item.click(); else { popup.close(true); input.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  });
  input.addEventListener('blur', () => { if (popup.opened) popup.close(); });
  input.dropdown = popup; input.setOptions = options => { values = options; render(); }; render(); return input;
}
