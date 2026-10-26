// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { createPopup } from '../../lib/ui/dropdown.js';
import { colorName, normHex, hex2hsv, hsv2rgb, rgb2hex, boardColours } from './model.js';
import { node, button, field } from '../media/dom.js';
let closeEditor = () => {};
export function colourEditor({ hex = '#ff9ec4', name, autoName = true, at = null, trigger = null, apply, save = null, board, options = {} }) {
  closeEditor();
  let colour = normHex(hex) || '#ff9ec4', label = name || colorName(colour), automatic = autoName, hsv = hex2hsv(colour);
  const pop = node('div', 'colour-pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Colour editor');
  const title = node('strong', '', 'Colour editor'), wheelWrap = node('div', 'colour-wheel-wrap'), wheel = node('canvas', 'colour-wheel'), ring = node('i', 'colour-ring');
  wheel.width = wheel.height = 220; wheel.tabIndex = 0; wheel.setAttribute('role', 'slider'); wheel.setAttribute('aria-label', 'Hue and saturation');
  wheel.setAttribute('aria-valuemin', '0'); wheel.setAttribute('aria-valuemax', '359');
  const instructions = node('p', 'colour-instructions', 'Drag to choose hue and saturation. Arrow keys change hue. Shift + arrows change saturation. Brightness is separate.');
  instructions.id = 'colour-instructions'; wheel.setAttribute('aria-describedby', instructions.id);
  const result = node('div', 'colour-result'), sample = node('i'), value = node('output');
  sample.setAttribute('aria-hidden', 'true'); value.setAttribute('aria-label', 'Selected colour');
  result.append(sample, value);
  wheelWrap.append(wheel, ring); pop.append(title, wheelWrap, instructions, result);
  const hue = field('Hue', 'range', String(hsv.h), pop); hue.min = '0'; hue.max = '359'; hue.step = '1';
  const saturation = field('Saturation', 'range', String(hsv.s * 100), pop); saturation.min = '0'; saturation.max = '100'; saturation.step = '1';
  for (const input of [hue, saturation]) input.parentElement.append(node('output'));
  const brightness = field('Brightness', 'range', String(hsv.v * 100), pop); brightness.min = '0'; brightness.max = '100'; brightness.step = '1';
  brightness.parentElement.append(node('output'));
  const hexInput = field('Hex', 'text', colour.toUpperCase(), pop), nameInput = name === null ? null : field('Colour name', 'text', label, pop);
  const quick = node('div', 'colour-quick'); pop.append(quick);
  let all = false;
  const quickRows = () => {
    quick.replaceChildren();
    const rows = [{ hex: '#000000', name: 'Black' }, { hex: '#ffffff', name: 'White' }, ...boardColours(board())].filter((p, i, a) => a.findIndex(v => v.hex === p.hex) === i);
    for (const p of all ? rows : rows.slice(0, 16)) { const b = button('', () => setHex(p.hex), quick); b.classList.add('colour-swatch'); b.dataset.hex = p.hex; b.setAttribute('aria-pressed', String(p.hex.toLowerCase() === colour.toLowerCase())); b.style.background = p.hex; b.title = p.name; b.setAttribute('aria-label', p.name); }
    if (rows.length > 16) button(all ? 'Fewer' : 'All board colours', () => { all = !all; quickRows(); }, quick);
  };
  const drawField = () => {
    const g = wheel.getContext('2d'), img = g.createImageData(220, 220);
    for (let y = 0; y < 220; y++) for (let x = 0; x < 220; x++) {
      const dx = x - 109.5, dy = y - 109.5, radius = Math.hypot(dx, dy), i = (y * 220 + x) * 4;
      if (radius > 110) continue;
      img.data.set([...hsv2rgb((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, Math.min(1, radius / 110), 1), 255], i);
    }
    g.putImageData(img, 0, 0);
  };
  const draw = () => {
    const h = Math.round(hsv.h) % 360, s = Math.round(hsv.s * 100), v = Math.round(hsv.v * 100);
    hue.value = String(h); saturation.value = String(s); brightness.value = String(v);
    for (const [input, text] of [[hue, `${h} degrees`], [saturation, `${s}% saturation`], [brightness, `${v}% brightness`]]) {
      input.setAttribute('aria-valuetext', text); input.parentElement.querySelector('output').textContent = text;
    }
    value.textContent = colour.toUpperCase(); sample.style.background = colour;
    wheel.setAttribute('aria-valuenow', String(h));
    wheel.setAttribute('aria-valuetext', `Hue ${h} degrees, saturation ${s}%, brightness ${v}%. ${colour.toUpperCase()}`);
    const a = hsv.h * Math.PI / 180;
    Object.assign(ring.style, { left: 110 + Math.cos(a) * hsv.s * 110 + 'px', top: 110 + Math.sin(a) * hsv.s * 110 + 'px', background: colour });
    hexInput.value = colour.toUpperCase(); if (nameInput) nameInput.value = label;
  };
  const commit = () => apply({ hex: colour, label, autoName: automatic });
  const setHex = h => {
    colour = h; hsv = hex2hsv(h);
    const named = board().palette?.find(p => p.hex === h);
    if (automatic) label = named?.name || colorName(h);
    draw(); commit(); quick.querySelectorAll('[data-hex]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hex.toLowerCase() === colour.toLowerCase())));
  };
  const fromHSV = () => { colour = rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)); if (automatic) label = board().palette?.find(p => p.hex === colour)?.name || colorName(colour); draw(); };
  const point = e => { const r = wheel.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2; hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; hsv.s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2)); fromHSV(); };
  wheel.onpointerdown = e => { wheel.setPointerCapture(e.pointerId); point(e); e.preventDefault(); };
  wheel.onpointermove = e => { if (wheel.hasPointerCapture(e.pointerId)) point(e); };
  wheel.onpointerup = e => { if (wheel.hasPointerCapture(e.pointerId)) { wheel.releasePointerCapture(e.pointerId); commit(); } };
  wheel.onkeydown = e => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return; e.preventDefault(); const d = ['ArrowRight','ArrowUp'].includes(e.key) ? 1 : -1; if (e.shiftKey) hsv.s = Math.max(0, Math.min(1, hsv.s + d * .02)); else hsv.h = (hsv.h + d * 3 + 360) % 360; fromHSV(); commit(); };
  hue.oninput = () => { hsv.h = Number(hue.value); fromHSV(); }; hue.onchange = commit;
  saturation.oninput = () => { hsv.s = Number(saturation.value) / 100; fromHSV(); }; saturation.onchange = commit;
  brightness.oninput = () => { hsv.v = Number(brightness.value) / 100; fromHSV(); }; brightness.onchange = commit;
  hexInput.onchange = () => { const hex = normHex(hexInput.value); if (hex) { hexInput.setCustomValidity(''); setHex(hex); } else { hexInput.setCustomValidity('Enter a three or six-digit hex colour'); hexInput.reportValidity(); } };
  if (nameInput) nameInput.oninput = () => { label = nameInput.value.trim() || colorName(colour); automatic = false; commit(); };
  if (options.swatch) for (const [key, text] of [['hideName', 'Show name'], ['hideHex', 'Show hex']]) {
    const check = field(text, 'checkbox', '', pop); check.checked = !options.swatch[key]; check.onchange = () => options.toggle(key, !check.checked);
  }
  if (save) button('Save to board colours', () => save({ hex: colour, name: label }), pop);
  button('Done', () => closeEditor(), pop);
  (trigger?.closest('dialog[open]') ?? document.body).append(pop);
  const previous = document.activeElement;
  const r = at || { right: innerWidth / 2 - 142, top: 100 };
  const boardId = board().id;
  const timer = setInterval(() => { if (board().id !== boardId) closeEditor(); }, 300);
  const popup = createPopup({ trigger, menu: pop, portal: true, role: 'dialog', bindTrigger: false, onToggle(on) {
    if (!on) { pop.remove(); clearInterval(timer); closeEditor = () => {}; if (previous?.isConnected) previous.focus({ preventScroll: true }); }
  } });
  closeEditor = () => popup.destroy();
  popup.open(undefined, { x: r.right + 12, y: r.top });
  quickRows(); drawField(); draw(); hexInput.focus();
}
