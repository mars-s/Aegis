import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { DeckServices } from './model.js';
import { layouts, layoutNames, slideLayout } from './model.js';
import type { DeckDraft, DeckSession } from './session.js';
import '../../lib/ui/ribbon.css';

function Icon({ path }: { readonly path: string }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d={path} /></svg>;
}
function Choice({ services, label, children, items, disabled = false }: {
  readonly services: DeckServices; readonly label: string; readonly children: ReactNode;
  readonly items: Parameters<DeckServices['menu']>[0]['items']; readonly disabled?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null), current = useRef(items);
  current.current = items;
  useEffect(() => {
    if (!button.current) return;
    const menu = services.menu({ trigger: button.current, label, items: () => current.current() });
    return () => menu.destroy();
  }, [label, services]);
  return <button type="button" ref={button} className="ribbon-select" aria-label={label} aria-haspopup="menu" disabled={disabled}>{children}<Icon path="m5 6 3 3 3-3" /></button>;
}
export function Ribbon({ draft, session, services, present, toggleOverview }: {
  readonly draft: DeckDraft; readonly session: DeckSession; readonly services: DeckServices;
  readonly present: () => void; readonly toggleOverview: () => void;
}) {
  const slide = draft.slides[draft.current];
  return <div className="office-ribbon deck-ribbon" role="toolbar" aria-label="Slide tools">
    <div className="ribbon-group"><button type="button" className="ribbon-btn" aria-label="New slide" onClick={() => session.add(draft.current + 1)}><Icon path="M2 3.5h9v7H2zM13 9v5M10.5 11.5h5" /></button><button type="button" className="ribbon-btn" aria-label="Duplicate slide" disabled={!slide} onClick={() => session.add(draft.current + 1, true)}><Icon path="M5 5h9v7H5zM11 3H2v7" /></button></div>
    <div className="ribbon-group"><Choice services={services} label="Slide layout" disabled={!slide} items={() => layouts.map(layout => ({ title: layoutNames[layout], checked: !!slide && slideLayout(slide) === layout, run: () => { if (slide) session.patch(slide.id, { layout }); } }))}>{slide ? layoutNames[slideLayout(slide)] : 'Layout'}</Choice></div>
    {slideLayout(slide ?? {}) === 'title' ? <div className="ribbon-group"><Choice services={services} label="Slide background" items={() => [{ title: 'Typography', checked: slide?.background === 'plain', run: () => { if (slide) session.patch(slide.id, { background: 'plain' }); } }, { title: 'Sci-fi wave', checked: slide?.background !== 'plain', run: () => { if (slide) session.patch(slide.id, { background: 'sci-fi-wave' }); } }]}>{slide?.background === 'plain' ? 'Typography' : 'Sci-fi wave'}</Choice></div> : null}
    {slide?.layout === 'three' ? <div className="ribbon-group"><Choice services={services} label="Idea arrangement" items={() => [{ title: 'Independent columns', checked: slide.relationship !== 'overlap', run: () => session.patch(slide.id, { relationship: 'columns' }) }, { title: 'Overlapping circles', checked: slide.relationship === 'overlap', run: () => session.patch(slide.id, { relationship: 'overlap' }) }]}>{slide.relationship === 'overlap' ? 'Circles' : 'Columns'}</Choice></div> : null}
    <div className="ribbon-group"><button type="button" className="ribbon-btn" aria-label="Move slide up" disabled={!slide || draft.current === 0} onClick={() => session.move(draft.current, -1)}><Icon path="M8 13V3M4 7l4-4 4 4" /></button><button type="button" className="ribbon-btn" aria-label="Move slide down" disabled={!slide || draft.current >= draft.slides.length - 1} onClick={() => session.move(draft.current, 1)}><Icon path="M8 3v10M4 9l4 4 4-4" /></button><button type="button" className="ribbon-btn" aria-label="Delete current slide" disabled={!slide} onClick={() => session.remove(draft.current)}><Icon path="M2.5 4h11M6 4V2h4v2M4 4l.5 10h7L12 4" /></button></div>
    <div className="ribbon-group ribbon-end"><button type="button" className="ribbon-btn" aria-label="Slide overview" aria-pressed={draft.overview} onClick={toggleOverview}><Icon path="M2 2h12v4H2zM2 9h12v4H2z" /><span>Overview</span></button><button type="button" className="ribbon-select ribbon-present" disabled={!slide} onClick={present}><Icon path="M5 3.5v9l7.5-4.5z" /><span>Present</span></button></div>
  </div>;
}
