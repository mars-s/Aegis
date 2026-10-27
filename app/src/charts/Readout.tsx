// Adapted from Zephium Chart/Readout.svelte and Tip.svelte at 0eaad6d, MPL-2.0.
// Changes for Aegis: React views and measured tooltip bounds.
import type { ChartEvidence } from '@aegis/domain/charts';
import type { ReactNode } from 'react';
import type { Readout as Reading } from './plan.js';
import { useBox } from './useBox.js';

export interface EvidenceProps {
  readonly onevidence?: ((reference: ChartEvidence) => void) | undefined;
  readonly glyph?: ((reference: ChartEvidence) => ReactNode) | undefined;
}
export function Readout({ readout, indicator = 'dot', onevidence, glyph }: EvidenceProps & { readonly readout: Reading; readonly indicator?: 'dot' | 'line' }) {
  return <div className="chart-tooltip"><span className="label">{readout.title}</span>
    {readout.rows.map((row, index) => <span className="row" key={index}><span className={`indicator ${indicator}`} style={{ background: row.color }} />{row.name ? <span className="name">{row.name}</span> : null}<span className={`value${row.name ? '' : ' alone'}`}>{row.text}</span></span>)}
    {readout.evidence.length ? <span className="chips">{readout.evidence.map(reference => <button type="button" className="chip" key={reference.key} disabled={!onevidence} title={reference.label} onClick={() => onevidence?.(reference)}>{glyph?.(reference)}<span className="host">{reference.file ? reference.label : reference.origin || reference.label}</span></button>)}</span> : null}
  </div>;
}
export function Tip({ reading, x, y, width, onhold, onhide, ...evidence }: EvidenceProps & { readonly reading: Reading; readonly x: number; readonly y: number; readonly width: number; readonly onhold?: () => void; readonly onhide?: () => void }) {
  const box = useBox<HTMLDivElement>();
  return <div ref={box.ref} className="tip" role="tooltip" onPointerEnter={onhold} onPointerLeave={onhide} onFocusCapture={onhold} onBlurCapture={onhide} style={{ left: Math.max(0, Math.min(x - box.width / 2, width - box.width)), top: y - box.height - 10 >= -8 ? y - box.height - 10 : y + 14 }}><Readout readout={reading} {...evidence} /></div>;
}
