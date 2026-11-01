// Shared shortcut copy for handlers, menus, reference and onboarding.
const entries = {
  ask: ['Ask', '⌘K', 'Ctrl+K'],
  askSlash: ['Ask', '/'],
  quickCapture: ['Quick capture', '⇧⌘K', 'Shift+Ctrl+K'],
  justBoard: ['Just the board', '⌘\\', 'Ctrl+\\'],
  leftSidebar: ['Windows and library', '⌘[', 'Ctrl+['],
  rightSidebar: ['Agent activity', '⌘]', 'Ctrl+]'],
  stackBack: ['Send selection backward', '⌥⌘[', 'Ctrl+Alt+['],
  stackForward: ['Bring selection forward', '⌥⌘]', 'Ctrl+Alt+]'],
  stackToBack: ['Send selection to back', '⇧⌥⌘[', 'Shift+Ctrl+Alt+['],
  stackToFront: ['Bring selection to front', '⇧⌥⌘]', 'Shift+Ctrl+Alt+]'],
  sidebar: ['Side bar', '\\'],
  focus: ['Focus selection', 'F'],
  editorWidth: ['Toggle editor width', '⇧⌘F', 'Shift+Ctrl+F'],
  follow: ['Follow agents', 'Shift+F'],
  agents: ['Agents', 'A'],
  pan: ['Pan', 'Space+drag'],
  zoom: ['Zoom', '⌘+scroll', 'Ctrl+scroll'],
  fit: ['Fit board', '0'],
  fitShift: ['Fit board', 'Shift+1'],
  resetZoom: ['100% zoom', '⌘0', 'Ctrl+0'],
  zoomIn: ['Zoom in', '⌘+', 'Ctrl++'],
  zoomOut: ['Zoom out', '⌘−', 'Ctrl+-'],
  remove: ['Delete', '⌫', 'Delete'],
  undo: ['Undo', '⌘Z', 'Ctrl+Z'],
  redo: ['Redo', '⇧⌘Z', 'Shift+Ctrl+Z'],
  bold: ['Bold', '⌘B', 'Ctrl+B'],
  italic: ['Italic', '⌘I', 'Ctrl+I'],
  underline: ['Underline', '⌘U', 'Ctrl+U'],
  ungroup: ['Ungroup', '⇧⌘G', 'Shift+Ctrl+G'],
  duplicate: ['Duplicate', '⌘D', 'Ctrl+D'],
} as const satisfies Record<string, readonly [string, string] | readonly [string, string, string]>;
export type ShortcutId = keyof typeof entries;
export interface Shortcut { readonly label: string; readonly mac: string; readonly pc: string; readonly macText: string; readonly display: string; readonly text: string }
type Format = 'display' | 'text' | 'mac' | 'pc';
const ids = Object.keys(entries).filter((id): id is ShortcutId => id in entries);
function shortcut(entry: readonly [string, string] | readonly [string, string, string]): Shortcut {
  const [label, mac] = entry, pc = entry[2] ?? mac;
  const macText = mac.replace('⇧', 'Shift+').replace('⌥', 'Option+').replace('⌘', 'Cmd+');
  return Object.freeze({ label, mac, pc, macText, display: mac === pc ? mac : `${mac} / ${pc}`, text: macText === pc ? macText : `${macText} / ${pc}` });
}
function table(): Record<ShortcutId, Shortcut> {
  const result: Partial<Record<ShortcutId, Shortcut>> = {};
  for (const id of ids) result[id] = shortcut(entries[id]);
  const complete = (value: Partial<Record<ShortcutId, Shortcut>>): value is Record<ShortcutId, Shortcut> => ids.every(id => value[id] !== undefined);
  if (!complete(result)) throw new Error('Incomplete shortcut table');
  return result;
}
export const SHORTCUTS: Readonly<Record<ShortcutId, Shortcut>> = Object.freeze(table());
export const SHORTCUT_LIST: readonly ShortcutId[] = Object.freeze(['ask', 'askSlash', 'quickCapture', 'justBoard', 'leftSidebar', 'rightSidebar', 'stackBack', 'stackForward', 'stackToBack', 'stackToFront', 'sidebar', 'pan', 'zoom', 'fit', 'focus', 'follow', 'agents', 'remove', 'undo', 'redo']);
export const shortcutText = (id: ShortcutId, format: Format = 'display'): string => SHORTCUTS[id][format];
export const shortcutTitle = (id: ShortcutId, label: string = SHORTCUTS[id].label): string => `${label} (${shortcutText(id, 'text')})`;

export const menuShortcut = (id: ShortcutId): string => shortcutText(id, /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'pc');
