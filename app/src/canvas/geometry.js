export const MIN_Z = .05, MAX_Z = 4;
export const projectCard = (card, view) => ({ x: card.x * view.z + view.x, y: card.y * view.z + view.y, w: card.w * view.z, h: card.h * view.z });
export const displayedCard = (card, view, rotation) => ({ ...card, ...projectCard(card, view), rot: rotation, props: {} });

export function cardBounds(card, rotation = 0) {
  const angle = rotation * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  const w = card.w * c + card.h * s, h = card.w * s + card.h * c;
  return { x: card.x + (card.w - w) / 2, y: card.y + (card.h - h) / 2, w, h };
}

// Screen-sized agent chrome contributes a fixed extent beside its world-space anchor.
export function fitView(cards, area, maxZ = 1) {
  const x0 = Math.min(...cards.map(c => c.x)), y0 = Math.min(...cards.map(c => c.y));
  let z = Math.min(MAX_Z, maxZ);
  for (const c of cards) {
    const right = c.x + (c.screenSize ? 0 : c.w), bottom = c.y + (c.screenSize ? 0 : c.h);
    if (right > x0) z = Math.min(z, (area.w - (c.screenSize?.w ?? 0)) / (right - x0));
    if (bottom > y0) z = Math.min(z, (area.h - (c.screenSize?.h ?? 0)) / (bottom - y0));
  }
  z = Math.max(MIN_Z, z);
  const right = Math.max(...cards.map(c => c.screenSize ? c.x * z + c.screenSize.w : (c.x + c.w) * z));
  const bottom = Math.max(...cards.map(c => c.screenSize ? c.y * z + c.screenSize.h : (c.y + c.h) * z));
  return { x: area.x + (area.w - right - x0 * z) / 2, y: area.y + (area.h - bottom - y0 * z) / 2, z };
}
