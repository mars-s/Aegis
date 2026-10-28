import type { Combobox } from '../../lib/ui/dropdown.js';
import { createCombobox } from '../../lib/ui/dropdown.js';

import { writingFont, fontName, fontFamily, writingFonts } from './writing-fonts-model.js';
export { writingFont, fontName, fontFamily, writingFonts } from './writing-fonts-model.js';
export interface FontChooser extends Combobox { readonly fontFamily: string; readonly setFont: (font: string) => void; readonly destroy: () => void }
export function writingFontChooser(extra: readonly string[] = []): FontChooser {
  const fonts = writingFonts(extra), byName = new Map(fonts.map(font => [fontName(font), font]));
  const input = createCombobox({ label: 'Font family', options: [...byName.keys()] });
  const menu = input.dropdown.menu;
  // Font previews belong to this chooser, so other editable dropdowns stay plain.
  const previews = () => {
    for (const row of menu.querySelectorAll<HTMLElement>('[role=option]')) row.style.fontFamily = fontFamily(byName.get(row.dataset.label ?? '') ?? '');
  };
  const observer = new MutationObserver(previews); observer.observe(menu, { childList: true }); previews();
  const chooser = Object.assign(input, { fontFamily: '', setFont: (font: string) => { input.value = fontName(font); }, destroy: () => { observer.disconnect(); input.dropdown.destroy(); } });
  Object.defineProperty(chooser, 'fontFamily', { get: () => {
    const font = byName.get(input.value) || input.value.trim();
    return writingFont(font) ? font : '';
  } });
  return chooser;
}
