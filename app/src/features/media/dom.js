import { createDialog } from '../../lib/ui/dialog.js';
export function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
export function button(text, action, parent) {
  const el = node('button', '', text); el.type = 'button';
  el.onclick = e => { e.stopPropagation(); action(e); };
  parent?.append(el); return el;
}
export function field(label, type, value, parent) {
  const wrap = node('label', 'media-field', label), input = node('input'); input.type = type; input.value = value;
  input.setAttribute('aria-label', label); wrap.append(input); parent.append(wrap); return input;
}
export function dialog(title) {
  document.querySelector('.media-dialog')?.close();
  const el = createDialog({ className: 'media-dialog', label: title }), heading = node('h2', '', title); el.append(heading); document.body.append(el);
  el.addEventListener('close', () => el.remove(), { once: true });
  el.showModal(); return el;
}
