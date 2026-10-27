import { DeckChartSchema } from '@aegis/domain/schema';
import type { DeckChartModel } from '@aegis/domain/schema';

// Old deck files store values and labels. Convert them to the shared chart model
// without changing the saved slide or borrowing another source's snapshot.
export function chartTicks(values: readonly number[], target: number | null = null) {
  const extent = target === null ? values : [...values, target];
  let min = Math.min(...extent), max = Math.max(...extent);
  const integers = values.every(Number.isInteger);
  if (min === max) { const pad = integers ? Math.max(Math.abs(min) * .15, 1) : Math.abs(min) * .15 || .1; min -= pad; max += pad; }
  const rough = (max - min) / 4, power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= rough && (!integers || Number.isInteger(n))) ?? Math.max(1, Math.ceil(rough));
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  return { lo, hi };
}
export function sharedDeckChart(chart: DeckChartModel): DeckChartModel {
  if (chart.sourceId || chart.spec || !chart.values?.length) return chart;
  const points = chart.values.flatMap((value, index) => Number.isFinite(value) ? [{ x: chart.labels?.[index] ?? String(index + 1), y: value }] : []);
  if (!points.length) return chart;
  const { lo, hi } = chartTicks(points.map(point => point.y), chart.target ?? null);
  return DeckChartSchema.parse({ ...chart, spec: {
    kind: 'line', smooth: chart.smooth === true, series: [{ name: chart.label || '', points }],
    y: { min: lo, max: hi, ...(typeof chart.unit === 'string' ? { unit: chart.unit } : {}) },
    ...(chart.target === undefined ? {} : { target: { value: chart.target } }), values: false,
  } });
}
