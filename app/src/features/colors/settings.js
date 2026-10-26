// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { normHex } from './model.js';
import { node, button } from '../media/dom.js';
const storageKey = 'aegis:colour-settings';
const keys = ['bg', 'dot', 'panel', 'accent'];
const tokens = { bg: '--canvas', dot: '--dot', panel: '--card', accent: '--accent' };
function readSettings() {
  const clean = { light: {}, dark: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    for (const mode of ['light','dark']) for (const key of keys) {
      const hex = normHex(saved?.[mode]?.[key]); if (hex) clean[mode][key] = hex;
    }
  } catch { /* Invalid preferences fall back to the app colours. */ }
  return clean;
}
export function contrastText(hex) {
  const rgb = [1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? '#111111' : '#ffffff';
}
export function installColourSettings(ctx) {
  const settings = document.getElementById('settings'); if (!settings || settings.querySelector('[data-colour-settings]')) return;
  const root = document.documentElement, section = node('section', 'sheet-sec colour-settings'); section.dataset.colourSettings = '';
  section.append(node('h3', '', 'Board colours'), node('p', 'muted', 'App colours are saved separately for light and dark mode. A board background takes priority.'));
  const data = readSettings(), owned = new Set(), inputs = new Map(), modeText = node('small', 'muted'); section.append(modeText);
  const currentMode = () => root.dataset.theme === 'dark' ? 'dark' : 'light';
  const liveHex = key => {
    const probe = document.createElement('span'); probe.style.color = `var(${tokens[key]})`; root.append(probe);
    const colour = getComputedStyle(probe).color; probe.remove();
    const rgb = colour.match(/[\d.]+/g)?.slice(0, 3);
    return rgb?.length === 3 ? '#' + rgb.map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join('') : '#000000';
  };
  const apply = () => {
    for (const key of owned) root.style.removeProperty(key); owned.clear();
    const values = data[currentMode()], set = (name, value) => { root.style.setProperty(name, value); owned.add(name); };
    if (values.bg) set('--canvas', values.bg);
    if (values.dot) set('--dot', values.dot);
    if (values.panel) {
      const text = contrastText(values.panel), light = text === '#111111';
      set('--bg', values.panel); set('--card', values.panel); set('--text', text);
      set('--muted', light ? '#56565d' : '#c4c4cd'); set('--faint', light ? '#73737a' : '#a0a0ac');
      set('--line', light ? '#00000020' : '#ffffff30'); set('--line-strong', light ? '#00000040' : '#ffffff50');
      set('--hover', light ? '#0000000a' : '#ffffff12'); set('--press', light ? '#00000015' : '#ffffff20');
    }
    if (values.accent) { set('--accent', values.accent); set('--on-accent', contrastText(values.accent)); }
    ctx.canvas.redraw();
  };
  const showValue = input => { input.closest('label').querySelector('output').textContent = input.value.toUpperCase(); };
  const refresh = () => { const mode = currentMode(); modeText.textContent = `Editing ${mode} mode`; for (const [key, input] of inputs) { input.value = data[mode][key] || liveHex(key); showValue(input); } };
  for (const [key, title] of [['bg','App board background'],['dot','Grid dots'],['panel','Panels'],['accent','Accent']]) {
    // PM4.8: the full labelled row activates the native colour input.
    const label = node('label', 'settings-colour'), swatch = node('span', 'settings-colour-swatch'), input = node('input');
    input.type = 'color'; input.setAttribute('aria-label', title); inputs.set(key, input);
    swatch.append(input); label.append(swatch, node('span', 'settings-colour-name', title), node('output')); section.append(label);
    input.oninput = () => { data[currentMode()][key] = input.value; showValue(input); localStorage.setItem(storageKey, JSON.stringify(data)); apply(); };
  }
  button('Reset colours for this mode', () => { data[currentMode()] = {}; localStorage.setItem(storageKey, JSON.stringify(data)); apply(); refresh(); }, section);
  settings.append(section);
  const observer = new MutationObserver(() => { apply(); refresh(); }); observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  apply(); refresh();
  return () => { observer.disconnect(); section.remove(); for (const key of owned) root.style.removeProperty(key); };
}
