import { useState } from 'react';
import { z } from 'zod/v4';
import { SHORTCUTS, SHORTCUT_LIST, TOOL_SHORTCUTS } from '../lib/shortcuts.js';

const shortcuts = z.record(z.string(), z.object({ label: z.string(), mac: z.string(), display: z.string() })).parse(SHORTCUTS);
function choices(input: unknown) {
  return z.array(z.string()).parse(input).map(id => {
    const value = shortcuts[id];
    if (!value) throw new Error(`Unknown shared shortcut: ${id}`);
    return { id, ...value };
  });
}
const reference = choices(SHORTCUT_LIST), tools = choices(TOOL_SHORTCUTS);
const hints = choices(['ask', 'quickCapture', 'newNote', 'focus', 'follow', 'justBoard', 'pan']);

export function ShortcutReference() {
  return <div className="keys">
    <div><kbd>⇧T / Shift+T</kbd><span>Show tools</span></div>
    <div>{tools.map(item => <kbd key={item.id} data-shortcut={item.id}>{item.display}</kbd>)}<span>Tools</span></div>
    {reference.map(item => <div key={item.id}><kbd data-shortcut={item.id}>{item.display}</kbd><span>{item.label}</span></div>)}
  </div>;
}

export function KeyboardHints() {
  const [hidden, setHidden] = useState(() => localStorage.getItem('aegis:hints') === 'hide');
  return <div className="editing-hints" hidden={hidden}>
    <button type="button" aria-label="Hide keyboard hints" title="Hide keyboard hints" onClick={() => { localStorage.setItem('aegis:hints', 'hide'); setHidden(true); }}>×</button>
    {hints.map(item => <span key={item.id}><span data-shortcut={item.id} data-shortcut-format="mac">{item.mac}</span> {item.label}</span>)}
  </div>;
}
