// Shared shortcut copy for handlers, menus, reference and onboarding.
const entries = {
  ask: ['Ask', '⌘K', 'Ctrl+K'],
  askSlash: ['Ask', '/'],
  quickCapture: ['Quick capture', '⇧⌘K', 'Shift+Ctrl+K'],
  addNotes: ['Add as notes in Ask', '⌘Return', 'Ctrl+Return'],
  justBoard: ['Just the board', '⌘\\', 'Ctrl+\\'],
  leftSidebar: ['Windows and library', '⌘[', 'Ctrl+['],
  rightSidebar: ['Agent activity', '⌘]', 'Ctrl+]'],
  stackBack: ['Send selection backward', '⌥⌘[', 'Ctrl+Alt+['],
  stackForward: ['Bring selection forward', '⌥⌘]', 'Ctrl+Alt+]'],
  stackToBack: ['Send selection to back', '⇧⌥⌘[', 'Shift+Ctrl+Alt+['],
  stackToFront: ['Bring selection to front', '⇧⌥⌘]', 'Shift+Ctrl+Alt+]'],
  sidebar: ['Side bar', '\\'],
  focus: ['Focus selection', 'F'],
  follow: ['Follow agents', 'Shift+F'],
  agents: ['Agents', 'A'],
  pan: ['Pan', 'Space+drag'],
  zoom: ['Zoom', '⌘+scroll', 'Ctrl+scroll'],
  fit: ['Fit board', '0'],
  fitShift: ['Fit board', 'Shift+1'],
  resetZoom: ['100% zoom', '⌘0', 'Ctrl+0'],
  zoomIn: ['Zoom in', '⌘+', 'Ctrl++'],
  zoomOut: ['Zoom out', '⌘−', 'Ctrl+-'],
  newNote: ['New note', 'Double-click'],
  remove: ['Delete', '⌫', 'Delete'],
  undo: ['Undo', '⌘Z', 'Ctrl+Z'],
  redo: ['Redo', '⇧⌘Z', 'Shift+Ctrl+Z'],
  bold: ['Bold', '⌘B', 'Ctrl+B'],
  italic: ['Italic', '⌘I', 'Ctrl+I'],
  underline: ['Underline', '⌘U', 'Ctrl+U'],
  ungroup: ['Ungroup', '⇧⌘G', 'Shift+Ctrl+G'],
  duplicate: ['Duplicate', '⌘D', 'Ctrl+D'],
  select: ['Select', 'V'],
  note: ['Note', 'N'],
  title: ['Heading', 'H'],
  todo: ['Checklist', 'C'],
  readme: ['Read-me note', 'R'],
  link: ['Link', 'L'],
  media: ['Image or video', 'M'],
};
export const SHORTCUTS = Object.freeze(Object.fromEntries(Object.entries(entries).map(([id, [label, mac, pc = mac]]) => {
  const macText = mac.replace('⇧', 'Shift+').replace('⌥', 'Option+').replace('⌘', 'Cmd+');
  return [id, Object.freeze({ label, mac, pc, macText, display: mac === pc ? mac : `${mac} / ${pc}`, text: macText === pc ? macText : `${macText} / ${pc}` })];
})));
export const SHORTCUT_LIST = Object.freeze(['ask', 'askSlash', 'quickCapture', 'addNotes', 'justBoard', 'leftSidebar', 'rightSidebar', 'stackBack', 'stackForward', 'stackToBack', 'stackToFront', 'sidebar', 'newNote', 'pan', 'zoom', 'fit', 'focus', 'follow', 'agents', 'remove', 'undo', 'redo']);
export const shortcutText = (id, format = 'display') => SHORTCUTS[id][format];
export const shortcutTitle = (id, label = SHORTCUTS[id].label) => `${label} (${shortcutText(id, 'text')})`;
export const TOOL_SHORTCUTS = Object.freeze(['select', 'note', 'title', 'todo', 'readme', 'link', 'media']);

export const menuShortcut = id => shortcutText(id, /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'pc');
