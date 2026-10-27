import type { Popup } from '../../lib/ui/dropdown.js';
export function writingFont(font: string): boolean;
export function fontName(font: string): string;
export function fontFamily(font: string): string;
export function writingFonts(extra?: readonly string[]): string[];
export interface FontChooser extends HTMLInputElement {
  readonly fontFamily: string;
  readonly dropdown: Popup;
  setFont(font: string): void;
  destroy(): void;
}
export function writingFontChooser(extra?: readonly string[]): FontChooser;
