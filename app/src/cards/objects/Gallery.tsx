import { useEffect, useId, useRef, useState } from 'react';
import type { ObjectData } from './model.js';
import { Text } from './Text.js';
export function Gallery({ data, assetUrl, expanded }: { readonly data: ObjectData['gallery']; readonly assetUrl: (url: string) => string; readonly expanded: boolean }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set()), [selected, setSelected] = useState<number | null>(null), [magnified, setMagnified] = useState(false), [animated, setAnimated] = useState(false);
  const inspection = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), opener = useRef<HTMLButtonElement | null>(null), closing = useRef(false), alive = useRef(true);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null), instance = useId();
  const image = selected === null ? null : data.images[selected];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-off');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (selected !== null) inspection.current?.querySelector<HTMLButtonElement>('[data-inspection-close]')?.focus({ preventScroll: true });
  }, [selected !== null]);
  useEffect(() => {
    const node = viewport.current;
    if (node) { node.scrollLeft = magnified ? (node.scrollWidth - node.clientWidth) / 2 : 0; node.scrollTop = magnified ? (node.scrollHeight - node.clientHeight) / 2 : 0; }
  }, [magnified]);
  async function close(keyboard: boolean) {
    if (closing.current) return;
    if (!keyboard && !reduced() && inspection.current) {
      closing.current = true;
      await inspection.current.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 200, easing: 'cubic-bezier(.32,.72,0,1)' }).finished.catch(() => {});
    }
    closing.current = false;
    if (!alive.current) return;
    setSelected(null); setMagnified(false);
    queueMicrotask(() => opener.current?.focus({ preventScroll: true }));
  }
  function select(index: number) { setMagnified(false); setSelected(index); }
  function fail(url: string) { setFailed(current => new Set([...current, url])); }
  return <><div className="gallery" inert={selected !== null}>{data.images.map((item, i) => <figure key={i}>{expanded ? <button className="inspect-image" type="button" aria-label={`Inspect ${item.alt}`} onClick={event => { opener.current = event.currentTarget; setAnimated(event.detail > 0 && !reduced()); select(i); }}>{failed.has(item.url) ? <span className="missing" role="img" aria-label={item.alt}>Image unavailable</span> : <img src={assetUrl(item.url)} alt={item.alt} loading="lazy" onError={() => fail(item.url)} />}</button> : failed.has(item.url) ? <div className="missing" role="img" aria-label={item.alt}>Image unavailable</div> : <img src={assetUrl(item.url)} alt={item.alt} loading="lazy" onError={() => fail(item.url)} />}{item.caption ? <figcaption><Text value={item.caption} label={`Image ${i + 1} caption`} path={['images', i, 'caption']} multiline maxLength={200} /></figcaption> : null}</figure>)}</div>{image ? <div ref={inspection} className={`gallery-inspection${animated ? ' animated' : ''}`} role="dialog" aria-modal="true" aria-label="Image inspection" tabIndex={-1} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); void close(true); }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); select(((selected ?? 0) + (event.key === 'ArrowRight' ? 1 : -1) + data.images.length) % data.images.length); }
    else if (['+', '=', '-', '0'].includes(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); setMagnified(event.key === '+' || event.key === '='); }
    else if (event.key === 'Tab') {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')];
      const index = buttons.findIndex(button => button === document.activeElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus({ preventScroll: true });
    }
  }}><div className="inspection-toolbar"><span className="inspection-help" id={`${instance}-inspection-help`}>{magnified ? '100% · Drag or scroll to pan · − or 0 to fit' : 'Fit · + to magnify'}</span><button type="button" className="inspection-close" data-inspection-close aria-label="Close image inspection" onClick={event => { void close(event.detail === 0); }}>Close</button><button type="button" aria-label="Magnify image" aria-pressed={magnified} aria-keyshortcuts="+ - 0" title={magnified ? 'Fit image (− or 0)' : 'View at 100% (+)'} onClick={() => setMagnified(!magnified)}>{magnified ? 'Fit' : '100%'}</button></div><figure className="inspection-art"><div ref={viewport} className={`inspection-viewport${magnified ? ' magnified' : ''}`} tabIndex={magnified ? 0 : -1} role="region" aria-label="Image viewport" aria-describedby={`${instance}-inspection-help`} onPointerDown={event => {
    if (!magnified || event.button !== 0 || event.pointerType === 'touch' || drag.current) return;
    event.preventDefault(); event.stopPropagation(); const node = event.currentTarget;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop };
    node.setPointerCapture(event.pointerId); node.classList.add('dragging');
  }} onPointerMove={event => {
    const current = drag.current;
    if (!magnified || !current || current.id !== event.pointerId) return;
    event.currentTarget.scrollLeft = current.left + current.x - event.clientX; event.currentTarget.scrollTop = current.top + current.y - event.clientY;
  }} onPointerUp={event => { if (drag.current?.id === event.pointerId) { drag.current = null; event.currentTarget.classList.remove('dragging'); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } }} onPointerCancel={() => { drag.current = null; viewport.current?.classList.remove('dragging'); }} onLostPointerCapture={() => { drag.current = null; viewport.current?.classList.remove('dragging'); }}>{failed.has(image.url) ? <div className="missing" role="img" aria-label={image.alt}>Image unavailable</div> : <img src={assetUrl(image.url)} alt={image.alt} draggable={false} onError={() => fail(image.url)} />}</div><figcaption aria-live="polite">{image.caption || image.alt}</figcaption></figure><div className="inspection-nav"><button type="button" aria-label="Previous image" disabled={data.images.length < 2} onClick={() => select(((selected ?? 0) - 1 + data.images.length) % data.images.length)}>Previous</button><span>{(selected ?? 0) + 1} of {data.images.length}</span><button type="button" aria-label="Next image" disabled={data.images.length < 2} onClick={() => select(((selected ?? 0) + 1) % data.images.length)}>Next</button></div></div> : null}</>;
}
