/** Compatibility declaration for the existing shared menu, matching lib/ui/menu.js. */
declare module '*lib/ui/menu.js' {
  interface MenuItem {
    readonly title: string;
    readonly run?: (event: MouseEvent) => void;
  }
  export function createMenu(options: {
    readonly trigger: HTMLElement;
    readonly bindTrigger?: boolean;
    readonly label: string;
    readonly heading?: string;
    readonly items: () => readonly MenuItem[];
    readonly onToggle?: (opened: boolean) => void;
  }): {
    readonly opened: boolean;
    readonly menu: HTMLElement;
    readonly open: (event: Event) => void;
    readonly close: (restoreFocus?: boolean, instant?: boolean) => void;
    readonly destroy: () => void;
  };
}
declare module '*lib/ui/dropdown.js' {
  export function mountDropdowns(): void;
}
