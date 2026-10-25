// Diagram layout: dagre (MIT) places nodes in ranks; we route each edge as one smooth curve between box sides.
import dagre from '@dagrejs/dagre';

export type DNode = { id: string; name: string; kind: string; note?: string; layer?: string };
export type DEdge = { from: string; to: string; label?: string };
export type Diagram = { direction?: 'down' | 'right'; nodes: DNode[]; edges: DEdge[]; layers?: { id: string; name: string }[] };
export type Placed = { node: DNode; x: number; y: number; w: number; h: number; colour: number };
export type Routed = { edge: DEdge; d: string; head: string; label?: { x: number; y: number }; back: boolean };
export type Laid = { width: number; height: number; nodes: Placed[]; edges: Routed[]; bands: { name: string; x: number; y: number; w: number; h: number }[] };

const CHAR = 7.2, PAD_X = 28, MIN_W = 120, MAX_W = 220, LINE = 18;

function size(n: DNode): { w: number; h: number } {
  const longest = Math.max(n.name.length, Math.min(n.note?.length ?? 0, 34));
  const w = Math.max(MIN_W, Math.min(MAX_W, Math.ceil(longest * CHAR + PAD_X)));
  const perLine = Math.floor((w - PAD_X) / CHAR);
  const noteLines = n.note ? Math.min(3, Math.ceil(n.note.length / perLine)) : 0;
  const nameLines = Math.min(2, Math.ceil(n.name.length / perLine));
  return { w, h: 22 + nameLines * LINE + noteLines * 16 };
}

export function layout(d: Diagram): Laid {
  const across = d.direction === 'right';
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: across ? 'LR' : 'TB', nodesep: 36, ranksep: 56, marginx: 4, marginy: 4 });
  g.setDefaultEdgeLabel(() => ({}));
  const layerIndex = new Map((d.layers ?? []).map((l, i) => [l.id, i]));
  d.nodes.forEach(n => { const s = size(n); g.setNode(n.id, { width: s.w, height: s.h }); });
  d.edges.forEach((e, i) => g.setEdge(e.from, e.to, {}, String(i)));
  dagre.layout(g);
  // Colour follows the layer when there are layers, else the node kind, so related boxes match.
  const kinds = [...new Set(d.nodes.map(n => n.kind))];
  const nodes: Placed[] = d.nodes.map(n => {
    const p = g.node(n.id);
    const colour = n.layer && layerIndex.has(n.layer) ? layerIndex.get(n.layer)! : kinds.indexOf(n.kind);
    return { node: n, x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height, colour: colour % 8 };
  });
  const at = new Map(nodes.map(p => [p.node.id, p]));
  const edges: Routed[] = d.edges.map(e => route(e, at.get(e.from)!, at.get(e.to)!, across));
  const width = Math.max(...nodes.map(p => p.x + p.w)) + 8;
  const height = Math.max(...nodes.map(p => p.y + p.h)) + 8;
  // A band behind each layer's nodes, named at its edge.
  const bands = (d.layers ?? []).flatMap(l => {
    const members = nodes.filter(p => p.node.layer === l.id);
    if (!members.length) return [];
    const x = Math.min(...members.map(p => p.x)) - 12, y = Math.min(...members.map(p => p.y)) - 24;
    return [{ name: l.name, x, y, w: Math.max(...members.map(p => p.x + p.w)) + 12 - x, h: Math.max(...members.map(p => p.y + p.h)) + 12 - y }];
  });
  const top = bands.length ? Math.min(0, ...bands.map(b => b.y)) : 0;
  const left = bands.length ? Math.min(0, ...bands.map(b => b.x)) : 0;
  if (top || left) {
    for (const p of nodes) { p.x -= left; p.y -= top; }
    for (const b of bands) { b.x -= left; b.y -= top; }
    for (const r of edges) Object.assign(r, route(r.edge, at.get(r.edge.from)!, at.get(r.edge.to)!, across));
  }
  return { width: width - left, height: height - top, nodes, edges, bands };
}

// Leave from the side facing the target, arrive on the side facing the source, as one cubic curve.
function route(edge: DEdge, a: Placed, b: Placed, across: boolean): Routed {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const forward = across ? bc.x > ac.x + 1 : bc.y > ac.y + 1;
  let p1, p2, c1, c2;
  if (across) {
    const dir = bc.x >= ac.x ? 1 : -1;
    p1 = { x: dir > 0 ? a.x + a.w : a.x, y: ac.y }; p2 = { x: dir > 0 ? b.x : b.x + b.w, y: bc.y };
    const k = Math.max(24, Math.abs(p2.x - p1.x) / 2);
    c1 = { x: p1.x + k * dir, y: p1.y }; c2 = { x: p2.x - k * dir, y: p2.y };
  } else {
    const dir = bc.y >= ac.y ? 1 : -1;
    p1 = { x: ac.x, y: dir > 0 ? a.y + a.h : a.y }; p2 = { x: bc.x, y: dir > 0 ? b.y : b.y + b.h };
    const k = Math.max(24, Math.abs(p2.y - p1.y) / 2);
    c1 = { x: p1.x, y: p1.y + k * dir }; c2 = { x: p2.x, y: p2.y - k * dir };
  }
  const d = `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  // Arrow head along the curve's final direction.
  const ang = Math.atan2(p2.y - c2.y, p2.x - c2.x), s = 6;
  const head = `M${p2.x},${p2.y} L${p2.x - s * Math.cos(ang - 0.45)},${p2.y - s * Math.sin(ang - 0.45)} L${p2.x - s * Math.cos(ang + 0.45)},${p2.y - s * Math.sin(ang + 0.45)} Z`;
  const mid = { x: 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x, y: 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y };
  return { edge, d, head, label: edge.label ? mid : undefined, back: !forward };
}
