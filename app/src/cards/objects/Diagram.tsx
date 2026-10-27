// Diagram adapted from Zephium at 0eaad6d, MPL-2.0. Changes: React and ResizeObserver sizing.
import { useMemo, useState } from 'react';
import { useBox } from '../../charts/useBox.js';
import type { ObjectData } from './model.js';
import { layout } from './diagram-layout.js';
export function Diagram({ data }: { readonly data: ObjectData['diagram'] }) {
  const laid = useMemo(() => layout(data), [data]), box = useBox<HTMLDivElement>(), scale = box.width ? Math.min(1, box.width / laid.width) : 1;
  const [lit, setLit] = useState<string | null>(null);
  const near = (id: string) => !lit || id === lit || data.edges.some(edge => edge.from === lit && edge.to === id || edge.to === lit && edge.from === id);
  return <div className="fit" ref={box.ref} style={{ blockSize: laid.height * scale }}><div className="diagram" style={{ inlineSize: laid.width, blockSize: laid.height, transform: scale < 1 ? `scale(${scale})` : undefined }}>{laid.bands.map((band, i) => <div className="band" key={i} style={{ left: band.x, top: band.y, width: band.w, height: band.h }}><span>{band.name}</span></div>)}<svg className="flows" width={laid.width} height={laid.height} aria-hidden="true">{laid.edges.map((route, i) => { const on = lit && (route.edge.from === lit || route.edge.to === lit); return <g className={`flow${route.back ? ' back' : ''}${on ? ' lit' : ''}${lit && !on ? ' away' : ''}`} key={i}><path d={route.d} /><path className="head" d={route.head} /></g>; })}</svg>{laid.edges.map((route, i) => route.label ? <span className={`edge-label${lit && route.edge.from !== lit && route.edge.to !== lit ? ' away' : ''}`} key={i} style={{ left: route.label.x, top: route.label.y }}>{route.edge.label}</span> : null)}{laid.nodes.map(placed => <div className={`node ${placed.node.kind}${!near(placed.node.id) ? ' away' : ''}`} key={placed.node.id} role="img" aria-label={placed.node.name} style={{ left: placed.x, top: placed.y, width: placed.w, height: placed.h, background: 'var(--card)' }} onPointerEnter={() => setLit(placed.node.id)} onPointerLeave={() => setLit(null)}><strong>{placed.node.name}</strong>{placed.node.note ? <span>{placed.node.note}</span> : null}</div>)}</div></div>;
}
