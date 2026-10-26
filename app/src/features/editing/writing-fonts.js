import { createCombobox } from '../../lib/ui/dropdown.js';

const names = { 'Inter Variable': 'Inter', 'system-ui': 'System', 'sans-serif': 'Sans serif', serif: 'Serif', monospace: 'Monospace' };
const normalise = font => String(font).replace(/["']/g, '').trim();
const implementationFont = /KaTeX|MathJax|MJX|STIX|Latin Modern Math|Cambria Math|Asana Math|Symbol|Wingdings|Webdings|Font\s*Awesome|Material\s*(?:Icons|Symbols)|LastResort|Emoji|^(?:\.|g_d\d+_f)/i;
export const writingFont = font => !!normalise(font) && !implementationFont.test(normalise(font));
export const fontName = font => names[normalise(font)] || normalise(font);
export const fontFamily = font => ['system-ui', 'serif', 'sans-serif', 'monospace'].includes(font) ? font : `"${normalise(font)}"`;

export function writingFonts(extra = []) {
  const fonts = new Set(['Inter Variable', 'system-ui', 'Arial', 'Helvetica Neue', 'Georgia', 'Times New Roman', 'Menlo', 'monospace', 'sans-serif', 'serif', ...extra]);
  document.fonts.forEach(font => fonts.add(normalise(font.family)));
  return [...fonts].filter(writingFont);
}

export function writingFontChooser(extra = []) {
  const fonts = writingFonts(extra), byName = new Map(fonts.map(font => [fontName(font), font]));
  const input = createCombobox({ label: 'Font family', options: [...byName.keys()] });
  const menu = input.dropdown.menu;
  // Font previews belong to this chooser, so other editable dropdowns stay plain.
  const previews = () => {
    for (const row of menu.querySelectorAll('[role=option]')) row.style.fontFamily = fontFamily(byName.get(row.dataset.label));
  };
  const observer = new MutationObserver(previews); observer.observe(menu, { childList: true }); previews();
  Object.defineProperty(input, 'fontFamily', { get: () => {
    const font = byName.get(input.value) || input.value.trim();
    return writingFont(font) ? font : '';
  } });
  input.setFont = font => { input.value = fontName(font); };
  input.destroy = () => { observer.disconnect(); input.dropdown.destroy(); };
  return input;
}
