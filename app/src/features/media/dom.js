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
  const el = node('dialog', 'media-dialog'), heading = node('h2', '', title); el.append(heading); document.body.append(el);
  el.addEventListener('close', () => el.remove(), { once: true });
  el.addEventListener('click', e => { if (e.target === el && (e.clientX < el.getBoundingClientRect().left || e.clientX > el.getBoundingClientRect().right || e.clientY < el.getBoundingClientRect().top || e.clientY > el.getBoundingClientRect().bottom)) el.close(); });
  el.showModal(); return el;
}
