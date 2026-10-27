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
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => Number((lo + step * i).toPrecision(12)));
  return { lo, hi, ticks };
}
export function deckChartValues(chart: DeckChartModel) {
  const points = (chart.values ?? []).flatMap((value, index) => Number.isFinite(value) ? [{ x: chart.labels?.[index] ?? String(index + 1), y: value }] : []);
  const target = typeof chart.target === 'number' && Number.isFinite(chart.target) ? chart.target : null;
  return { points, target, unit: typeof chart.unit === 'string' ? chart.unit : '',
    ...(points.length ? chartTicks(points.map(point => point.y), target) : { lo: 0, hi: 1, ticks: [] }) };
}
export function sharedDeckChart(chart: DeckChartModel): DeckChartModel {
  if (chart.sourceId || chart.spec || !chart.values?.length) return chart;
  const { points, lo, hi } = deckChartValues(chart);
  if (!points.length) return chart;
  return DeckChartSchema.parse({ ...chart, spec: {
    kind: 'line', smooth: chart.smooth === true, series: [{ name: chart.label || '', points }],
    y: { min: lo, max: hi, ...(typeof chart.unit === 'string' ? { unit: chart.unit } : {}) },
    ...(chart.target === undefined ? {} : { target: { value: chart.target } }), values: false,
  } });
}
