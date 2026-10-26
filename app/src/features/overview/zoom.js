// Separate entry and exit thresholds keep trackpad noise from changing the level of detail.
export function zoomTier(z, previous = 'detail') {
  if (z < .2 || previous === 'cluster' && z < .23) return 'cluster';
  if (z < .7 || previous !== 'detail' && z < .76) return 'summary';
  return 'detail';
}

export const summarisedCard = card => !['title', 'frame', 'coll', 'template-group', 'draw-ink', 'draw-shape'].includes(card.type);
