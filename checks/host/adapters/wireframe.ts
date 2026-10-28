import './register.ts';
import { z } from 'zod/v4';
import { CardIdSchema, CardSchema, JsonSchema, preserve } from '@aegis/domain/schema';
const model = await import('../../../app/src/features/wireframe/commands.ts');
export const { DEVICES, PIECES, screenCommand } = model;
const cardsSchema = z.array(CardSchema), boardSchema = z.object({ cards: cardsSchema });
const rawSchema = z.object({ type: z.enum(model.TYPES) }).catchall(JsonSchema);
export function wireCard(raw: unknown, x?: number, y?: number) { return model.wireCard(rawSchema.parse(raw), x, y); }
export function pieceCommands(name: string, at: { x: number; y: number }, cards: unknown) { return model.pieceCommands(name, at, preserve(cardsSchema, cards)); }
export function sectionCommands(cards: unknown) { return model.sectionCommands(preserve(cardsSchema, cards)); }
const modifiers = z.object({ shiftKey: z.boolean().optional(), metaKey: z.boolean().optional(), ctrlKey: z.boolean().optional() });
export function selectForDrag(ids: string[], hit: string, board: unknown, event: unknown = {}) {
  const parsed = modifiers.parse(event);
  return model.selectForDrag(z.array(CardIdSchema).parse(ids), CardIdSchema.parse(hit), preserve(boardSchema, board), {
    ...(parsed.shiftKey === undefined ? {} : { shiftKey: parsed.shiftKey }),
    ...(parsed.metaKey === undefined ? {} : { metaKey: parsed.metaKey }),
    ...(parsed.ctrlKey === undefined ? {} : { ctrlKey: parsed.ctrlKey }),
  });
}
export function expandDrag(cards: unknown, board: unknown, event: unknown = {}) {
  const parsed = modifiers.parse(event);
  return model.expandDrag(preserve(cardsSchema, cards), preserve(boardSchema, board), {
    ...(parsed.shiftKey === undefined ? {} : { shiftKey: parsed.shiftKey }),
    ...(parsed.metaKey === undefined ? {} : { metaKey: parsed.metaKey }),
    ...(parsed.ctrlKey === undefined ? {} : { ctrlKey: parsed.ctrlKey }),
  });
}
const startSchema = z.array(z.object({ c: CardSchema, x: z.number(), y: z.number() }));
const viewSchema = z.object({ z: z.number() });
const optionsSchema = z.object({ grid: z.boolean().optional(), disabled: z.boolean().optional() });
export function snapDrag(start: unknown, dx: number, dy: number, board: unknown, view: unknown, options: unknown = {}) {
  const parsed = optionsSchema.parse(options);
  return model.snapDrag(preserve(startSchema, start), dx, dy, preserve(boardSchema, board), viewSchema.parse(view), {
    ...(parsed.grid === undefined ? {} : { grid: parsed.grid }), ...(parsed.disabled === undefined ? {} : { disabled: parsed.disabled }),
  });
}
export function dropCommands(cards: unknown, board: unknown, kind: 'move' | 'resize' = 'move') {
  return model.dropCommands(preserve(cardsSchema, cards), preserve(boardSchema, board), kind);
}
const alignment = z.enum(['left', 'centre', 'right', 'top', 'middle', 'bottom', 'across', 'down']);
const moveSchema = z.object({ op: z.literal('move'), id: CardIdSchema, x: z.number(), y: z.number() });
export function alignmentCommands(cards: unknown, all: unknown, direction: string) {
  return z.array(moveSchema).parse(model.alignmentCommands(preserve(cardsSchema, cards), preserve(cardsSchema, all), alignment.parse(direction)));
}
