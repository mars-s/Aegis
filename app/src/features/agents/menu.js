// Source selects stay hidden for settings sync; the shared popup owns placement and input.
import { createPopup } from '../../lib/ui/dropdown.js';
export function mountIslandMenu({ island, current, shortTitle, agents, newAgent, show, showAll }) {
  const button = document.getElementById('orbMenuButton'), menu = document.getElementById('orbMenu');
  const source = document.getElementById('model'), count = document.getElementById('count');
  const popup = createPopup({ trigger: button, menu, portal: true, onToggle(on) {
    if (on) { render(); menu.querySelector('button')?.focus({ preventScroll: true }); }
  } });
  const close = (focus = false) => popup.close(focus);
  function item(label, run, { value, checked, submenu = false, description, parent = menu } = {}) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', checked === undefined ? 'menuitem' : 'menuitemradio');
    if (checked !== undefined) b.setAttribute('aria-checked', String(checked));
    if (submenu) b.setAttribute('aria-haspopup', 'menu');
    if (description) b.setAttribute('aria-description', description);
    const title = document.createElement('span'); title.textContent = label; b.append(title);
    if (value) { const v = document.createElement('span'); v.className = 'orb-menu-value'; v.textContent = value; b.append(v); }
    if (checked) b.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>');
    b.onclick = run; parent.append(b); return b;
  }
  function choices(label, options, value, set) {
    menu.replaceChildren(); menu.setAttribute('aria-label', label);
    item('Back to agent options', () => { render(); popup.position(); menu.querySelector('button')?.focus({ preventScroll: true }); });
    const groups = new Map();
    for (const o of options) {
      let parent = menu;
      if (o.dataset.group) {
        if (!groups.has(o.dataset.group)) {
          const group = document.createElement('div'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', `${o.dataset.group}, ${o.dataset.groupDescription}`);
          const heading = document.createElement('div'); heading.className = 'aegis-model-group'; heading.setAttribute('aria-hidden', 'true');
          for (const text of [o.dataset.group, o.dataset.groupDescription]) { const span = document.createElement('span'); span.textContent = text; heading.append(span); }
          group.append(heading); groups.set(o.dataset.group, group); menu.append(group);
        }
        parent = groups.get(o.dataset.group);
      }
      item(o.textContent, () => { set(o.value); close(true); }, { checked: o.value === value, description: o.getAttribute('aria-description'), parent });
    }
    popup.position();
    menu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
  }
  function render() {
    menu.replaceChildren(); menu.setAttribute('aria-label', 'Agent options');
    item('Agent model', () => choices('Agent model', source.options, source.value, value => {
      source.value = value; source.dispatchEvent(new Event('change'));
      // A model change applies to a new conversation, leaving existing agents on their model.
      newAgent();
    }), { value: source.selectedOptions[0]?.textContent, submenu: true });
    item('Agent count', () => choices('Agent count', count.options, count.value, value => { count.value = value; }), { value: count.selectedOptions[0]?.textContent, submenu: true });
    const statusValue = localStorage.getItem('aegis:status-model');
    item('Status model', () => choices('Status model', source.options, statusValue, value => {
      localStorage.setItem('aegis:status-model', value); document.dispatchEvent(new Event('aegis-models'));
    }), { value: [...source.options].find(o => o.value === statusValue)?.textContent, submenu: true });
    menu.append(document.createElement('hr'));
    item('Add as notes', () => {
      close(); document.getElementById('composer').dispatchEvent(new Event('add-as-notes'));
    }, { value: '⌘Return / Ctrl+Return' });
    item('New agent', newAgent);
    item('All agents', () => { close(); showAll(); });
    for (const a of agents()) item(shortTitle(a), () => { close(); show(a.id); }, { value: a.running ? 'Working' : 'Ready', checked: current()?.id === a.id });
  }
  island.addEventListener('focusout', e => {
    if (island.contains(e.relatedTarget) || menu.contains(e.relatedTarget)) return;
    setTimeout(() => { if (!island.contains(document.activeElement) && !menu.contains(document.activeElement)) close(); }, 0);
  });
  return { close, keydown: popup.key, contains: target => menu.contains(target) };
}
