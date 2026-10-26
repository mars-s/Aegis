import { cardTier, summarisedCard } from './zoom.js';

export const SUMMARY_GAP = 8;
export const summarySize = card => ({ w: Math.max(240, Math.min(360, card.w * .5)), h: 128 });
const overlaps = (a, b) => a.x < b.x + b.w + SUMMARY_GAP && a.x + a.w + SUMMARY_GAP > b.x && a.y < b.y + b.h + SUMMARY_GAP && a.y + a.h + SUMMARY_GAP > b.y;
const contains = (area, r) => r.x >= area.x && r.y >= area.y && r.x + r.w <= area.x + area.w && r.y + r.h <= area.y + area.h;
export const projectCard = (card, view) => ({ x: card.x * view.z + view.x, y: card.y * view.z + view.y, w: card.screenSize?.w ?? card.w * view.z, h: card.screenSize?.h ?? card.h * view.z, summary: false });

// The renderer, links and Fit consume these same final screen rectangles.
export function spatialLayout(cards, view, tier, area, obstacles = [], previous = new Map()) {
  const rects = new Map(), occupied = [...obstacles, ...cards.filter(c => c.screenSize).map(c => projectCard(c, view))];
  for (const card of cards) {
    const projected = projectCard(card, view);
    const summary = !card.screenSize && summarisedCard(card) && cardTier(card, view.z, previous.get(card.id)?.summary ? 'summary' : 'detail', tier) === 'summary';
    if (!summary) { rects.set(card.id, projected); continue; }
    const size = summarySize(card), anchor = { ...projected, ...size, rotation: 0, summary: true };
    // Off-screen work stays off screen when panning, and is never mounted by the overview.
    if (projected.x + Math.max(projected.w, size.w) < area.x || projected.y + Math.max(projected.h, size.h) < area.y || projected.x > area.x + area.w || projected.y > area.y + area.h) { rects.set(card.id, anchor); continue; }
    const clampX = x => Math.max(area.x, Math.min(area.x + area.w - size.w, x));
    const clampY = y => Math.max(area.y, Math.min(area.y + area.h - size.h, y));
    const xs = [clampX(anchor.x), area.x, area.x + area.w - size.w];
    const ys = [clampY(anchor.y), area.y, area.y + area.h - size.h];
    for (const r of occupied) { xs.push(r.x + r.w + SUMMARY_GAP, r.x - size.w - SUMMARY_GAP); ys.push(r.y + r.h + SUMMARY_GAP, r.y - size.h - SUMMARY_GAP); }
    let best, distance = Infinity;
    for (const x of xs) for (const y of ys) {
      const candidate = { ...anchor, x, y };
      const d = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
      if (d < distance && contains(area, candidate) && !occupied.some(r => overlaps(candidate, r))) { best = candidate; distance = d; }
    }
    // A board too large to pack remains pannable. Fit will choose the cluster tier.
    const placed = best || anchor;
    rects.set(card.id, placed); occupied.push(placed);
  }
  return rects;
}

export function fitSpatial(cards, area, maxZ = 1, obstacles = []) {
  const x0 = Math.min(...cards.map(c => c.x)), y0 = Math.min(...cards.map(c => c.y));
  const x1 = Math.max(...cards.map(c => c.x + c.w)), y1 = Math.max(...cards.map(c => c.y + c.h));
  const start = Math.max(.05, Math.min(maxZ, area.w / Math.max(1, x1 - x0), area.h / Math.max(1, y1 - y0)));
  for (let z = start; z >= .2; z -= .02) {
    const view = { x: area.x + area.w / 2 - (x0 + x1) / 2 * z, y: area.y + area.h / 2 - (y0 + y1) / 2 * z, z };
    const rects = [...spatialLayout(cards, view, z < .76 ? 'summary' : 'detail', area, obstacles).values()];
    const fixed = cards.filter(c => c.screenSize).map(c => projectCard(c, view));
    if (rects.every(r => contains(area, r)) && rects.every((r, i) => !r.summary || ![...obstacles, ...fixed, ...rects.slice(0, i).filter(r => r.summary)].some(b => overlaps(r, b)))) return view;
  }
  const z = Math.min(start, .19);
  return { x: area.x + area.w / 2 - (x0 + x1) / 2 * z, y: area.y + area.h / 2 - (y0 + y1) / 2 * z, z };
}
