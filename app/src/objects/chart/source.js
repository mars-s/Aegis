import { toNumber } from '../../lib/board/dataset.js';
import { styleSpec } from './chart.ts';

/** @typedef {{sourceId?: string, spec?: import('./chart.ts').ChartSpec, sourceStatus?: string, snapshotSourceId?: string}} DeckChartModel */
/** @returns {{id: string, kind?: string, text?: string, props?: {slides?: {id: string, chart?: DeckChartModel}[]}}[]} */
export const chartCards = () => globalThis.aegisCtx?.canvas.board.cards ?? [];

export const SNAPSHOT_STATUS = 'Source missing, showing saved snapshot';
export const MISSING_STATUS = 'Source missing, no saved snapshot';
const bindingKey = source => JSON.stringify(source);

// Resolution is pure. Board commands save snapshots, including just before deletion.
export function resolvePlot(data, cards = []) {
  if (!data.source) return data;
  const sheet = cards.find(card => card.id === data.source.cardId && card.kind === 'sheet');
  const { xColumn, yColumns } = data.source;
  if (!sheet || !sheet.data.columns[xColumn] || yColumns.some(column => !sheet.data.columns[column])) {
    const snapshot = data.snapshot?.binding === bindingKey(data.source) ? data.snapshot : null;
    return { ...data, headline: undefined, series: snapshot?.series || [], sourceStatus: snapshot ? SNAPSHOT_STATUS : MISSING_STATUS };
  }
  return { ...data, headline: undefined, sourceStatus: '', series: yColumns.map((column, index) => ({
    name: sheet.data.columns[column]?.label || data.series?.[index]?.name || '',
    points: sheet.data.rows.map(row => ({ x: row.cells[xColumn] ?? '', y: toNumber(row.cells[column]) })),
  })) };
}

export function plotToDeckChart(data, cards = []) {
  const plot = resolvePlot(data, cards);
  const { source, snapshot, sourceStatus, style, ...spec } = plot;
  return { spec: { ...spec, ...styleSpec(style), values: false }, sourceStatus: sourceStatus || '' };
}

/** @returns {DeckChartModel} */
export function resolveDeckChart(chart, cards = []) {
  if (!chart.sourceId) return chart;
  const source = cards.find(card => card.id === chart.sourceId && card.kind === 'plot');
  if (source) return { ...chart, ...plotToDeckChart(source.data, cards) };
  return { ...chart, spec: chart.snapshotSourceId === chart.sourceId ? chart.spec : undefined,
    sourceStatus: chart.snapshotSourceId === chart.sourceId && chart.spec ? SNAPSHOT_STATUS : MISSING_STATUS };
}

// Called on the cloned board, so UI and host persist the same latest evidence.
export function saveChartSnapshots(cards) {
  for (const card of cards) {
    if (card.kind !== 'plot' || !card.data.source) continue;
    const plot = resolvePlot(card.data, cards);
    if (!plot.sourceStatus) card.data.snapshot = { binding: bindingKey(card.data.source), series: structuredClone(plot.series) };
  }
  for (const card of cards) {
    if (card.type !== 'deck') continue;
    for (const slide of card.props?.slides || []) {
      if (!slide.chart?.sourceId) continue;
      const chart = resolveDeckChart(slide.chart, cards);
      if (chart.spec && (!chart.sourceStatus || chart.sourceStatus === SNAPSHOT_STATUS)) {
        slide.chart = { ...slide.chart, spec: structuredClone(chart.spec), snapshotSourceId: slide.chart.sourceId, sourceStatus: chart.sourceStatus };
      }
    }
  }
}
