import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './mobile.css';

export type MobileSheet = 'boards' | 'layers' | 'agents';
export function MobileHub({ sheets }: { readonly sheets: Readonly<Record<MobileSheet, (close: () => void) => ReactNode>> }) {
  const [phone, setPhone] = useState(() => matchMedia('(max-width: 700px)').matches);
  const [current, setCurrent] = useState<MobileSheet | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), previous = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; at: number } | null>(null);
  const backdrop = useRef<number | null>(null);
  const close = (): void => setCurrent(null);
  const outside = (node: HTMLElement, x: number, y: number): boolean => {
    const bounds = node.getBoundingClientRect();
    return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
  };
  useEffect(() => {
    const media = matchMedia('(max-width: 700px)');
    const changed = (): void => { setCurrent(null); setPhone(media.matches); document.body.classList.toggle('phone', media.matches); };
    changed(); media.addEventListener('change', changed);
    return () => { media.removeEventListener('change', changed); document.body.classList.remove('phone', 'mobile-sheet-open'); };
  }, []);
  useLayoutEffect(() => {
    const node = dialog.current; if (!node) return;
    if (current && !node.open) { previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; node.showModal(); document.body.classList.add('mobile-sheet-open'); }
    else if (!current && node.open) { node.close(); document.body.classList.remove('mobile-sheet-open'); previous.current?.focus({ preventScroll: true }); }
  }, [current]);
  useLayoutEffect(() => {
    if (current !== 'agents' || !content.current) return;
    dispatchEvent(new CustomEvent('aegis:mobile-agent-composer', { detail: content.current }));
    return () => { dispatchEvent(new CustomEvent('aegis:mobile-agent-composer', { detail: null })); };
  }, [current]);
  return <><nav id="mobileHub" aria-label="Board hub" hidden={!phone}>{(['boards', 'layers', 'agents'] as const).map(id => <button type="button" key={id} data-sheet={id} aria-expanded={current === id} onClick={() => setCurrent(current === id ? null : id)}>{id === 'layers' ? 'Windows' : `${id[0]?.toUpperCase()}${id.slice(1)}`}</button>)}</nav>
    <dialog ref={dialog} className="mobile-sheet aegis-feature" aria-labelledby="mobileTitle" onClose={close} onCancel={event => { event.preventDefault(); close(); }}
      onPointerDownCapture={event => { const pressed = event.target === event.currentTarget && outside(event.currentTarget, event.clientX, event.clientY); backdrop.current = pressed ? event.pointerId : null; if (pressed) event.stopPropagation(); }}
      onPointerUp={event => { const dismiss = backdrop.current === event.pointerId && outside(event.currentTarget, event.clientX, event.clientY); backdrop.current = null; if (dismiss) close(); }}
      onPointerCancel={() => { backdrop.current = null; }}>
      <div className="mobile-grab" aria-label="Drag down to close" onPointerDown={event => { drag.current = { y: event.clientY, at: performance.now() }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (drag.current && dialog.current) dialog.current.style.translate = `0 ${Math.max(0, event.clientY - drag.current.y)}px`; }} onPointerUp={event => { const start = drag.current; if (!start) return; drag.current = null; if (dialog.current) dialog.current.style.translate = ''; const distance = event.clientY - start.y; if (distance > 90 || distance > 15 && distance / Math.max(1, performance.now() - start.at) > .5) close(); }} onPointerCancel={() => { drag.current = null; if (dialog.current) dialog.current.style.translate = ''; }}><i /></div>
      <header><h2 id="mobileTitle">{current === 'layers' ? 'Windows' : current ? `${current[0]?.toUpperCase()}${current.slice(1)}` : ''}</h2><button type="button" aria-label="Close sheet" onClick={close}>×</button></header><div ref={content} className="mobile-content">{current ? sheets[current](close) : null}</div>
    </dialog>
  </>;
}
