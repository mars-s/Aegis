import { renderChartSpec } from './normalise.js';
import { resolveDeckChart } from '@aegis/domain/chart-source';
import type { DeckChartModel, CardId } from '@aegis/domain/schema';
import type { FeatureWorkspace } from '../composition.js';
import { Chart } from './Chart.js';
import { SourceStatus } from './SourceStatus.js';
import { useBox } from './useBox.js';
import { useChartCards } from './source.js';
import './deck-chart.css';
export interface DeckChartProps {
  readonly workspace: FeatureWorkspace;
  readonly chart: DeckChartModel;
  readonly title: string;
  readonly deckId?: CardId;
  readonly slideId?: string;
  readonly miniature?: boolean;
  /** Screen height of the containing slide fit, supplied by the deck view. */
  readonly presentationHeight?: number;
  /** Scale already applied by the slide view, including its canvas camera. */
  readonly viewScale?: number;
  readonly onchoose?: ((id: CardId) => void) | undefined;
}
export function DeckChart({ workspace, chart, title, deckId, slideId, miniature = false, presentationHeight, viewScale = 1, onchoose }: DeckChartProps) {
  const cards = useChartCards(workspace);
  const box = useBox<HTMLDivElement>();
  const deck = cards.find(card => card.id === deckId && card.type === 'deck');
  const current = deck?.props?.slides?.find(slide => slide.id === slideId)?.chart;
  const resolved = resolveDeckChart(current?.sourceId === chart.sourceId ? { ...chart, ...current } : chart, cards);
  const spec = resolved.spec ? renderChartSpec(resolved.spec) : undefined;
  const quiet = miniature || !onchoose && box.height < 112;
  const round = spec?.kind === 'donut' || spec?.kind === 'radial';
  const overhead = quiet ? 0 : 32 + (round ? 0 : Math.ceil((spec?.series.length ?? 0) / 3)) * 24 + (resolved.sourceStatus ? onchoose ? 64 : 32 : 0);
  const fit = viewScale > 0 ? viewScale : 1;
  const scale = miniature ? 1 : Math.max(12, Math.min(22, (presentationHeight ?? box.height * fit) / 40)) / (12 * fit);
  const height = Math.max(16, Math.min(box.height / scale - overhead, round && !quiet ? box.width / scale * .52 : Infinity));
  return <div ref={box.ref} className={`deck-evidence${miniature ? ' miniature' : ''}`} data-chart-kind={spec?.kind} role="group" aria-label={[title, spec?.kind, spec?.series.map(s => s.name).join(', '), resolved.sourceStatus].filter(Boolean).join('. ')}><div className="deck-chart-content" style={{ width: `calc(100% / ${scale})`, height: `calc(100% / ${scale})`, transform: `scale(${scale})` }}>
    {!miniature ? <SourceStatus status={resolved.sourceStatus || ''} sources={cards.filter(card => card.kind === 'plot')} onchoose={onchoose} /> : null}
    {spec && box.height ? <>{!quiet && (spec.x?.label || spec.y?.label || spec.y?.unit) ? <p className="deck-axis-meaning">{[spec.x?.label, spec.y?.label, spec.y?.unit].filter(Boolean).join(' · ')}</p> : null}<Chart spec={{ ...spec, compact: false, values: false, basis: undefined }} title={title} height={height} screenScale={scale * fit} detail={quiet ? 'tile' : 'full'} /></> : !resolved.sourceStatus ? <p className="deck-chart-empty">Add chart values to this slide</p> : null}
  </div></div>;
}
