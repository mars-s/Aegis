import { useRef } from 'react';
import { useChartScreen } from '../../charts/screen.js';
import type { CardBodyProps } from '../../composition.js';
import { useCard, useSaveState } from '../../workspace/index.js';
import { Plot } from '../../charts/Plot.js';
import { useChartCards } from '../../charts/source.js';
import './cards.css';

function PlotView({ cardId, workspace, engine, editing }: CardBodyProps & { readonly editing: boolean }) {
  const card = useCard(workspace, cardId), cards = useChartCards(workspace);
  const saving = useSaveState(workspace);
  const body = useRef<HTMLElement>(null);
  useChartScreen(body, engine);
  if (card?.kind !== 'plot') return null;
  return <section ref={body} className={`plot-card ${editing ? 'object-editor data-editor' : 'data-card'}`}>
    <header className="win-strip">
      <span className="win-name">{card.text || 'Chart'}</span>
      {editing ? <span data-saved role="status">{saving.kind === 'saved' ? 'Saved' : saving.kind === 'saving' ? 'Saving…' : 'Not saved'}</span> : <button className="win-open" onClick={() => workspace.act({ kind: 'edit', id: cardId, view: 'side' })}>Open</button>}
      {editing && saving.kind === 'blocked' ? <button onClick={workspace.retry}>Retry</button> : null}
    </header>
    <div className="plot-scroll"><Plot data={card.data} title={card.text} cards={cards}
      onsmooth={smooth => { workspace.submit([{ op: 'object_set', id: cardId, path: ['smooth'], value: smooth }]); }}
      onsource={id => { workspace.submit([{ op: 'object_set', id: cardId, path: ['source'], value: { cardId: id, xColumn: card.data.source?.xColumn ?? 0, yColumns: card.data.source?.yColumns ?? [1] } }]); }}
    /></div>
  </section>;
}
export function PlotBody(props: CardBodyProps) { return <PlotView {...props} editing={false} />; }
export function PlotEditor(props: CardBodyProps) { return <PlotView {...props} editing />; }
