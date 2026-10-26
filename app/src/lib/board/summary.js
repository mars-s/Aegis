// Shared by the host's lightweight board list and the Library preview.
export const plainLine = value => String(value ?? '').split('\n').find(line => line.trim())?.replace(/^\s*#{1,6}\s+/, '').replace(/[*_`]/g, '').trim().slice(0, 160) || '';
export const cardTitle = card => plainLine(card.props?.layerName || card.heading || card.text || card.props?.name);
export function boardSubtitle(board) {
  const cards = board?.cards ?? [];
  const heading = cards.find(card => card.type === 'title' && cardTitle(card));
  if (heading) return cardTitle(heading);
  const document = cards.find(card => card.type === 'doc');
  if (document) return cardTitle(document) || plainLine(document.props?.body);
  return cardTitle(cards.find(card => cardTitle(card)) ?? {}) || 'An empty board, ready for an idea.';
}
