import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CardId } from '@aegis/domain/schema';
import type { FeatureWorkspace } from '../../composition.js';
import type { DeckServices, IdentifiedSlide } from './model.js';
import { slideIndex } from './model.js';
import { SlideView } from './Slide.js';

export function Presentation({ slides, current, workspace, deckId, services, exit }: {
  readonly slides: readonly IdentifiedSlide[]; readonly current: number;
  readonly workspace: FeatureWorkspace; readonly deckId: CardId; readonly services: DeckServices;
  readonly exit: (index: number) => void;
}) {
  const [at, setAt] = useState(current), host = useRef<HTMLDivElement>(null), latest = useRef(at), returning = useRef<HTMLElement | null>(null);
  latest.current = at;
  useEffect(() => {
    returning.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    host.current?.focus({ preventScroll: true });
    return () => { if (returning.current?.isConnected) returning.current.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') exit(latest.current);
      else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(event.key)) setAt(index => slideIndex(index + 1, slides.length));
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(event.key)) setAt(index => slideIndex(index - 1, slides.length));
      else if (event.key === 'Home') setAt(0);
      else if (event.key === 'End') setAt(slideIndex(slides.length - 1, slides.length));
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [exit, slides.length]);
  const slide = slides[slideIndex(at, slides.length)];
  return createPortal(<div className="deck-present" ref={host} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Presenting slides" onClick={event => {
    if (event.target instanceof Element && event.target.closest('button, a, input, select')) return;
    setAt(index => slideIndex(index + (event.clientX < innerWidth / 3 ? -1 : 1), slides.length));
  }}>{slide ? <SlideView slide={slide} workspace={workspace} deckId={deckId} services={services} /> : <p className="deck-empty">No slides to present</p>}<span className="deck-present-count">{slide ? at + 1 : 0} / {slides.length}</span><button type="button" className="deck-present-exit" onClick={event => { event.stopPropagation(); exit(at); }}>Exit presentation</button></div>, document.body);
}
