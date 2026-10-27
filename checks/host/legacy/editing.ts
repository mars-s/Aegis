import { z } from 'zod/v4';
import { CardSchema, CommandSchema, LinkSchema, CardIdSchema, PropsSchema, JsonSchema } from '@aegis/domain/schema';
import type { Board } from '@aegis/domain/schema';
import { legacyModule } from './module.ts';
const model = await legacyModule(new URL('../../../app/src/features/editing/model.js', import.meta.url).href);
const layers = await legacyModule(new URL('../../../app/src/features/editing/layer-model.js', import.meta.url).href);
const commands = z.array(CommandSchema);
const clip = z.object({ from: z.string(), cards: z.array(CardSchema), links: z.array(LinkSchema), text: z.string() });
export function makeClip(board: unknown, ids: string[]) { return clip.parse(model.call('makeClip', board, ids)); }
export function cloneCommands(clip: unknown, board: unknown, centre: { x: number; y: number }, offset?: number) {
  return z.object({ commands }).parse(model.call('cloneCommands', clip, board, centre, offset));
}
export function arrange(board: unknown, ids: string[], how: string) { return commands.parse(model.call('arrange', board, ids, how)); }
export function stackCommands(board: unknown, ids: string[], direction: string) { return commands.parse(model.call('stackCommands', board, ids, direction)); }
const layoutUpdate = z.object({ op: z.literal('update'), id: CardIdSchema, set: z.object({ x: z.number().optional(), y: z.number().optional(), w: z.number().optional(), h: z.number().optional(), props: PropsSchema.optional() }).catchall(JsonSchema) });
export function collectionLayout(board: unknown, card: unknown, kids?: unknown, width?: number) { return z.array(z.discriminatedUnion('op', [layoutUpdate, z.object({ op: z.literal('order'), ids: z.array(CardIdSchema), to: z.number() })])).parse(model.call('collectionLayout', board, card, kids, width)); }
export function collectionDrop(board: unknown, cards: unknown, at: { x: number; y: number }) { return commands.parse(model.call('collectionDrop', board, cards, at)); }
export function effectiveFlag(board: unknown, card: unknown, flag: string) { return z.boolean().parse(model.call('effectiveFlag', board, card, flag)); }
export function snapRotation(degrees: number, shift = false, single = false) { return z.number().parse(model.call('snapRotation', degrees, shift, single)); }
export function lineHeightDefault(type: string) { return z.number().parse(model.call('lineHeightDefault', type)); }
export function toolbarOrder(defaults: string[], saved?: string[]) { return z.array(z.string()).parse(model.call('toolbarOrder', defaults, saved)); }
export function createHistory(options: { read: () => Board; apply: (commands: unknown[]) => void; busy?: () => boolean; delay?: number }) {
  const raw = model.call('createHistory', options);
  const methods = z.object({
    observe: z.function({ input: [z.unknown()], output: z.unknown() }),
    flush: z.function({ input: [], output: z.unknown() }),
    travel: z.function({ input: [z.number()], output: z.boolean() }),
  }).parse(raw);
  if (raw === null || typeof raw !== 'object') throw new Error('Missing history fixture');
  return { ...methods, get status() { return z.object({ length: z.number() }).parse(Reflect.get(raw, 'status')); } };
}
const layerEntry = z.object({ id: CardIdSchema });
export function layerParents(board: unknown) { return z.map(z.string(), z.string()).parse(layers.call('layerParents', board)); }
export function layerDescendants(board: unknown, ids: string[]) { return z.array(layerEntry).parse(layers.call('layerDescendants', board, ids)); }
