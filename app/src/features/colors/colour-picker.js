export function createColourPicker({ label, value, board, onChange }) {
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'aegis-button aegis-colour-picker'; trigger.setAttribute('aria-label', label);
  const swatch = document.createElement('span'); swatch.className = 'aegis-colour-sample'; swatch.setAttribute('aria-hidden', 'true');
  const caption = document.createElement('span'); trigger.append(swatch, caption);
  let colour;
  Object.defineProperty(trigger, 'value', { get: () => colour, set(value) { colour = value; swatch.style.background = value; caption.textContent = value.toUpperCase(); } });
  trigger.value = value;
  trigger.onclick = async () => { const { colourEditor } = await import('./colour-editor.js'); colourEditor({ hex: colour, name: null, trigger, board, at: trigger.getBoundingClientRect(), apply({ hex }) { trigger.value = hex; onChange(hex); } }); };
  return trigger;
}
