import { useHover } from './useHover.js';
// Adapted from Zephium Chart/Radar.svelte at 0eaad6d, MPL-2.0.
// Changes for Aegis: React and total indexed access.
import type { PlotProps } from './Cartesian.js';
import { radar, readout } from './plan.js';
import { polar } from './geometry.js';
import { Tip } from './Readout.js';
import { useBox } from './useBox.js';
export function Radar({ spec, shape, detail, summary, height, screenScale = 1, ...evidence }: PlotProps) {
  const { ref, width } = useBox<HTMLDivElement>();
  const hover = useHover();
  const active = hover.index, setActive = hover.show;
  const web = radar(spec), gutter = detail === 'full' ? 28 : detail === 'overview' ? 8 : 2;
  const radius = Math.max(8, Math.min(width, height) / 2 - gutter), cx = width / 2, cy = height / 2;
  const at = (angle: number, reach: number) => polar(cx, cy, radius * reach, angle);
  const polygon = (reach: readonly (number | null)[]) => web.axes.map((axis, index) => { const p = at(axis.angle, reach[index] ?? 0); return `${p.x},${p.y}`; }).join(' ');
  const tip = active === null ? null : readout(spec, shape, active), axis = active === null ? null : web.axes[active];
  const anchor = axis ? at(axis.angle, .9) : null;
  return <div className="radar" ref={ref} style={{ height }}>{width && web.axes.length >= 3 ? <svg width={width} height={height} role="img" aria-label={summary}>
    {web.ticks.map(tick => <polygon key={tick} points={polygon(web.axes.map(() => tick / (web.ticks.at(-1) ?? 1)))} className="grid" />)}
    {web.axes.map(axis => { const end = at(axis.angle, 1); return <line key={axis.key} x1={cx} y1={cy} x2={end.x} y2={end.y} className="grid" />; })}
    {web.series.map((series, order) => <g key={order}><polygon points={polygon(series.reach)} className="mark web" fill={series.color} stroke={series.color} fillOpacity={.1} />{detail !== 'tile' && web.series.length <= 2 ? series.reach.map((reach, index) => { const axis = web.axes[index]; if (reach === null || !axis) return null; const p = at(axis.angle, reach); return <circle key={index} cx={p.x} cy={p.y} r={2.5 / screenScale} className="mark dot" stroke={series.color} />; }) : null}</g>)}
    {detail === 'full' ? web.axes.map((axis, index) => { const p = at(axis.angle, 1), sin = Math.sin(axis.angle), cos = Math.cos(axis.angle); return <text key={axis.key} x={p.x + sin * 10} y={p.y - cos * 10} textAnchor={Math.abs(sin) < .2 ? 'middle' : sin > 0 ? 'start' : 'end'} dominantBaseline={cos > .5 ? 'auto' : cos < -.5 ? 'hanging' : 'central'} className="name" tabIndex={0} onPointerEnter={() => setActive(index)} onPointerLeave={hover.hide} onFocus={() => setActive(index)} onBlur={hover.hide}>{axis.label}</text>; }) : null}
  </svg> : null}{tip && anchor ? <Tip onhold={hover.hold} onhide={hover.hide} reading={tip} {...anchor} width={width} {...evidence} /> : null}</div>;
}
