// TODO(item 5): swap these local controls for lib/ui/dropdown.js after the canvas worker lands it.
export function chooser(label, items, change) {
  const root = document.createElement('div'); root.className = 'docs-choice'; root.dataset.chooser = label;
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.setAttribute('aria-label', label); trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div'); menu.className = 'docs-choice-options'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `${label} choices`); menu.hidden = true;
  let value = items[0][0], search = '', lastKey = 0;
  const options = items.map(([key, text]) => {
    const option = document.createElement('button'); option.type = 'button'; option.setAttribute('role', 'menuitemradio'); option.textContent = text;
    option.onclick = () => { root.value = key; close(); root.onchange?.(); trigger.focus({ preventScroll: true }); };
    menu.append(option); return option;
  });
  Object.defineProperty(root, 'value', { get: () => value, set: next => {
    value = next; trigger.dataset.value = next;
    trigger.textContent = `${items.find(([key]) => key === next)?.[1] ?? label} ▾`;
    options.forEach((option, i) => option.setAttribute('aria-checked', String(items[i][0] === next)));
  } });
  root.value = value; root.onchange = () => change(root.value);
  function close() { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
  function open(keyboard) {
    root.closest('.docs-panel')?.querySelectorAll('.docs-choice').forEach(other => { if (other !== root) other.close?.(); });
    menu.hidden = false; menu.classList.toggle('instant', keyboard); trigger.setAttribute('aria-expanded', 'true');
    options[Math.max(0, items.findIndex(([key]) => key === value))].focus({ preventScroll: true });
  }
  trigger.onclick = event => menu.hidden ? open(event.detail === 0) : close();
  root.onkeydown = event => {
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); event.stopPropagation(); close(); trigger.focus(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (menu.hidden) return open(true);
      const index = options.indexOf(document.activeElement), step = event.key === 'ArrowUp' ? -1 : 1;
      options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + step + options.length) % options.length].focus();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && event.key !== ' ') {
      event.preventDefault(); const now = Date.now(); search = now - lastKey > 700 ? event.key : search + event.key; lastKey = now;
      if (menu.hidden) open(true);
      options.find(option => option.textContent.toLowerCase().startsWith(search.toLowerCase()))?.focus();
    }
  };
  root.onfocusout = () => queueMicrotask(() => { if (!root.contains(document.activeElement)) close(); });
  root.close = close; root.append(trigger, menu); return root;
}
