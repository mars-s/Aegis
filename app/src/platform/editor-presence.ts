import { useLayoutEffect, useRef, useState } from 'react';
import type { CanvasEngine } from '@aegis/scene';
import type { UiState } from '../workspace/index.js';

type OpenEditor = NonNullable<UiState['editor']>;
type Presence = { readonly kind: 'closed' } | {
  readonly kind: 'opening' | 'open' | 'closing';
  readonly editor: OpenEditor;
  readonly instant: boolean;
};

/** Retain an inert editor through its pointer exit after the controller accepts its save. */
export function useEditorPresence(editor: UiState['editor'], engine: CanvasEngine | null, instant: () => boolean) {
  const [presence, setPresence] = useState<Presence>({ kind: 'closed' });
  const element = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (editor) {
      const immediate = instant();
      setPresence(previous => previous.kind !== 'closed' && previous.kind !== 'closing' && previous.editor.id === editor.id
        ? { ...previous, editor }
        : { kind: immediate ? 'open' : 'opening', editor, instant: immediate });
      return;
    }
    if (instant()) { setPresence(previous => previous.kind === 'closed' ? previous : { kind: 'closed' }); return; }
    setPresence(previous => previous.kind === 'closed' ? previous : { ...previous, kind: 'closing', instant: false });
    const timer = setTimeout(() => setPresence({ kind: 'closed' }), 200);
    return () => clearTimeout(timer);
  }, [editor, instant]);
  const id = presence.kind === 'closed' ? null : presence.editor.id;
  useLayoutEffect(() => {
    if (presence.kind !== 'opening' || !element.current || !engine) return;
    // Flush the starting style once at attachment, then enter after scene input settles.
    element.current.getBoundingClientRect();
    let current = true;
    engine.afterInput(() => { if (current) setPresence(previous => previous.kind === 'opening' ? { ...previous, kind: 'open' } : previous); });
    return () => { current = false; };
  }, [presence.kind, id, engine]);
  return { presence, element };
}
