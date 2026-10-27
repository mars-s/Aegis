import { useRef } from 'react';
import { useChartScreen } from '../../charts/screen.js';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import { Plot } from '../../charts/Plot.js';
import { useChartCards } from '../../charts/source.js';
import './cards.css';
export function PlotBody({ cardId, workspace, engine }: CardBodyProps) {
  const card = useCard(workspace, cardId), cards = useChartCards(workspace);
  const body = useRef<HTMLElement>(null);
  useChartScreen(body, engine);
  if (card?.kind !== 'plot') return null;
  return <section ref={body} className="data-card plot-card"><header className="win-strip"><span className="win-name">{card.text || 'Chart'}</span><button className="win-open" onClick={() => workspace.act({ kind: 'edit', id: cardId, view: 'side' })}>Open</button></header><div className="plot-scroll"><Plot data={card.data} title={card.text} cards={cards} onsmooth={smooth => { workspace.submit([{ op: 'object_set', id: cardId, path: ['smooth'], value: smooth }]); }} onsource={id => { workspace.submit([{ op: 'object_set', id: cardId, path: ['source'], value: { cardId: id, xColumn: card.data.source?.xColumn ?? 0, yColumns: card.data.source?.yColumns ?? [1] } }]); }} /></div></section>;
}
export const PlotEditor = PlotBody;
