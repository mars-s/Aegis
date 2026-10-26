import { createDropdown, createPopup } from '../../lib/ui/dropdown.js';
import { OrbMark } from '../../lib/ui/orb-mark.js';
import { createStepper } from '../../lib/ui/stepper.js';
// Selection controls share their live nodes between the toolbar and its menus.
const paths = {
  Bold: '<path d="M4.5 2.5h4a2.75 2.75 0 0 1 0 5.5h-4m0 0H9a2.75 2.75 0 0 1 0 5.5H4.5z"/>',
  Italic: '<path d="M7 2.5h6M3 13.5h6M10 2.5l-4 11"/>',
  Underline: '<path d="M4 2.5v5a4 4 0 0 0 8 0v-5M3 14h10"/>',
  'Strike through': '<path d="M11.5 4c-1-2-6.5-2-6.5 1 0 1.5 1.5 2 3 2.5M3 8h10M5 11.5c1 2.5 7 2.5 7-.5 0-.7-.4-1.3-1-1.7"/>',
  Align: '<path d="M2.5 3.5h11M2.5 6.5h7M2.5 9.5h11M2.5 12.5h7"/>',
  Colour: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11M8 2.5a5.5 5.5 0 0 1 0 11"/>',
  Duplicate: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-3h-8v8h3"/>',
  Delete: '<path d="M2.5 4h11M6 4V2h4v2M4 4l.5 10h7L12 4M6.5 6.5v5M9.5 6.5v5"/>',
  Group: '<path d="M5.5 2.5h-3v3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3"/><rect x="5.5" y="5.5" width="5" height="5" rx="1"/>',
  Open: '<path d="M9 2.5h4.5V7M13.5 2.5l-7 7M6 2.5H3a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-3"/>',
  Replace: '<path d="M3 6a5 5 0 0 1 9-2l1.5 2M13.5 2v4H9.5M13 10a5 5 0 0 1-9 2l-1.5-2M2.5 14v-4h4"/>',
  Download: '<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 10.5v3h11v-3"/>',
  More: '<circle cx="3" cy="8" r=".75"/><circle cx="8" cy="8" r=".75"/><circle cx="13" cy="8" r=".75"/>',
};
export const selectionIcon = name => name === 'AI' ? OrbMark() : `<svg viewBox="0 0 16 16" aria-hidden="true">${paths[name] || paths.More}</svg>`;

export function selectionToolbar(bar, changed) {
  const scroll = document.createElement('div'); scroll.className = 'selection-inline'; bar.append(scroll);
  const more = document.createElement('details'); more.className = 'selection-more';
  const trigger = document.createElement('summary'); trigger.innerHTML = selectionIcon('More'); trigger.title = 'More'; trigger.setAttribute('aria-label', 'More selection controls');
  const menu = document.createElement('div'); menu.className = 'selection-overflow selection-menu'; menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'More selection controls menu');
  more.append(trigger, menu); scroll.append(more);
  const sections = new Map(), popovers = [more];
  const section = title => {
    if (!sections.has(title)) {
      const name = { Typography: 'Format', Arrange: 'Arrange', Export: 'Export', Card: 'Details' }[title];
      const el = document.createElement('section');
      if (name) {
        const details = document.createElement('details'); details.className = 'selection-submenu';
        const summary = document.createElement('summary'); summary.setAttribute('aria-label', `${name} selection`);
        summary.innerHTML = `<span>${name}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>`;
        el.className = 'selection-menu selection-submenu-panel'; el.setAttribute('aria-label', `${name} selection controls`);
        details.append(summary, el); menu.append(details); popovers.push(details); bind(details);
      } else { el.className = 'selection-actions'; menu.append(el); }
      sections.set(title, el);
    }
    return sections.get(title);
  };
  function row(control, title, group) {
    const el = document.createElement('label'); el.className = 'selection-row';
    const label = document.createElement('span'); label.textContent = title; el.append(label, control); section(group).append(el); return control;
  }
  function button(label, action, { inline = false, group = 'Actions', shortcut = '', icon = label, text = false } = {}) {
    const el = document.createElement('button'); el.type = 'button'; el.title = label; el.setAttribute('aria-label', label);
    if (inline) { el.className = 'selection-action'; el.innerHTML = selectionIcon(icon); if (text) { const caption = document.createElement('span'); caption.textContent = label; el.append(caption); } scroll.insertBefore(el, more); }
    else { el.className = 'selection-menu-action'; const name = document.createElement('span'), hint = document.createElement('kbd'); name.textContent = label; hint.textContent = shortcut; hint.className = 'selection-value'; el.append(name, hint); section(group).append(el); }
    if (label === 'Delete') el.classList.add('aegis-menu-destructive');
    el.onclick = action; return el;
  }
  function input(label, value, action, type = 'text', group = 'Card', bounds = {}) {
    const el = document.createElement('input'); el.type = type; Object.assign(el, bounds); el.value = value ?? ''; el.setAttribute('aria-label', label); el.title = label; el.onchange = () => action(el.value);
    return row(el, label, group);
  }
  function select(label, values, value, action, group = 'Typography') {
    const el = createDropdown({ label, options: values, value: value ?? '', onChange: action }); el.title = label; return row(el, label, group);
  }
  function stepper(label, value, action, { inline = false, min = 6, max = 400, step = 1, group = 'Typography' } = {}) {
    const { el: wrap, input: field } = createStepper({ label, value, min, max, step, onChange: action }); wrap.classList.add('selection-stepper');
    if (inline) scroll.insertBefore(wrap, more); else row(wrap, label, group); return field;
  }
  function popup(label, build, icon = label) {
    const details = document.createElement('details'); details.className = 'selection-popup';
    const summary = document.createElement('summary'); summary.innerHTML = selectionIcon(icon); summary.setAttribute('aria-label', label); summary.title = label;
    const panel = document.createElement('div'); panel.className = 'selection-popup-menu selection-menu'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', label + ' controls');
    details.append(summary, panel); scroll.insertBefore(details, more); popovers.push(details); summary.setAttribute('aria-expanded', 'false'); bind(details); build(panel); return details;
  }
  function choices(panel, label, values, value, action) {
    const group = document.createElement('div'); group.className = 'selection-segments'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
    for (const [v, title] of values) { const b = document.createElement('button'); b.type = 'button'; b.textContent = title; b.setAttribute('aria-pressed', String(v === value)); b.onclick = () => { action(v); [...group.children].forEach(el => el.setAttribute('aria-pressed', String(el === b))); }; group.append(b); }
    panel.append(group);
  }
  const surfaces = new Map();
  function positionMenus() { for (const surface of surfaces.values()) surface.position(); }
  function bind(details) {
    const surface = createPopup({ trigger: details.firstElementChild, menu: details.lastElementChild, portal: details.classList.contains('selection-submenu'), role: 'dialog', placement: details.classList.contains('selection-submenu') ? 'right' : 'bottom', onToggle(on) { details.open = on; if (on) { for (const [other, pop] of surfaces) if (other !== details && !other.contains(details) && !pop.menu.contains(details)) pop.close(); } changed(); } });
    surfaces.set(details, surface);
    details.addEventListener('toggle', () => { if (!details.open) surface.close(); });
  }
  // Popups built by the toolbar are bound as they are added.
  bind(more);
  scroll.addEventListener('scroll', positionMenus); addEventListener('resize', positionMenus);
  return { button, input, select, stepper, popup, choices, section, more, positionMenus, close: () => surfaces.forEach(pop => pop.close()), destroy() { surfaces.forEach(pop => pop.destroy()); removeEventListener('resize', positionMenus); } };
}
