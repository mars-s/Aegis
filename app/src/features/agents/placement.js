export const WINDOW_WIDTH = 340;
export const COLLAPSED_HEIGHT = 44;
const GAP = 24, GRID = 24;
export const intersects = (a, b) => a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x && a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y;
export function cardRect(card, rotation) {
  if (!rotation) return card;
  const angle = rotation * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  const w = card.w * c + card.h * s, h = card.w * s + card.h * c;
  return { ...card, x: card.x + (card.w - w) / 2, y: card.y + (card.h - h) / 2, w, h };
}

// Round 3 placement: free space within the camera comes before space beyond it.
// Run only when geometry changes, never on the pan/zoom paint path.
export function freeAgentRect(cards, neighbours, anchor, height, preferred, viewport) {
  const occupied = [...cards, ...neighbours], size = { w: WINDOW_WIDTH, h: height };
  const free = p => !occupied.some(c => intersects({ ...p, ...size }, c));
  if (viewport) {
    const left = viewport.x, top = viewport.y, right = left + viewport.w - size.w, bottom = top + viewport.h - size.h;
    const inside = p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
    if (preferred && inside(preferred) && free(preferred)) return preferred;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const start = { x: clamp(anchor.x, left, right), y: clamp(anchor.y, top, bottom) };
    // Bound the search at far zoom. Exact camera and obstacle edges also catch narrow gaps.
    const step = Math.max(GRID, viewport.w / 80, viewport.h / 80), xs = new Set([left, right, start.x]), ys = new Set([top, bottom, start.y]);
    for (let x = left; x <= right; x += step) xs.add(x);
    for (let y = top; y <= bottom; y += step) ys.add(y);
    const candidates = [...xs].flatMap(x => [...ys].map(y => ({ x, y })));
    for (const c of occupied) for (const x of [c.x - size.w - GAP, c.x + c.w + GAP]) for (const y of [start.y, c.y - size.h - GAP, c.y + c.h + GAP]) candidates.push({ x, y });
    candidates.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
    const found = candidates.find(p => inside(p) && free(p)); if (found) return found;
    // Expand the viewport perimeter, so the first free ring is the nearest reachable space.
    for (let ring = 1; ring <= 80; ring++) {
      const d = ring * GRID, x0 = left - d, x1 = Math.max(left, right) + d, y0 = top - d, y1 = Math.max(top, bottom) + d;
      const edge = [];
      for (let x = x0; x <= x1; x += step) edge.push({ x, y: y0 }, { x, y: y1 });
      for (let y = y0; y <= y1; y += step) edge.push({ x: x0, y }, { x: x1, y });
      edge.push({ x: start.x, y: y0 }, { x: start.x, y: y1 }, { x: x0, y: start.y }, { x: x1, y: start.y });
      edge.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
      const found = edge.find(free); if (found) return found;
    }
  }
  if (preferred && free(preferred)) return preferred;
  const start = { x: Math.round(anchor.x / GRID) * GRID, y: Math.round(anchor.y / GRID) * GRID };
  for (let ring = 0; ring <= 80; ring++) {
    const offsets = [0]; for (let i = 1; i <= ring; i++) offsets.push(-i, i);
    for (const dx of offsets) {
      for (const dy of ring ? [-ring, ring] : [0]) {
        const p = { x: start.x + dx * GRID, y: start.y + dy * GRID }; if (free(p)) return p;
      }
    }
    for (let dy = -ring + 1; dy < ring; dy++) {
      for (const dx of [-ring, ring]) {
        const p = { x: start.x + dx * GRID, y: start.y + dy * GRID }; if (free(p)) return p;
      }
    }
  }
  return { x: occupied.reduce((right, c) => Math.max(right, c.x + c.w), start.x) + GAP, y: start.y };
}
