import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { KeyboardEvent } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard, useSaveState, useSource } from '../../workspace/index.js';
import type { DeckServices } from './model.js';
import { originalFile, slideIndex } from './model.js';
import { deckSession } from './session.js';
import { SlideView } from './Slide.js';
import { Ribbon } from './Ribbon.js';
import { OriginalLink } from './OriginalLink.js';
import { Presentation } from './Presentation.js';
import './editor.css';

export function DeckEditor({ cardId, workspace, engine, services }: CardBodyProps & { readonly services: DeckServices }) {
  const card = useCard(workspace, cardId), session = deckSession(workspace, cardId), draft = useSource(session), saving = useSaveState(workspace);
  const stage = useRef<HTMLDivElement>(null), film = useRef<HTMLDivElement>(null), motion = useRef<Animation | null>(null), pointer = useRef(false), previous = useRef(draft.current);
  const [presenting, setPresenting] = useState(false);
  const original = card ? originalFile(card) : null;
  const jump = useCallback((index: number) => {
    const state = session.getSnapshot(), next = slideIndex(index, state.slides.length);
    session.select(next);
    const wrap = stage.current?.querySelector<HTMLElement>(`[data-i="${next}"]`);
    if (state.overview && wrap && stage.current) stage.current.scrollTop = wrap.offsetTop - stage.current.offsetTop - 24;
  }, [session]);
  const exitPresentation = useCallback((index: number) => { setPresenting(false); jump(index); stage.current?.focus({ preventScroll: true }); }, [jump]);
  useEffect(() => {
    const key = () => { pointer.current = false; }, down = () => { pointer.current = true; };
    window.addEventListener('keydown', key, true); window.addEventListener('pointerdown', down, true);
    const save = () => { session.flush(); }, visibility = () => { if (document.hidden) save(); };
    window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', visibility);
    stage.current?.focus({ preventScroll: true });
    return () => { session.flush(); motion.current?.cancel(); window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown', down, true); window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', visibility); };
  }, [session]);
  useEffect(() => { engine.pin(cardId, 'dirty', draft.dirty); engine.pin(cardId, 'ime', draft.composing); return () => { engine.pin(cardId, 'dirty', false); engine.pin(cardId, 'ime', false); }; }, [engine, cardId, draft.dirty, draft.composing]);
  useLayoutEffect(() => {
    const element = film.current?.querySelector<HTMLElement>(`[data-i="${draft.current}"]`), strip = film.current;
    if (element && strip) {
      const left = element.offsetLeft - strip.offsetLeft;
      if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (left + element.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + element.offsetWidth - strip.clientWidth;
    }
    const from = previous.current; previous.current = draft.current;
    motion.current?.cancel(); motion.current = null;
    if (from === draft.current || draft.overview || !pointer.current || document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const frame = stage.current?.querySelector<HTMLElement>(`[data-i="${draft.current}"] > .deck-fit`);
    if (frame) motion.current = frame.animate([{ opacity: .86, transform: `translateX(${Math.sign(draft.current - from) * 6}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 160, easing: 'cubic-bezier(.23,1,.32,1)' });
  }, [draft.current, draft.overview]);
  useEffect(() => { if (stage.current) stage.current.scrollTop = draft.overview ? draft.scroll : 0; }, [draft.overview]);
  const focusThumb = (index: number) => queueMicrotask(() => film.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.focus({ preventScroll: true }));
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') return;
    event.stopPropagation();
    if (event.nativeEvent.isComposing || draft.composing) return;
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); session.move(draft.current, event.key === 'ArrowUp' ? -1 : 1); focusThumb(session.getSnapshot().current); return; }
    const thumb = event.target instanceof Element ? event.target.closest('.deck-film-item') : null;
    if (!thumb) return;
    if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); session.remove(draft.current); focusThumb(session.getSnapshot().current); }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); jump(event.key === 'Home' ? 0 : event.key === 'End' ? draft.slides.length - 1 : draft.current + (event.key === 'ArrowRight' ? 1 : -1)); focusThumb(session.getSnapshot().current);
    }
  };
  if (card?.type !== 'deck') return <p role="status">This deck is no longer available.</p>;
  const selectedSlide = draft.slides[draft.current];
  return <div className="deck-editor" onKeyDown={keys}>
    <div className="deck-editor-status"><span data-saved role="status">{draft.error || saving.kind === 'blocked' ? 'Not saved' : draft.dirty || saving.kind === 'saving' ? 'Saving…' : 'Saved'}</span>{original ? <OriginalLink original={original} services={services} /> : null}</div>
    {draft.error ? <div className="deck-save-error" role="alert"><p>{draft.error}</p><button type="button" onClick={() => session.flush()}>Retry</button><button type="button" onClick={() => session.useLatest()}>Use latest slides</button></div> : saving.kind === 'blocked' ? <div className="deck-save-error" role="alert"><p>{saving.reason}</p><button type="button" onClick={workspace.retry}>Retry save</button></div> : null}
    <Ribbon draft={draft} session={session} services={services} present={() => { if (session.flush()) setPresenting(true); }} toggleOverview={() => session.overview(!draft.overview)} />
    <div className="deck-ed"><div className={`deck-stage${draft.overview ? ' is-overview' : ''}`} ref={stage} tabIndex={0} aria-label={draft.overview ? 'Slide overview. Scroll through all slides.' : 'Active slide'} onScroll={event => {
      if (!draft.overview) return;
      const element = event.currentTarget; session.scroll(element.scrollTop);
      let nearest = draft.current, distance = Infinity;
      for (const wrap of element.querySelectorAll<HTMLElement>('.deck-slide-wrap')) {
        const d = Math.abs(wrap.offsetTop - element.offsetTop - element.scrollTop - 24);
        if (d < distance) { nearest = Number(wrap.dataset.i); distance = d; }
      }
      session.select(nearest);
    }}>
      {draft.slides.length ? draft.slides.map((slide, index) => <section key={slide.id} className="deck-slide-wrap" data-i={index} role={draft.overview ? undefined : 'tabpanel'} id={`deck-slide-${cardId}-${slide.id}`} aria-label={`Slide ${index + 1}`} hidden={!draft.overview && index !== draft.current} onFocus={() => session.select(index)}>
        <div className="deck-slide-meta"><span>Slide {index + 1}</span><div className="deck-slide-actions"><button type="button" disabled={index === 0} aria-label={`Move slide ${index + 1} up`} onClick={() => session.move(index, -1)}>Up</button><button type="button" disabled={index === draft.slides.length - 1} aria-label={`Move slide ${index + 1} down`} onClick={() => session.move(index, 1)}>Down</button><button type="button" aria-label={`Delete slide ${index + 1}`} onClick={() => session.remove(index)}>Delete</button></div></div>
        <SlideView slide={slide} workspace={workspace} services={services} deckId={cardId} number={index + 1} session={session} />
      </section>) : <p className="deck-empty">Add your first slide below.</p>}
    </div><div className="deck-film" ref={film} role="tablist" aria-label="Slide strip">{draft.slides.map((slide, index) => <button key={slide.id} type="button" role="tab" className={`deck-film-item${index === draft.current ? ' on' : ''}`} data-i={index} aria-label={`Go to slide ${index + 1}`} aria-selected={index === draft.current} aria-controls={`deck-slide-${cardId}-${slide.id}`} tabIndex={index === draft.current ? 0 : -1} aria-keyshortcuts="ArrowLeft ArrowRight Home End Alt+ArrowUp Alt+ArrowDown Delete" onClick={() => flushSync(() => jump(index))}>
      <SlideView slide={slide} workspace={workspace} services={services} deckId={cardId} miniature /><span className="deck-film-caption"><span className="deck-film-number">{index + 1}</span><span className="deck-film-title">{slide.title || 'Untitled slide'}</span></span>
    </button>)}<button className="deck-film-add" type="button" onClick={() => { session.add(); queueMicrotask(() => stage.current?.querySelector<HTMLElement>(`[data-i="${session.getSnapshot().current}"] [data-k="title"]`)?.focus({ preventScroll: true })); }}>Add slide</button></div></div>
    {presenting && selectedSlide ? <Presentation slides={draft.slides} current={draft.current} workspace={workspace} services={services} deckId={cardId} exit={exitPresentation} /> : null}
  </div>;
}
