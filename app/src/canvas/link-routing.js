const CLEARANCE = 12;
const inside = (p, r) => p.x > r.x + .01 && p.x < r.x + r.w - .01 && p.y > r.y + .01 && p.y < r.y + r.h - .01;
const inflate = r => ({ x: r.x - CLEARANCE, y: r.y - CLEARANCE, w: r.w + CLEARANCE * 2, h: r.h + CLEARANCE * 2 });
const blocked = (a, b, rects) => rects.some(r => a.x === b.x
  ? a.x > r.x + .01 && a.x < r.x + r.w - .01 && Math.max(a.y, b.y) > r.y + .01 && Math.min(a.y, b.y) < r.y + r.h - .01
  : a.y > r.y + .01 && a.y < r.y + r.h - .01 && Math.max(a.x, b.x) > r.x + .01 && Math.min(a.x, b.x) < r.x + r.w - .01);
function escape(p, r) {
  const sides = [{ d: Math.abs(p.x - r.x), x: -1, y: 0 }, { d: Math.abs(p.x - r.x - r.w), x: 1, y: 0 }, { d: Math.abs(p.y - r.y), x: 0, y: -1 }, { d: Math.abs(p.y - r.y - r.h), x: 0, y: 1 }];
  const side = sides.sort((a, b) => a.d - b.d)[0];
  return { x: p.x + side.x * CLEARANCE, y: p.y + side.y * CLEARANCE };
}

// A rectilinear visibility grid keeps every segment outside the final displayed bounds.
// Endpoint stubs cross only their own window's clearance, preserving the existing pins.
export function routeSummaryLink(p0, p2, source, target, rectangles) {
  const start = escape(p0, source), end = escape(p2, target);
  const rects = rectangles.map(inflate);
  const xs = [...new Set([start.x, end.x, ...rects.flatMap(r => [r.x, r.x + r.w])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...rects.flatMap(r => [r.y, r.y + r.h])])].sort((a, b) => a - b);
  const nodes = new Map();
  for (let y = 0; y < ys.length; y++) for (let x = 0; x < xs.length; x++) {
    const p = { x: xs[x], y: ys[y] };
    if (!rects.some(r => inside(p, r))) nodes.set(y * xs.length + x, { ...p, xIndex: x, yIndex: y, neighbours: [] });
  }
  for (const node of nodes.values()) for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const next = nodes.get((node.yIndex + dy) * xs.length + node.xIndex + dx);
    if (!next || dx && node.xIndex + dx >= xs.length || blocked(node, next, rects)) continue;
    const distance = Math.abs(next.x - node.x) + Math.abs(next.y - node.y), axis = dx ? 'x' : 'y';
    node.neighbours.push({ node: next, distance, axis }); next.neighbours.push({ node, distance, axis });
  }
  const first = nodes.get(ys.indexOf(start.y) * xs.length + xs.indexOf(start.x));
  const last = nodes.get(ys.indexOf(end.y) * xs.length + xs.indexOf(end.x));
  if (!first || !last) return null;
  const queue = [{ node: first, cost: 0, axis: '', previous: null }], costs = new Map();
  let found;
  while (queue.length) {
    queue.sort((a, b) => (a.cost + Math.abs(a.node.x - end.x) + Math.abs(a.node.y - end.y)) - (b.cost + Math.abs(b.node.x - end.x) + Math.abs(b.node.y - end.y)));
    const step = queue.shift(), key = `${step.node.xIndex}:${step.node.yIndex}:${step.axis}`;
    if (costs.has(key) && costs.get(key) <= step.cost) continue;
    costs.set(key, step.cost);
    if (step.node === last) { found = step; break; }
    for (const edge of step.node.neighbours) queue.push({ node: edge.node, cost: step.cost + edge.distance + (step.axis && step.axis !== edge.axis ? 16 : 0), axis: edge.axis, previous: step });
  }
  if (!found) return null;
  const points = [p2];
  for (let step = found; step; step = step.previous) points.push({ x: step.node.x, y: step.node.y });
  points.push(p0); points.reverse();
  for (let i = points.length - 2; i > 0; i--) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    if (a.x === b.x && b.x === c.x || a.y === b.y && b.y === c.y) points.splice(i, 1);
  }
  const middle = points[Math.floor(points.length / 2)];
  return { d: points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '), startFrom: points[1], endFrom: points.at(-2), label: middle };
}
