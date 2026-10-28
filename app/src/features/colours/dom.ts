export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
export function button(text: string, action: (event: MouseEvent) => void, parent?: HTMLElement): HTMLButtonElement {
  const element = node('button', '', text); element.type = 'button';
  element.onclick = event => { event.stopPropagation(); action(event); };
  parent?.append(element); return element;
}
export function field(label: string, type: string, value: string, parent: HTMLElement): HTMLInputElement {
  const wrap = node('label', 'media-field', label), input = node('input'); input.type = type; input.value = value;
  input.setAttribute('aria-label', label); wrap.append(input); parent.append(wrap); return input;
}
