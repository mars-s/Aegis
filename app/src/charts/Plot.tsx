import { renderChartSpec } from './normalise.js';
import { plotToDeckChart, resolvePlot } from '@aegis/domain/chart-source';
import type { ObjectData } from '@aegis/domain/objects';
import type { CardContent, CardId } from '@aegis/domain/schema';
import { Chart } from './Chart.js';
import { SourceStatus } from './SourceStatus.js';
export function Plot({ data, title, cards, onsmooth, onsource }: { readonly data: ObjectData['plot']; readonly title: string; readonly cards: readonly CardContent[]; readonly onsmooth?: ((smooth: boolean) => void) | undefined; readonly onsource?: ((id: CardId) => void) | undefined }) {
  const resolved = resolvePlot(data, cards);
  const { spec } = plotToDeckChart(data, cards);
  return <><SourceStatus status={resolved.sourceStatus || ''} sources={cards.filter(card => card.kind === 'sheet')} onchoose={onsource} /><Chart spec={{ ...renderChartSpec(spec), values: undefined }} title={title} />{onsmooth && ['line', 'area', 'area_stacked'].includes(data.style) ? <label className="smoothing"><input type="checkbox" checked={data.smooth === true} onChange={event => onsmooth(event.currentTarget.checked)} />Smooth line</label> : null}</>;
}
