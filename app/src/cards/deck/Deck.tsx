import { JsonRecordSchema } from '@aegis/domain/schema';
import { useRef } from 'react';
import { useChartScreen } from '../../charts/screen.js';
import { useCard } from '../../workspace/index.js';
import type { CardBodyProps } from '../../composition.js';
import { deckSlides, originalFile, slideIndex } from '../../editors/deck/model.js';
import type { DeckServices } from '../../editors/deck/model.js';
import { SlideView } from '../../editors/deck/Slide.js';

export function DeckBody({ cardId, workspace, engine, services }: CardBodyProps & { readonly services: DeckServices }) {
  const root = useRef<HTMLDivElement>(null);
  useChartScreen(root, engine);
  const card = useCard(workspace, cardId);
  if (card?.type !== 'deck') return null;
  const slides = deckSlides(card), current = slideIndex(card.props?.current, slides.length), main = slides[current], original = originalFile(card);
  return <div ref={root} className="deck-body" role="group" aria-label={`${card.text || 'Untitled deck'}, slides. Press Return to edit.`}>
    <div className="deck-title-strip"><span className="deck-name">{card.text || 'Untitled deck'}</span><span className="deck-kind"> · Slides</span>{original ? <a className="deck-source" href={services.assetUrl(original.original)} download={original.name || 'Presentation'} aria-label="Download original presentation">Original</a> : null}<button className="deck-open" type="button" aria-label="Open deck" onClick={() => workspace.act({ kind: 'edit', id: cardId, view: 'side' })}>Open</button></div>
    <div className="deck-view"><div className="deck-nums" aria-hidden="true">{slides.slice(0, 3).map((slide, index) => <span key={slide.id}>{index + 1}</span>)}</div><div className="deck-thumbs">{slides.slice(0, 3).map((slide, index) => <button key={slide.id} type="button" className={`deck-thumb${index === current ? ' on' : ''}`} aria-label={`Preview slide ${index + 1}`} aria-pressed={index === current} onClick={() => workspace.submit([{ op: 'update', id: cardId, set: JsonRecordSchema.parse({ props: { ...card.props, current: index } }) }])}><SlideView slide={slide} workspace={workspace} services={services} deckId={cardId} miniature /></button>)}</div>
      <div className="deck-main" aria-hidden="true">{main ? <SlideView slide={main} workspace={workspace} services={services} deckId={cardId} /> : <p className="deck-empty">Open to add your first slide</p>}</div>
    </div>
  </div>;
}
