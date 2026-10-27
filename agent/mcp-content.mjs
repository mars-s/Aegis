import { plainText } from '@aegis/domain/content';

export const boardURI = id => `aegis://boards/${id}`;
export const cardURI = (boardId, cardId) => `${boardURI(boardId)}/cards/${cardId}`;
export const assetURI = (boardId, name) => `${boardURI(boardId)}/assets/${name}`;

export function cardText(card) {
  const props = card.props ?? {};
  return [card.text, card.heading, card.badge,
    props.doc ? plainText(props.doc) : props.body,
    ...(card.items ?? []).map(item => `[${item.done ? 'x' : ' '}] ${item.text}`),
    ...(props.slides ?? []).map((slide, i) => `Slide ${i + 1} (${slide.id})\n${[slide.title, slide.sub, slide.body].filter(Boolean).join('\n')}`),
    card.data ? JSON.stringify(card.data) : null,
    card.url,
  ].filter(Boolean).join('\n\n');
}

export function cardAssets(card, boardId) {
  const found = new Map();
  function visit(value, label) {
    if (typeof value === 'string' && /^asset:[a-f0-9]{32}\.[a-z0-9]{3,4}$/.test(value)) {
      const name = value.slice(6);
      if (!found.has(name)) found.set(name, { name, uri: assetURI(boardId, name), label });
    } else if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${label} ${i + 1}`));
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) visit(item, value.alt || value.name || `${label} ${key}`);
    }
  }
  visit(card, card.text || card.type);
  return [...found.values()];
}

export function boardSummary(board, { offset = 0, limit = 100 } = {}) {
  return {
    id: board.id, name: board.name, rev: board.rev, total: board.cards.length,
    cards: board.cards.slice(offset, offset + limit).map(card => ({
      id: card.id, type: card.type, ...(card.kind ? { kind: card.kind } : {}),
      text: card.text.slice(0, 200), x: card.x, y: card.y, w: card.w, h: card.h,
      ...(card.parent ? { parent: card.parent } : {}),
      preview: cardText(card).slice(0, 300), uri: cardURI(board.id, card.id),
      ...(card.props?.import ? { source: card.props.import } : {}),
    })),
    links: board.links, offset,
    nextOffset: offset + limit < board.cards.length ? offset + limit : null,
  };
}

export function readCard(board, cardId, { offset = 0, limit = 20000, format = 'text' } = {}) {
  const card = board.cards.find(c => c.id === cardId);
  if (!card) throw new Error(`No card ${cardId}. Read the board for current ids.`);
  const content = format === 'json' ? JSON.stringify(card, null, 2) : cardText(card);
  return {
    boardId: board.id, rev: board.rev, id: card.id, type: card.type, title: card.text,
    content: content.slice(offset, offset + limit), format, offset, total: content.length,
    nextOffset: offset + limit < content.length ? offset + limit : null,
    assets: cardAssets(card, board.id), source: card.props?.import ?? null,
    uri: cardURI(board.id, card.id),
  };
}

export function searchBoard(board, query, { offset = 0, limit = 30 } = {}) {
  const needle = query.toLocaleLowerCase();
  const matches = [];
  for (const card of board.cards) {
    const text = cardText(card), at = text.toLocaleLowerCase().indexOf(needle);
    if (at < 0) continue;
    matches.push({ id: card.id, type: card.type, title: card.text,
      excerpt: text.slice(Math.max(0, at - 120), at + query.length + 240), uri: cardURI(board.id, card.id) });
  }
  return { boardId: board.id, rev: board.rev, query, total: matches.length,
    matches: matches.slice(offset, offset + limit),
    nextOffset: offset + limit < matches.length ? offset + limit : null };
}
