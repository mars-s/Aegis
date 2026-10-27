// Adapted from Zephium Chart/Spark.svelte at 0eaad6d, MPL-2.0.
// Changes for Aegis: React and observer-based layout.
import type { PlotProps } from './Cartesian.js';
import { band, barPath, linear, linePath, runs } from './geometry.js';
import { useBox } from './useBox.js';
export function Spark({ spec, shape, summary, height }: PlotProps) {
  const { ref, width } = useBox<HTMLDivElement>();
  const columns = spec.x?.kind === 'category', values = shape.rows.map(row => row.points[0]?.y ?? null);
  const finite = values.flatMap(value => value === null ? [] : [value]);
  const range: [number, number] = columns ? shape.domain : finite.length ? [Math.min(...finite), Math.max(...finite)] : [0, 1];
  const y = linear(range, [height - 2, 2]), x = linear([0, Math.max(1, shape.rows.length - 1)], [1, width - 1]);
  const slots = band(shape.rows.length, [0, width], .25, .1), base = y(Math.max(range[0], Math.min(0, range[1])));
  const line = runs(values.map((value, i) => value === null ? null : { x: x(i), y: y(value) })).map(piece => linePath(piece, spec.smooth)).join('');
  return <div ref={ref} className="spark" style={{ height }}><svg width={width} height={height} role="img" aria-label={summary}>{columns ? values.map((value, i) => value === null ? null : <path key={i} d={barPath(slots.start(i), Math.min(y(value), base), slots.width, Math.abs(base - y(value)), Math.min(2, slots.width / 2), 'end', y(value) <= base ? 'up' : 'down')} fill={shape.series[0]?.color} className="mark bar" />) : <path d={line} stroke={shape.series[0]?.color} className="mark line" />}</svg></div>;
}
