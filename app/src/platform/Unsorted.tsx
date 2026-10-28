import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type { CardId } from '@aegis/domain';
import type { FeatureContext } from '../composition.js';
import { capturedItems, releaseCaptured } from './tray.js';

export function Unsorted({ context }: { readonly context: FeatureContext }) {
  const workspace = context.workspace;
  const subscribe = useCallback((notify: () => void) => workspace.scene.subscribe(() => notify()), [workspace]);
  const board = useSyncExternalStore(subscribe, workspace.scene.snapshot);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ readonly id: CardId; readonly x: number; readonly y: number } | null>(null), suppressClick = useRef(false);
  let items: ReturnType<typeof capturedItems>;
  try { items = capturedItems(board); }
  catch { return <p role="alert">These captured ideas could not be read. They are still saved.</p>; }
  function release(id: CardId, screen?: { readonly x: number; readonly y: number }): void {
    const engine = context.engine(); if (!engine) return;
    const area = engine.availableArea(), at = engine.screenToWorld(screen ?? { x: area.x + area.width / 2, y: area.y + area.height / 2 });
    try { releaseCaptured(workspace, id, at); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not put this idea on the board.'); }
  }
  return <div className="unsorted-list"><p className="muted">{items.length ? `${items.length} ideas. Drag onto the board.` : 'Captured ideas appear here. Drag cards onto the board when you are ready.'}</p>
    {items.map(item => <button type="button" className="tray-item" key={item.id} data-id={item.id}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } release(item.id); }}
      onPointerDown={event => { if (event.button !== 0) return; suppressClick.current = false; drag.current = { id: item.id, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const start = drag.current; if (start?.id === item.id) event.currentTarget.classList.toggle('dragging', Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5); }}
      onPointerCancel={event => { drag.current = null; event.currentTarget.classList.remove('dragging'); }}
      onPointerUp={event => { const start = drag.current; drag.current = null; event.currentTarget.classList.remove('dragging'); if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 5) return; suppressClick.current = true; const stage = document.getElementById('stage'); if (stage && document.elementFromPoint(event.clientX, event.clientY)?.closest('#stage')) { const rect = stage.getBoundingClientRect(); release(start.id, { x: event.clientX - rect.left, y: event.clientY - rect.top }); } }}
    >{item.text || item.heading || item.url || item.type}</button>)}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
