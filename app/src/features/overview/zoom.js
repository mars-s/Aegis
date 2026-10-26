// Separate entry and exit thresholds keep trackpad noise from changing the level of detail.
export function zoomTier(z, previous = 'detail') {
  if (z < .2 || previous === 'cluster' && z < .23) return 'cluster';
  if (z < .7 || previous !== 'detail' && z < .76) return 'summary';
  return 'detail';
}

export const summarisedCard = card => !['title', 'frame', 'coll', 'template-group', 'draw-ink', 'draw-shape'].includes(card.type);

// Charts use 12px captions, sheets use 12px headers. Neither can shrink below 100%.
// Other windows retain the wider hysteresis band for uninterrupted canvas navigation.
export function cardTier(card, z, previous = 'detail', tier = zoomTier(z, previous)) {
  if (tier === 'cluster') return 'cluster';
  const type = card.type === 'object' ? card.kind : card.type;
  const minimum = { plot: 1, sheet: 1, table: 1, dataset: 1 }[type];
  return minimum ? z < minimum ? 'summary' : 'detail' : tier;
}
