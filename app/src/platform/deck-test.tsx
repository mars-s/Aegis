import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod/v4';
import { DeckChartSchema } from '@aegis/domain/schema';
import { ValueChart } from '../editors/deck/ValueChart.js';

// Browser probes render the same value chart as the preview, editor and filmstrip.
// Keep original category indices when malformed historical values are discarded.
const ValueChartInput = DeckChartSchema.omit({ values: true }).extend({ values: z.array(z.unknown()).optional() });
export function lineChart(input: unknown = {}): string {
  const { values, ...chart } = ValueChartInput.parse(input);
  const points = (values ?? []).flatMap((value, index) => typeof value === 'number' && Number.isFinite(value)
    ? [{ value, label: chart.labels?.[index] ?? String(index + 1) }] : []);
  const parsed = DeckChartSchema.parse({ ...chart, values: points.map(point => point.value), labels: points.map(point => point.label) });
  return renderToStaticMarkup(<ValueChart chart={parsed} width={520} height={210} presentationHeight={480} />);
}
