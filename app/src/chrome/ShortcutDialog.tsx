import { useLayoutEffect, useRef } from 'react';
import './shortcuts.css';

export interface ShortcutReference { readonly id: string; readonly label: string; readonly text: string }
export function Shortcuts({ open, close, shortcuts }: { readonly open: boolean; readonly close: () => void; readonly shortcuts: readonly ShortcutReference[] }) {
  const dialog = useRef<HTMLDialogElement>(null), previous = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const node = dialog.current; if (!node) return;
    if (open && !node.open) { previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; node.showModal(); }
    if (!open && node.open) { node.close(); previous.current?.focus({ preventScroll: true }); }
  }, [open]);
  return <dialog ref={dialog} className="shortcuts-sheet aegis-feature" aria-labelledby="shortcuts-title" onCancel={event => { event.preventDefault(); close(); }}><header><h2 id="shortcuts-title">Keyboard shortcuts</h2><button type="button" onClick={close}>Done</button></header><dl>{shortcuts.flatMap(item => [<dt key={`${item.id}:label`}>{item.label}</dt>, <dd key={`${item.id}:keys`} data-shortcut={item.id}>{item.text}</dd>])}<dt>Keyboard shortcuts</dt><dd>?</dd></dl></dialog>;
}
