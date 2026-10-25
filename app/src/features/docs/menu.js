import { createMenu } from '../../lib/ui/menu.js';

export function chooser(label, items, change) {
  const root = document.createElement('div'); root.className = 'docs-choice'; root.dataset.chooser = label;
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'aegis-dropdown'; trigger.setAttribute('aria-label', label);
  const menu = document.createElement('div'); root.append(trigger, menu);
  let value = items[0][0];
  const popup = createMenu({ trigger, menu, portal: false, label: `${label} choices`, items: () => items.map(([key, title]) => ({ title, checked: key === value, run() { root.value = key; root.onchange?.(); } })) });
  Object.defineProperty(root, 'value', { get: () => value, set: next => {
    value = next; trigger.dataset.value = next;
    const text = document.createElement('span'); text.className = 'aegis-dropdown-value'; text.textContent = items.find(([key]) => key === next)?.[1] ?? label;
    trigger.replaceChildren(text); trigger.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6.5 3 3 3-3"/></svg>');
  } });
  trigger.addEventListener('keydown', event => {
    if (!popup.opened && event.key.length === 1 && !event.metaKey && !event.ctrlKey && event.key !== ' ') {
      event.preventDefault(); event.stopPropagation(); popup.open(event); popup.key(event);
    }
  });
  root.value = value; root.onchange = () => change(root.value); root.close = popup.close;
  return root;
}
