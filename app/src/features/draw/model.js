// Convert a shape atomically through existing board commands, preserving its id, order and links.
export function shapePathCommands(board, card) {
  const links = board.links.filter(l => l.a === card.id || l.b === card.id);
  const props = { ...card.props }; delete props.shape;
  return [
    { op: 'delete', id: card.id },
    { ...card, op: 'create', type: 'path', newId: card.id, props },
    { op: 'order', ids: [card.id], to: board.cards.findIndex(c => c.id === card.id) },
    ...links.flatMap(link => {
      const { id, a, b, label, ...style } = link;
      return [{ op: 'connect', a, b, label, newId: id }, ...(Object.keys(style).length ? [{ op: 'link_update', id, set: style }] : [])];
    }),
  ];
}
