import { z } from 'zod/v4';
import { JsonSchema, JsonRecordSchema, LegacyCardSchema, LinkSchema, CardIdSchema } from '@aegis/domain/schema';

const partialCard = z.object({ id: CardIdSchema }).catchall(JsonSchema);
const patch = z.object({ cards: z.array(LegacyCardSchema), removed: z.array(z.string()).default([]), fields: JsonRecordSchema.default({}), links: z.array(LinkSchema).optional(), order: z.array(z.string()).optional() });
export const HistoryEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('aegis.request'), data: z.object({ requestId: z.string(), brief: z.string(), started: z.number() }) }),
  z.object({ kind: z.literal('aegis.request.end'), data: z.object({ requestId: z.string(), finished: z.number() }) }),
  z.object({ kind: z.literal('aegis.request.undo'), data: z.object({ requestId: z.string() }) }),
  z.object({ kind: z.literal('aegis.change'), data: z.object({ requestId: z.string(), before: patch, after: patch }) }),
  z.object({ kind: z.literal('aegis.normalise'), data: z.object({ before: z.object({ cards: z.array(partialCard) }), after: z.object({ cards: z.array(partialCard) }) }) }),
]);
export type HistoryEntry = z.output<typeof HistoryEntrySchema>;
export function historyEntries(value: unknown): HistoryEntry[] {
  return z.array(z.unknown()).parse(value).flatMap(entry => {
    const kind = z.object({ kind: z.string() }).safeParse(entry);
    if (!kind.success || !['aegis.request', 'aegis.request.end', 'aegis.request.undo', 'aegis.change', 'aegis.normalise'].includes(kind.data.kind)) return [];
    return [HistoryEntrySchema.parse(entry)];
  });
}
export const HistoryBoardSchema = z.object({ cards: z.array(LegacyCardSchema), links: z.array(LinkSchema).default([]) }).catchall(JsonSchema);
export type HistoryBoard = z.output<typeof HistoryBoardSchema>;
