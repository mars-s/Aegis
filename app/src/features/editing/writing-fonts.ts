import { createCombobox } from '../../lib/ui/dropdown.js';
import type { Combobox } from '../../lib/ui/dropdown.js';
import { fontFamily, fontName, writingFont, writingFonts } from './writing-fonts-model.js';

export interface FontChooser {
  readonly input: Combobox;
  /** The chosen writing font, or empty when the typed name is not usable. */
  fontFamily(): string;
  setFont(font: string): void;
  destroy(): void;
}

export function writingFontChooser(extra: readonly string[] = []): FontChooser {
  const byName = new Map(writingFonts(extra).map(font => [fontName(font), font]));
  const input = createCombobox({ label: 'Font family', options: [...byName.keys()] });
  const menu = input.dropdown.menu;
  // Font previews belong to this chooser, so other editable dropdowns stay plain.
  const previews = (): void => {
    for (const row of menu.querySelectorAll<HTMLElement>('[role=option]')) {
      const font = byName.get(row.dataset.label ?? '');
      if (font) row.style.fontFamily = fontFamily(font);
    }
  };
  const observer = new MutationObserver(previews);
  observer.observe(menu, { childList: true });
  previews();
  return {
    input,
    fontFamily() {
      const font = byName.get(input.value) ?? input.value.trim();
      return writingFont(font) ? font : '';
    },
    setFont(font) { input.value = fontName(font); },
    destroy() { observer.disconnect(); input.dropdown.destroy(); },
  };
}
