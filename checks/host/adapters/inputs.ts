import { z } from 'zod/v4';
import { BoardSchema, CardSchema, preserve } from '@aegis/domain/schema';
import { emptyBoard } from '@aegis/domain/commands';
const record = z.record(z.string(), z.unknown());
export function fixtureCard(value: unknown) {
  const existing = CardSchema.safeParse(value);
  if (existing.success) return preserve(CardSchema, value);
  return CardSchema.parse({ id: 'host-card', type: 'note', x: 0, y: 0, w: 240, h: 160, text: '', color: 'plain', ...record.parse(value) });
}
export function fixtureBoard(value: unknown) {
  const existing = BoardSchema.safeParse(value);
  if (existing.success) return preserve(BoardSchema, value);
  const fields = record.parse(value);
  return BoardSchema.parse({ ...emptyBoard('host-board'), ...fields, cards: z.array(z.unknown()).parse(fields.cards).map(fixtureCard) });
}
