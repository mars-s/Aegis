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

// Round 2 placement: search the nearest free grid position, then the board's outer edge.
// Run only when geometry changes, never on the pan/zoom paint path.
export function freeAgentRect(cards, neighbours, anchor, height, preferred) {
  const occupied = [...cards, ...neighbours], size = { w: WINDOW_WIDTH, h: height };
  const free = p => !occupied.some(c => intersects({ ...p, ...size }, c));
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
