import { z } from 'zod/v4';
import { CommandSchema, JsonSchema } from '@aegis/domain/schema';

// This fixture boundary exercises the legacy template module until chrome owns its TS replacement.
const moduleUrl = new URL('../../app/src/features/library/templates.js', import.meta.url).href;
const legacy = z.record(z.string(), z.unknown()).parse(await import(moduleUrl));
function invoke(name: string, ...args: unknown[]): unknown {
  const candidate = legacy[name];
  if (typeof candidate !== 'function') throw new Error(`Missing template export ${name}`);
  return candidate(...args);
}
const framework = z.object({ items: z.array(z.object({ t: z.string() }).catchall(z.unknown())) }).catchall(z.unknown());
export const frameworks = z.record(z.string(), framework).parse(legacy.frameworks);
export const starters = z.record(z.string(), z.array(z.unknown())).parse(legacy.starters);
export function templateCommands(key: string, board: unknown, makeId: () => string) {
  return z.array(CommandSchema).parse(invoke('templateCommands', key, board, makeId));
}
const geometry = z.object({ id: z.string(), type: z.string(), parent: z.string().optional(), x: z.number(), y: z.number(), w: z.number(), h: z.number() }).catchall(JsonSchema);
export function expandTemplateDrag(cards: unknown, board: unknown) {
  return z.array(geometry).parse(invoke('expandTemplateDrag', cards, board));
}
export function templateDropCommands(cards: unknown, board: unknown, kind: string) {
  return z.array(z.object({ op: z.literal('update'), id: z.string(), set: z.object({ parent: z.string() }) })).parse(invoke('templateDropCommands', cards, board, kind));
}
