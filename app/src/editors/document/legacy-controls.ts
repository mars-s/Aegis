// Signatures for the existing shared controls. Their DOM implementations remain shared during the port.
declare module "*lib/ui/dropdown.js" {
  export interface Popup {
    readonly menu: HTMLElement;
    readonly opened: boolean;
    readonly open: (event?: Event) => void;
    readonly close: (focus?: boolean) => void;
    readonly destroy: () => void;
  }
  export type DropdownOption = readonly [string, string];
  export interface Dropdown extends HTMLButtonElement {
    value: string;
    readonly dropdown: Popup;
    readonly setOptions: (options: readonly DropdownOption[]) => void;
  }
  export function createDropdown(options: {
    readonly label: string;
    readonly options: readonly DropdownOption[];
    readonly value?: string;
    readonly onChange: (value: string) => void;
  }): Dropdown;
  export function bindDisclosure(
    details: HTMLDetailsElement,
    options: { readonly label: string },
  ): Popup;
  export function mountDropdowns(): void;
}

declare module "*features/editing/writing-fonts.js" {
  export interface FontChooser extends HTMLInputElement {
    readonly fontFamily: string;
    readonly setFont: (font: string) => void;
    readonly destroy: () => void;
  }
  export function writingFontChooser(extra?: readonly string[]): FontChooser;
}

declare module "*lib/ui/orb-mark.js" {
  export function OrbMark(): string;
}

declare module "*features/colors/colour-picker.js" {
  import type { Board } from "@aegis/domain";
  export interface ColourPicker extends HTMLButtonElement {
    value: string;
  }
  export function createColourPicker(options: {
    readonly label: string;
    readonly value: string;
    readonly board: () => Board;
    readonly onChange: (colour: string) => void;
  }): ColourPicker;
}
