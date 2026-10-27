import type {z} from 'zod/v4';
import { toNumber } from './dataset.js';
import { styleSpec } from './charts.js';
import {SHAPES} from './objects.js';
import {DeckChartSchema,ChartSpecSchema,preserve} from './schema.js';
import type { ObjectData } from './objects.js';
import type { Card, DeckChartModel } from './schema.js';

export const SNAPSHOT_STATUS = 'Source missing, showing saved snapshot';
export const MISSING_STATUS = 'Source missing, no saved snapshot';
const bindingKey = (source: ObjectData['plot']['source']): string => JSON.stringify(source);
export type ResolvedPlot = ObjectData['plot'] & { sourceStatus?: string };
export function resolvePlot(data: ObjectData['plot'], cards: readonly ChartCard[] = []): ResolvedPlot {
  if (!data.source) return data;
  const source = data.source;
  const sheet = cards.find(card => card.kind === 'sheet' && card.id === source.cardId);
  const {xColumn,yColumns} = source;
  if (sheet?.kind !== 'sheet' || !sheet.data.columns[xColumn] || yColumns.some(column => !sheet.data.columns[column])) {
    const snapshot = data.snapshot?.binding === bindingKey(source) ? data.snapshot : null;
    return {...data,headline:undefined,series:snapshot?.series || [],sourceStatus:snapshot ? SNAPSHOT_STATUS : MISSING_STATUS};
  }
  return {...data,headline:undefined,sourceStatus:'',series:yColumns.map((column,index)=>({
    name:sheet.data.columns[column]?.label || data.series[index]?.name || '',
    points:sheet.data.rows.map(row=>({x:row.cells[xColumn] ?? '',y:toNumber(row.cells[column])})),
  }))};
}
export function plotToDeckChart(data: ObjectData['plot'], cards: readonly ChartCard[] = []): {spec:z.output<typeof ChartSpecSchema>;sourceStatus:string} {
  const plot = resolvePlot(data,cards);
  const {source:_source,snapshot:_snapshot,sourceStatus,style,...spec} = plot;
  return {spec:preserve(ChartSpecSchema,{...spec,...styleSpec(style),values:false}),sourceStatus:sourceStatus || ''};
}
export function resolveDeckChart(chart: DeckChartModel, cards: readonly ChartCard[] = []): DeckChartModel {
  if (!chart.sourceId) return chart;
  const source = cards.find(card => card.kind === 'plot' && card.id === chart.sourceId);
  if (source?.kind === 'plot') return preserve(DeckChartSchema,{...chart,...plotToDeckChart(source.data,cards)});
  return preserve(DeckChartSchema,{...chart,spec:chart.snapshotSourceId === chart.sourceId ? chart.spec : undefined,
    sourceStatus:chart.snapshotSourceId === chart.sourceId && chart.spec ? SNAPSHOT_STATUS : MISSING_STATUS});
}
export function saveChartSnapshots(cards: ChartCard[]): void {
  for (const card of cards) {
    if (card.kind !== 'plot' || !card.data.source) continue;
    const plot = resolvePlot(card.data,cards);
    if (!plot.sourceStatus) card.data.snapshot = SHAPES.plot.shape.snapshot.unwrap().parse({binding:bindingKey(card.data.source),series:structuredClone(plot.series)});
  }
  for (const card of cards) {
    if (card.type !== 'deck') continue;
    for (const slide of card.props?.slides || []) {
      if (!slide.chart?.sourceId) continue;
      const chart = resolveDeckChart(slide.chart,cards);
      if (chart.spec && (!chart.sourceStatus || chart.sourceStatus === SNAPSHOT_STATUS)) slide.chart = preserve(DeckChartSchema,{...slide.chart,spec:structuredClone(chart.spec),snapshotSourceId:slide.chart.sourceId,sourceStatus:chart.sourceStatus});
    }
  }
}

type ChartCard = Card extends infer C ? C extends Card ? Pick<C,'id'|'kind'|'type'|'data'|'props'> : never : never;
