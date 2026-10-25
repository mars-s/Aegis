// The feature registry: features add tools, panels, commands and context-menu items here, so they never have to
// edit the controller. The controller reads this registry once at start (and features may register later too).
export type PlaceAt = { x: number; y: number };
export type Ctx = {
  /** Apply board commands (optimistic on screen, then saved). done gets the created ids. */
  apply(commands: unknown[], done?: (created: Record<string, string>) => void): void;
  canvas: any;
  host: any;
  toast(message: string): void;
  /** The current selection's ids. */
  selection(): string[];
};
export type Tool = {
  id: string;
  title: string;
  /** Single key, lower case, unused by others: v n h c r l m are taken. */
  key?: string;
  /** 16x16 SVG inner markup (stroke icons). */
  icon: string;
  /** Click on empty canvas with the tool armed. Return true to keep the tool armed. */
  place?(at: PlaceAt, ctx: Ctx): void | boolean;
  /** Pressing the button does this instead of arming (e.g. opens a picker). */
  activate?(ctx: Ctx): void;
  /** Pointer-driven tools (pen, draw): take over pointer events on the stage while armed. */
  pointer?: { down(e: PointerEvent, at: PlaceAt, ctx: Ctx): void; move(e: PointerEvent, at: PlaceAt, ctx: Ctx): void; up(e: PointerEvent, at: PlaceAt, ctx: Ctx): void };
  /** Group in the tool bar; tools in the same group sit together. */
  group?: string;
};
export type Panel = { id: string; title: string; mount(el: HTMLElement, ctx: Ctx): void | (() => void); side?: 'left' | 'right'; order?: number };
export type Command = { id: string; title: string; keys?: string; run(ctx: Ctx): void; when?(ctx: Ctx): boolean };
export type MenuItem = { id: string; title: string; run(ctx: Ctx, cardIds: string[]): void; when?(ctx: Ctx, cardIds: string[]): boolean; section?: string };

export const tools: Tool[] = [];
export const panels: Panel[] = [];
export const commands: Command[] = [];
export const cardMenu: MenuItem[] = [];
export const boardMenu: MenuItem[] = [];
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(f => f());
export const onRegistryChange = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };
const put = <T extends { id: string }>(list: T[], item: T) => { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); changed(); };
export const registerTool = (t: Tool) => put(tools, t);
export const registerPanel = (p: Panel) => put(panels, p);
export const registerCommand = (c: Command) => put(commands, c);
export const registerCardMenu = (m: MenuItem) => put(cardMenu, m);
export const registerBoardMenu = (m: MenuItem) => put(boardMenu, m);
