// Transitional declaration for the existing shared menu. This describes the operations used here.
declare module '*lib/ui/menu.js' {
  export function createMenu(options: {
    readonly trigger: HTMLElement;
    readonly menu: HTMLElement;
    readonly label: string;
    readonly bindTrigger: boolean;
    readonly items: readonly { readonly title: string; readonly run: () => void; readonly destructive?: boolean }[];
    readonly onToggle: (open: boolean) => void;
  }): { readonly destroy: () => void; readonly open: (event: MouseEvent, point: { x: number; y: number }) => void };
}
declare module '*lib/ui/dropdown.js' {
  export function mountDropdowns(): void;
}
