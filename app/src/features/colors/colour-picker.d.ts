import type { Board } from '@aegis/domain';
export interface ColourPicker extends HTMLButtonElement { value: string }
export function createColourPicker(options: { readonly label: string; readonly value: string; readonly board: () => Board; readonly onChange: (value: string) => void }): ColourPicker;
