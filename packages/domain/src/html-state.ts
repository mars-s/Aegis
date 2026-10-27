import { z } from 'zod/v4';

const IndexSchema = z.int().min(0).max(999);
export const HtmlStateSchema = z.strictObject({
  version: z.literal(1),
  controls: z.array(z.strictObject({
    index: IndexSchema, tag: z.enum(['INPUT', 'TEXTAREA', 'SELECT']),
    type: z.string().refine(type => !['password', 'file'].includes(type)),
    value: z.string(), checked: z.boolean(), selected: z.array(IndexSchema),
  })).max(1000),
  text: z.array(z.strictObject({ index: IndexSchema, text: z.string() })).max(1000),
  custom: z.json().optional(),
});
export type HtmlState = z.output<typeof HtmlStateSchema>;
export function parseHtmlState(value: unknown): HtmlState | null {
  if (typeof value !== 'string' || value.length > 65536 || new TextEncoder().encode(value).length > 65536) return null;
  try {
    const input: unknown = JSON.parse(value);
    const state = HtmlStateSchema.safeParse(input);
    if (!state.success) return null;
    const bounded = (value: z.output<z.ZodJSONSchema>, depth: number): boolean => depth <= 32 && (value === null || typeof value !== 'object' || Object.values(value).every(item => bounded(item, depth + 1)));
    return state.data.custom === undefined || bounded(state.data.custom, 0) ? state.data : null;
  } catch { return null; }
}
