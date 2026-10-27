// Typed boundary to the existing integration-owned menu. No control implementation is forked.
declare module '*lib/ui/menu.js' {
  export interface MenuItem {
    readonly title: string;
    readonly run?: (event: MouseEvent) => void;
    readonly items?: readonly MenuItem[] | (() => readonly MenuItem[]);
    readonly ariaLabel?: string;
    readonly checked?: boolean;
    readonly checkType?: 'radio' | 'checkbox';
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
