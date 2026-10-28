import { z } from 'zod/v4';
export const BundleRequestSchema = z.object({ bytes: z.instanceof(Uint8Array), format: z.enum(['pptx', 'key']) });
export const BundleResponseSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('ok'), entries: z.record(z.string(), z.instanceof(Uint8Array)) }), z.object({ kind: z.literal('error'), message: z.string() })]);
export type BundleResponse = z.output<typeof BundleResponseSchema>;
