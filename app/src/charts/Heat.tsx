import { useHover } from './useHover.js';
// Adapted from Zephium Chart/Heat.svelte at 0eaad6d, MPL-2.0.
// Changes for Aegis: React and accessible cell readouts.
import type { PlotProps } from './Cartesian.js';
import { band } from './geometry.js';
import { readout } from './plan.js';
import { Tip } from './Readout.js';
import { useBox } from './useBox.js';
export function Heat({ spec, shape, detail, summary, height, ...evidence }: PlotProps) {
  const { ref, width } = useBox<HTMLDivElement>();
  const hover = useHover();
  const active = hover.index, setActive = hover.show;
  const compact = !!spec.compact || detail !== 'full', left = compact ? 0 : Math.max(...spec.series.map(s => s.name.length * 6.5), 0) + 14;
  const across = band(shape.keys.length, [left, Math.max(left + 1, width)], .08, 0), down = band(spec.series.length, [compact ? 0 : 4, height - (compact ? 0 : 20)], .1, 0);
  const every = Math.max(1, Math.ceil(shape.rows.length * (Math.max(...shape.rows.map(row => row.label.length), 0) * 6.5 + 8) / Math.max(1, width - left)));
  const tip = active === null ? null : readout(spec, shape, active), cell = active === null ? null : shape.cells[active];
  return <div className="heat" ref={ref} style={{ height }}>{width > 0 ? <svg width={width} height={height} role="img" aria-label={summary}>
    {shape.cells.map(cell => <rect key={cell.index} x={across.start(shape.keys.indexOf(cell.key))} y={down.start(Number(cell.order))} width={across.width} height={down.width} rx={2} fill={cell.tone === null ? 'var(--color-fill)' : `color-mix(in oklab, var(--color-lit) ${Math.round(6 + cell.tone * 94)}%, var(--color-surface))`} className={`mark cell${active === cell.index ? ' on' : ''}`} tabIndex={detail === 'full' ? 0 : undefined} onPointerEnter={() => setActive(cell.index)} onPointerLeave={hover.hide} onFocus={() => setActive(cell.index)} onBlur={hover.hide}><title>{cell.label}, {cell.row}: {cell.value ?? 'Missing'}</title></rect>)}
    {!compact ? <g>{spec.series.map((s, i) => <text key={i} className="tick" x={left - 8} y={down.start(i) + down.width / 2} textAnchor="end" dominantBaseline="central">{s.name}</text>)}{shape.rows.filter(row => row.index % every === 0).map(row => <text key={row.key} className="tick" x={across.start(row.index) + across.width / 2} y={height - 4} textAnchor="middle">{row.label}</text>)}</g> : null}
  </svg> : null}{tip && cell ? <Tip onhold={hover.hold} onhide={hover.hide} reading={tip} x={across.start(shape.keys.indexOf(cell.key)) + across.width / 2} y={down.start(Number(cell.order))} width={width} {...evidence} /> : null}</div>;
}
