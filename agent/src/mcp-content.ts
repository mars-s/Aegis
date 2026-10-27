import type { Board, Card, JsonValue, BoardId, CardId, Revision } from '@aegis/domain/schema';
import { plainText } from '@aegis/domain/content';


interface AssetReference { name: string; uri: string; label: string }
interface BoardCardSummary { id: CardId; type: Card['type']; kind?: string; text: string; x: number; y: number; w: number; h: number; parent?: CardId; preview: string; uri: string; source?: JsonValue }
export interface BoardSummary { id: BoardId; name: string; rev: Revision; total: number; cards: BoardCardSummary[]; links: Board['links']; offset: number; nextOffset: number | null }
export interface CardRead { boardId: BoardId; rev: Revision; id: CardId; type: Card['type']; title: string; content: string; format: 'text' | 'json'; offset: number; total: number; nextOffset: number | null; assets: AssetReference[]; source: JsonValue | null; uri: string }

export const boardURI = (id: string) => `aegis://boards/${id}`;
export const cardURI = (boardId: string, cardId: string) => `${boardURI(boardId)}/cards/${cardId}`;
export const assetURI = (boardId: string, name: string) => `${boardURI(boardId)}/assets/${name}`;

export function cardText(card: Card) {
  const props = card.props ?? {};
  return [card.text, card.heading, card.badge,
    props.doc ? plainText(props.doc) : props.body,
    ...(card.items ?? []).map(item => `[${item.done ? 'x' : ' '}] ${item.text}`),
    ...(props.slides ?? []).map((slide, i) => `Slide ${i + 1} (${slide.id})\n${[slide.title, slide.sub, slide.body].filter(Boolean).join('\n')}`),
    card.data ? JSON.stringify(card.data) : null,
    card.url,
  ].filter(Boolean).join('\n\n');
}

export function cardAssets(card: Card, boardId: string): AssetReference[] {
  const found = new Map<string, { name: string; uri: string; label: string }>();
  function visit(value: JsonValue | undefined, label: string) {
    if (typeof value === 'string' && /^asset:[a-f0-9]{32}\.[a-z0-9]{3,4}$/.test(value)) {
      const name = value.slice(6);
      if (!found.has(name)) found.set(name, { name, uri: assetURI(boardId, name), label });
    } else if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${label} ${i + 1}`));
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) visit(item, typeof value.alt === 'string' && value.alt || typeof value.name === 'string' && value.name || `${label} ${key}`);
    }
  }
  visit(card, card.text || card.type);
  return [...found.values()];
}

export function boardSummary(board: Board, { offset = 0, limit = 100 }: { offset?: number; limit?: number } = {}): BoardSummary {
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

export function readCard(board: Board, cardId: string, { offset = 0, limit = 20000, format = 'text' }: { offset?: number; limit?: number; format?: 'text' | 'json' } = {}): CardRead {
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

export function searchBoard(board: Board, query: string, { offset = 0, limit = 30 }: { offset?: number; limit?: number } = {}) {
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
