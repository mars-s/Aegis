// Temporary typed boundary to the existing shared controls, owned by integration.
// Signatures follow lib/ui/menu.js, dropdown.js and confirm.js, not a second implementation.
declare module "*lib/ui/menu.js" {
  export interface MenuItem {
    readonly title: string;
    readonly run?: (event: MouseEvent) => void;
    readonly items?: readonly MenuItem[] | (() => readonly MenuItem[]);
    readonly ariaLabel?: string;
    readonly checked?: boolean;
    readonly checkType?: "radio" | "checkbox";
    readonly section?: string;
    readonly shortcut?: string;
    readonly disabled?: boolean;
    readonly destructive?: boolean;
  }
  export interface Menu {
    readonly opened: boolean;
    readonly menu: HTMLElement;
    open(event?: Event, at?: { readonly x: number; readonly y: number }): void;
    close(focus?: boolean, instant?: boolean): void;
    setItems(items: readonly MenuItem[]): void;
    setTrigger(trigger: HTMLElement): void;
    destroy(): void;
  }
  export function createMenu(options: {
    readonly trigger?: HTMLElement;
    readonly menu?: HTMLElement;
    readonly items?: readonly MenuItem[] | (() => readonly MenuItem[]);
    readonly label?: string;
    readonly heading?: string;
    readonly portal?: boolean;
    readonly bindTrigger?: boolean;
    readonly placement?: string;
    readonly onToggle?: (open: boolean) => void;
  }): Menu;
}
declare module "*lib/ui/dropdown.js" {
  export interface Popup {
    readonly opened: boolean;
    open(event?: Event): void;
    close(focus?: boolean, instant?: boolean): void;
    position(): void;
    destroy(): void;
  }
  export function mountDropdowns(): void;
  export function createPopup(options: {
    readonly trigger: HTMLElement;
    readonly menu: HTMLElement;
    readonly portal?: boolean;
    readonly role?: string;
    readonly duration?: number;
    readonly onToggle?: (open: boolean) => void;
  }): Popup;
  export function bindDisclosure(
    details: HTMLDetailsElement,
    options: { readonly label: string; readonly role?: string },
  ): Popup;
}
declare module "*lib/ui/confirm.js" {
  export function confirmAction(options: {
    readonly title: string;
    readonly body?: string;
    readonly confirm?: string;
    readonly cancel?: string;
    readonly destructive?: boolean;
  }): Promise<boolean>;
}
