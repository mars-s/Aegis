import { useHover } from './useHover.js';
// Adapted from Zephium Chart/Round.svelte at 0eaad6d, MPL-2.0.
// Changes for Aegis: React and keyboard-accessible value readouts.
import { Fragment } from 'react';
import type { PlotProps } from './Cartesian.js';
import { arcPath, polar, sectorPath } from './geometry.js';
import { readout, ringTop } from './plan.js';
import { Tip } from './Readout.js';

export function Round({ spec, shape, detail, summary, height: size, middle, ...evidence }: PlotProps & { readonly middle: { readonly value: string; readonly label: string } | null }) {
  const hover = useHover();
  const active = hover.index, setActive = hover.show;
  const centre = size / 2, outer = Math.max(8, centre - 2), turn = Math.PI * 2;
  let angle = 0;
  const slices = spec.kind === 'donut' && shape.total ? shape.parts.map(part => {
    const sweep = part.value / shape.total * turn;
    const gap = shape.parts.length > 1 ? 0.025 : 0;
    const from = angle + gap / 2, to = Math.max(from, angle + sweep - gap / 2);
    angle += sweep;
    return { part, d: sectorPath(centre, centre, outer * (detail === 'tile' ? .6 : .7), outer, from, to, detail === 'tile' ? 1.5 : 3), tip: polar(centre, centre, outer, (from + to) / 2) };
  }) : [];
  const count = Math.max(1, shape.parts.length), step = (outer - outer * (count === 1 ? .72 : .36)) / count;
  const thickness = Math.max(3, step * (count === 1 ? 1 : .72));
  const rings = spec.kind === 'radial' ? shape.parts.map(part => {
    const radius = outer - part.index * step - thickness / 2;
    const share = Math.min(1, Math.max(0, part.value / (ringTop(spec, shape.parts) || 1)));
    return { part, radius, d: share > 0 ? arcPath(centre, centre, radius, 0, share * turn) : '', tip: polar(centre, centre, radius, share * turn) };
  }) : [];
  const tip = active === null ? null : readout(spec, shape, active);
  const anchor = slices.find(slice => slice.part.index === active)?.tip ?? rings.find(ring => ring.part.index === active)?.tip;
  const interaction = (index: number) => ({ onPointerEnter: () => setActive(index), onPointerLeave: hover.hide, onFocus: () => setActive(index), onBlur: hover.hide, tabIndex: detail === 'full' ? 0 : undefined });
  return <div className="round" style={{ width: size, height: size }}><svg width={size} height={size} role="img" aria-label={summary}><g className="ring">
    {slices.map(slice => <path key={slice.part.index} d={slice.d} fill={slice.part.color} stroke={slice.part.color} strokeWidth={detail === 'tile' ? 3 : 6} className={`mark slice${active !== null && active !== slice.part.index ? ' dim' : ''}`} {...interaction(slice.part.index)}><title>{slice.part.label}: {slice.part.value}</title></path>)}
    {rings.map(ring => <Fragment key={ring.part.index}><circle cx={centre} cy={centre} r={ring.radius} className="track" strokeWidth={thickness} />{ring.d ? <path d={ring.d} stroke={ring.part.color} strokeWidth={thickness} className="mark slice arc" {...interaction(ring.part.index)}><title>{ring.part.label}: {ring.part.value}</title></path> : null}</Fragment>)}
  </g>{middle && detail !== 'tile' && (spec.kind === 'donut' || shape.parts.length === 1) ? <><text x={centre} y={centre - 2} textAnchor="middle" dominantBaseline="central" className="total">{middle.value}</text>{detail === 'full' ? <text x={centre} y={centre + (spec.compact ? 14 : 18)} textAnchor="middle" dominantBaseline="central" className="caption-text">{middle.label}</text> : null}</> : null}</svg>
    {tip && anchor ? <Tip onhold={hover.hold} onhide={hover.hide} reading={tip} x={anchor.x} y={anchor.y} width={size} {...evidence} /> : null}
  </div>;
}
