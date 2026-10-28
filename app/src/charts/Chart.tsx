// Adapted from Zephium Chart/Chart.svelte at 0eaad6d, MPL-2.0.
// Changes for Aegis: React and immediate settled marks for repeated editing.
import { useMemo, useState } from 'react';
import { extremes, formatValue, pointText } from '@aegis/domain/charts';
import type { ChartSpec } from '@aegis/domain/charts';
import { card, legendRule, plan, valuesCsv } from './plan.js';
import { Cartesian } from './Cartesian.js';
import { Round } from './Round.js';
import { Radar } from './Radar.js';
import { Heat } from './Heat.js';
import { Spark } from './Spark.js';
import { ChartLegend } from './ChartLegend.js';
import type { EvidenceProps } from './Readout.js';
import './charts.css';
export interface ChartProps extends EvidenceProps {
  readonly spec: ChartSpec;
  readonly title: string;
  readonly height?: number | undefined;
  readonly screenScale?: number;
  readonly detail?: 'full' | 'overview' | 'tile';
}
export function Chart({ spec, title, height, detail = 'full', screenScale = 1, ...evidence }: ChartProps) {
  const shape = useMemo(() => plan(spec), [spec]), labels = useMemo(() => card(spec, shape), [spec, shape]);
  const [copyStatus, setCopyStatus] = useState('Copy values');
  const spark = spec.kind === 'spark', quiet = detail !== 'full', tile = detail === 'tile';
  const compact = !!spec.compact || spark || quiet, round = spec.kind === 'donut' || spec.kind === 'radial';
  const usable = spec.series.some(series => series.points.some(point => point.y !== null));
  const shares = new Intl.NumberFormat('en-AU', { style: 'percent', maximumFractionDigits: 0 });
  const legend = spark || spec.kind === 'heat' || quiet ? [] : round ? spec.compact ? [] : shape.parts.map(part => ({ key: `p${part.index}`, label: part.label, color: part.color, share: spec.kind === 'donut' ? shape.total ? shares.format(part.value / shape.total) : '' : pointText(part.points[0], spec.y) })) : (spec.compact ? labels.legend : legendRule(spec.series.length, false)) === 'rows' ? shape.series : [];
  const table = !spark && !quiet && spec.values !== false && (!spec.compact || labels.legend === 'table');
  const range = extremes(spec);
  const summary = [title, spec.x?.label, spec.y?.label, spec.kind, range ? `Low ${range.low.value} at ${range.low.x}; high ${range.high.value} at ${range.high.x}` : ''].filter(Boolean).join('. ');
  const plotHeight = height ?? (spec.kind === 'heat' ? (compact ? 0 : 24) + spec.series.length * (compact ? Math.max(6, Math.floor(132 / Math.max(1, spec.series.length))) : 20) : round ? tile ? 150 : spec.compact ? 132 : 188 : spec.kind === 'radar' ? 280 : shape.horizontal ? (compact ? 8 : 30) + shape.rows.length * (compact ? 20 : Math.max(24, 10 + spec.series.length * 12)) : tile ? 96 : spec.compact ? 132 : 220);
  const middle = spec.compact && labels.lead ? { value: labels.lead.share, label: labels.lead.label } : spec.headline ?? (spec.kind === 'radial' ? shape.parts[0] ? { value: pointText(shape.parts[0].points[0], spec.y), label: shape.parts[0].label } : null : { value: formatValue(shape.total, spec.y), label: 'Total' });
  const props = { spec, shape, detail, summary, height: plotHeight, screenScale, ...evidence };
  const cited = spec.series.some(series => series.points.some(point => point.evidence?.length));
  return <div className="aegis-chart">{spark ? <Spark {...props} /> : <figure className={`chart ${detail}${spec.compact ? ' compact' : ''}${round ? ' round-chart' : ''}`}>
    {spec.headline && !tile && (!round || spec.kind === 'radial' && shape.parts.length > 1) ? <p className="headline"><span className="figure">{spec.headline.value}</span><span className="what">{spec.headline.label}</span></p> : null}
    {usable ? <div className={`plot-body${round && legend.length ? ' beside' : ''}`}>{(() => {
      switch (spec.kind) {
        case 'donut': case 'radial': return <Round {...props} middle={middle} />;
        case 'radar': return <Radar {...props} />;
        case 'heat': return <Heat {...props} />;
        case 'bars': case 'stacked': case 'line': case 'area': case 'range': return <Cartesian {...props} labels={labels} />;
        case 'spark': return <Spark {...props} />;
        default: { const exhaustive: never = spec.kind; return exhaustive; }
      }
    })()}{legend.length ? <ChartLegend entries={legend} layout={round ? 'list' : spec.compact ? 'rows' : 'row'} /> : null}</div> : <p role="status" className="caption">No chart values available</p>}
    {spec.basis?.trim() && !quiet ? <p className="caption basis">{spec.basis}</p> : null}
    {table ? <details><summary>{spec.series.some(series => series.points.some(point => point.display !== undefined)) ? 'Exact values' : 'Values'}</summary>{!compact ? <button type="button" className="copy" onClick={() => { void navigator.clipboard.writeText(valuesCsv(spec)).then(() => setCopyStatus('Copied'), () => setCopyStatus('Could not copy values')); }}>{copyStatus}</button> : null}<div className="values"><table><caption>{title}</caption><thead><tr><th scope="col">{spec.x?.label ?? ''}</th>{spec.series.map((s, i) => <th scope="col" key={i}>{s.name || spec.y?.label || ''}</th>)}{cited ? <th scope="col">Sources</th> : null}</tr></thead><tbody>{shape.rows.map(row => <tr key={row.key}><th scope="row">{row.label}</th>{row.points.map((point, i) => <td key={i}>{pointText(point, spec.y)}</td>)}{cited ? <td className="cites">{row.points.flatMap(point => point?.evidence ?? []).map((reference, i) => <button key={i} type="button" className="chip" disabled={!evidence.onevidence} onClick={() => evidence.onevidence?.(reference)}>{reference.origin || reference.label}</button>)}</td> : null}</tr>)}</tbody></table></div></details> : null}
  </figure>}</div>;
}
