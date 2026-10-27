import { z } from 'zod/v4';
import { CardIdSchema, CommandSchema, CardSchema, JsonSchema, preserve } from '@aegis/domain/schema';
import { legacyModule, point } from './module.ts';
const model = await legacyModule(new URL('../../../app/src/features/wireframe/model.js', import.meta.url).href);
export const DEVICES = z.record(z.string(), z.tuple([z.number(), z.number(), z.number()])).parse(model.value('DEVICES'));
export const PIECES = z.record(z.string(), z.object({ web: z.union([z.boolean(), z.number()]).optional() })).parse(model.value('PIECES'));
// The legacy factory explicitly emits undefined stroke props; the reducer omits them on save.
const create = CommandSchema.options[0].extend({ props: z.record(z.string(), JsonSchema.optional()).optional() });
export function wireCard(raw: unknown, x?: number, y?: number) { return create.parse(model.call('wireCard', raw, x, y)); }
export function screenCommand(device: string, at: { x: number; y: number }) { return create.parse(model.call('screenCommand', device, at)); }
export function pieceCommands(name: string, at: { x: number; y: number }, cards: unknown) { return z.array(z.union([create, CommandSchema])).parse(model.call('pieceCommands', name, at, cards)); }
export function sectionCommands(cards: unknown) { return z.array(CommandSchema).parse(model.call('sectionCommands', cards)); }
export function selectForDrag(ids: string[], hit: string, board: unknown, event?: unknown) { return z.array(CardIdSchema).parse(model.call('selectForDrag', ids, hit, board, event)); }
export function expandDrag(cards: unknown, board: unknown, event?: unknown) { return preserve(z.array(CardSchema), model.call('expandDrag', cards, board, event)); }
export function snapDrag(start: unknown, dx: number, dy: number, board: unknown, view: unknown, options?: unknown) {
  return z.object({ dx: z.number(), dy: z.number(), guides: z.array(z.unknown()) }).parse(model.call('snapDrag', start, dx, dy, board, view, options));
}
export function dropCommands(cards: unknown, board: unknown, kind?: string) { return z.array(CommandSchema).parse(model.call('dropCommands', cards, board, kind)); }
export function alignmentCommands(cards: unknown, all: unknown, direction: string) {
  return z.array(point.extend({ op: z.literal('move'), id: CardIdSchema })).parse(model.call('alignmentCommands', cards, all, direction));
}
