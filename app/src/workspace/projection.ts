import type { Board, Card, CardContent, CardId, ChangeSet } from '@aegis/domain/schema';

export function equalValue<T>(left: T, right: T): boolean {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

export function cardContent(card: Card): CardContent {
  const { x: _x, y: _y, w: _w, h: _h, rot: _rot, ...content } = card;
  return content;
}

/** Called for transactions and snapshots, never by a camera frame. */
export function stabiliseBoard(previous: Board, next: Board): Board {
  const before = new Map(previous.cards.map(card => [card.id, card]));
  const cards = next.cards.map(card => {
    const old = before.get(card.id);
    return old && equalValue(old, card) ? old : card;
  });
  const links = equalValue(previous.links, next.links) ? previous.links : next.links;
  const stable = Object.assign({}, next);
  stable.cards = cards;
  stable.links = links;
  return stable;
}

export function boardChange(previous: Board, next: Board): ChangeSet {
  const before = new Map(previous.cards.map(card => [card.id, card]));
  const after = new Set(next.cards.map(card => card.id));
  const order = next.cards.map(card => card.id);
  return {
    boardId: next.id, baseRevision: previous.rev, revision: next.rev,
    upserted: next.cards.filter(card => before.get(card.id) !== card),
    removed: previous.cards.filter(card => !after.has(card.id)).map(card => card.id),
    links: previous.links === next.links ? null : next.links,
    order: equalValue(previous.cards.map(card => card.id), order) ? null : order,
  };
}

export function historyCommands(board: Board): readonly import('@aegis/domain/schema').Command[] {
  return [
    { op: 'restore', cards: board.cards, links: board.links, tray: board.tray ?? [] },
    { op: 'board_set', set: { palette: board.palette ?? [], bg: board.bg ?? null } },
  ];
}

export function selectedIds(ids: readonly CardId[], cards: readonly Card[]): readonly CardId[] {
  const available = new Set(cards.map(card => card.id));
  return [...new Set(ids)].filter(id => available.has(id));
}
