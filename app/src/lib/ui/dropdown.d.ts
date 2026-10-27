export interface Popup {
  readonly menu: HTMLElement;
  readonly opened: boolean;
  open(event?: Event): void;
  close(focus?: boolean, instant?: boolean): void;
  position(): void;
  destroy(): void;
}
export type DropdownOption = readonly [string, string];
export interface Dropdown extends HTMLButtonElement {
  value: string;
  readonly dropdown: Popup;
  setOptions(options: readonly DropdownOption[]): void;
}
export interface Combobox extends HTMLInputElement { readonly dropdown: Popup }
export function createDropdown(options: { readonly label: string; readonly options: readonly DropdownOption[]; readonly value?: string; readonly onChange: (value: string) => void }): Dropdown;
export function createCombobox(options: { readonly label: string; readonly options: readonly string[] }): Combobox;
export function createPopup(options: { readonly trigger: HTMLElement; readonly menu: HTMLElement; readonly portal?: boolean; readonly role?: string; readonly duration?: number; readonly onToggle?: (opened: boolean) => void }): Popup;
export function bindDisclosure(details: HTMLDetailsElement, options: { readonly label?: string; readonly role?: string }): Popup;
export function mountDropdowns(): void;
