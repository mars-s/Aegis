import { z } from 'zod/v4';
// Worker messages are untrusted structured clones. Validate both directions.
const ProfileColumnSchema = z.object({ name: z.string(), kind: z.string(), empty: z.number().int().nonnegative(), min: z.union([z.string(), z.number()]).optional(), max: z.union([z.string(), z.number()]).optional(), sum: z.number().optional(), mean: z.number().optional(), median: z.number().optional(), distinct: z.number().optional(), top: z.array(z.object({ value: z.string(), count: z.number() })).optional() });
export const ProfileSchema = z.object({ rows: z.number().int().nonnegative(), columns: z.array(ProfileColumnSchema) });
export type Profile = z.output<typeof ProfileSchema>;
export const WorkerInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('load'), epoch: z.number().int(), url: z.string().url() }),
  z.object({ type: z.literal('sort'), epoch: z.number().int(), column: z.number().int().nonnegative(), direction: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ type: z.literal('rows'), epoch: z.number().int(), start: z.number().int().nonnegative(), end: z.number().int().nonnegative(), request: z.number().int() }),
]);
export type WorkerInput = z.output<typeof WorkerInputSchema>;
export const WorkerOutputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), epoch: z.number().int(), columns: z.array(z.string()), profile: ProfileSchema, total: z.number().int().nonnegative() }),
  z.object({ type: z.literal('sorted'), epoch: z.number().int(), column: z.number().int(), direction: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ type: z.literal('rows'), epoch: z.number().int(), request: z.number().int(), start: z.number().int(), rows: z.array(z.object({ number: z.number().int().positive(), cells: z.array(z.string()) })) }),
  z.object({ type: z.literal('error'), epoch: z.number().int(), message: z.string() }),
]);
export type WorkerOutput = z.output<typeof WorkerOutputSchema>;
