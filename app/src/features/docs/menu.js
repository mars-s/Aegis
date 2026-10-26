import { createDropdown } from '../../lib/ui/dropdown.js';

export function chooser(label, items, change) {
  const root = document.createElement('div'); root.className = 'docs-choice'; root.dataset.chooser = label;
  const trigger = createDropdown({ label, options: items, onChange: value => { root.value = value; root.onchange?.(); } });
  root.append(trigger);
  Object.defineProperty(root, 'value', { get: () => trigger.value, set: value => { trigger.value = value; trigger.dataset.value = value; } });
  root.onchange = () => change(root.value); root.close = trigger.dropdown.close;
  return root;
}
