import { z } from 'zod/v4';
import { ChartPointSchema, JsonSchema } from '@aegis/domain/schema';
import { legacyModule } from './module.ts';
// Preserve the incomplete historic summary inputs instead of inventing missing content.
const summary = await legacyModule('@aegis/domain/summary');
const plotPreview = z.object({
  type: z.literal('plot'), kind: z.string().optional(), value: z.string(), label: z.string(), seriesCount: z.number(),
  series: z.array(z.object({ name: z.string(), value: z.string(), points: z.array(ChartPointSchema) })),
  parts: z.array(z.object({ value: z.number().nullable().optional() })),
});
const sheetPreview = z.object({ type: z.literal('sheet'), columns: z.array(z.string()), rows: z.array(z.array(z.string())) });
const diagramPreview = z.object({ type: z.literal('diagram'), nodes: z.array(JsonSchema), edges: z.array(JsonSchema) });
const result = z.object({ title: z.string(), kind: z.string(), facts: z.array(z.string()), sourceStatus: z.string().optional(), preview: z.discriminatedUnion('type', [plotPreview, sheetPreview, diagramPreview]).optional() });
export function cardSummary(card: unknown, cards?: unknown) { return result.parse(summary.call('cardSummary', card, cards)); }
export function boardSubtitle(board: unknown) { return z.string().parse(summary.call('boardSubtitle', board)); }

export function plotSummary(card: unknown, cards?: unknown) { return result.extend({ preview: plotPreview }).parse(summary.call('cardSummary', card, cards)); }
export function diagramSummary(card: unknown) { return result.extend({ preview: diagramPreview }).parse(summary.call('cardSummary', card)); }
export function sheetSummary(card: unknown) { return result.extend({ preview: sheetPreview }).parse(summary.call('cardSummary', card)); }
