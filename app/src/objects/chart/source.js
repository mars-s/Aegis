import { toNumber } from '../../lib/board/dataset.js';

export const chartCards = () => globalThis.aegisCtx?.canvas.board.cards ?? [];

// The saved series are the fallback if the sheet is unavailable.
export function resolvePlot(data, cards = []) {
  if (!data.source) return data;
  const sheet = cards.find(card => card.id === data.source.cardId && card.kind === 'sheet');
  if (!sheet) return data;
  const { xColumn, yColumns } = data.source;
  return { ...data, series: yColumns.map((column, index) => ({
    name: sheet.data.columns[column]?.label || data.series[index]?.name || '',
    points: sheet.data.rows.map(row => ({ x: row.cells[xColumn] ?? '', y: toNumber(row.cells[column]) })),
  })) };
}

export function plotToDeckChart(data, cards = []) {
  const plot = resolvePlot(data, cards), series = plot.series[0];
  return { labels: series.points.map(p => p.x), values: series.points.map(p => p.y), unit: plot.y.unit || plot.y.label || '', smooth: plot.smooth === true };
}
