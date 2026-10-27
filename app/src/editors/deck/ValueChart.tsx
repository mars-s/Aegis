import type { CSSProperties } from 'react';
import type { DeckChartModel } from '@aegis/domain/schema';
import { linePath } from '../../charts/geometry.js';
import { deckChartValues } from './chart.js';

// Saved value charts retain the original deck axes. Source-bound charts use DeckChart.
export function ValueChart({ chart, width, height, presentationHeight }: {
  readonly chart: DeckChartModel; readonly width: number; readonly height: number; readonly presentationHeight: number;
}) {
  const { points, target, lo, hi, ticks, unit } = deckChartValues(chart);
  if (!points.length) return <p className="deck-chart-empty">Add chart values to this slide</p>;
  const w = 520, h = 210, left = 42, right = 45, top = unit ? 24 : 12, bottom = 26;
  const x = (index: number) => points.length === 1 ? (w + left - right) / 2 : left + index * (w - left - right) / (points.length - 1);
  const y = (value: number) => top + (hi - value) * (h - top - bottom) / (hi - lo);
  const label = (value: number) => Number(value.toPrecision(12)).toString();
  // Only the containing slide fit controls labels and dots. Camera zoom scales them normally.
  const scale = Math.min(width / w, height / h) || 1;
  const radius = Math.min(2.5 / scale, top - 1, bottom - 1);
  const labelSize = Math.round(Math.max(12, Math.min(22, presentationHeight / 40))) / scale;
  const style: CSSProperties & { readonly '--chart-label-size': string } = { '--chart-label-size': `${labelSize}px` };
  const every = Math.max(1, Math.ceil(points.length / 12));
  return <svg className="deck-chart" viewBox={`0 0 ${w} ${h}`} fontFamily="Inter Variable, sans-serif" fontSize="12" fontWeight="400" textRendering="geometricPrecision" role="img" aria-label={chart.label || 'Line chart'} style={style}>
    {unit ? <text className="axis axis-unit" x={left} y={12}>{unit}</text> : null}
    {ticks.map(tick => <g key={tick}><line className="grid" x1={left} x2={w - right} y1={y(tick)} y2={y(tick)} /><text className="axis y-tick" x={left - 8} y={y(tick) + 3.5} textAnchor="end">{label(tick)}</text></g>)}
    {points.map((point, index) => index % every === 0 || index === points.length - 1 ? <text key={index} className="axis x-tick" x={x(index)} y={h - 6} textAnchor="middle">{point.x}</text> : null)}
    {target !== null ? <><line className="target" x1={left} x2={w - right} y1={y(target)} y2={y(target)} /><text className="axis" x={w - right + 6} y={y(target) + 3.5}>{label(target)}</text></> : null}
    <path className="line" d={linePath(points.map((point, index) => ({ x: x(index), y: y(point.y) })), chart.smooth === true)} />
    {points.map((point, index) => <circle key={index} className="pt" cx={x(index)} cy={y(point.y)} r={radius} />)}
  </svg>;
}
