import './stepper.css';

export function createStepper({ label, value = '', min = -Infinity, max = Infinity, step = 1, next, onChange = () => {} }) {
  const el = document.createElement('span'); el.className = 'aegis-stepper'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', `${label} adjustment`);
  const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'decimal'; input.value = value ?? ''; input.setAttribute('aria-label', label); input.title = label;
  function commit(value) {
    const number = Number(value);
    if (String(value).trim() === '' || !Number.isFinite(number)) { input.value = current; return; }
    current = String(Math.round(Math.max(min, Math.min(max, number)) * 100) / 100); input.value = current; onChange(current);
  }
  let current = input.value;
  input.onfocus = () => { current = input.value; };
  function move(direction, multiplier = 1) { commit(next ? next(Number(input.value), direction) : Number(input.value) + direction * step * multiplier); }
  input.onchange = () => commit(input.value);
  input.onkeydown = event => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey ? 10 : 1); } };
  for (const [name, direction, path] of [['Decrease', -1, 'M4 8h8'], ['Increase', 1, 'M4 8h8M8 4v8']]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'aegis-button aegis-button--quiet'; button.setAttribute('aria-label', `${name} ${label.toLowerCase()}`);
    button.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${path}"/></svg>`; button.onclick = () => move(direction); el.append(button); if (direction < 0) el.append(input);
  }
  return { el, input, setValue(value) { current = String(value ?? ''); input.value = current; } };
}
