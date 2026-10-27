import { z } from 'zod/v4';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CaseRecordSchema = z.object({ file: z.string(), name: z.string(), status: z.enum(['pass', 'fail']) });
const eventSchema = z.object({ type: z.enum(['test:pass', 'test:fail']), data: z.object({ file: z.string(), name: z.string() }) });
const root = fileURLToPath(new URL('../..', import.meta.url));

export default async function* report(events: AsyncIterable<unknown>): AsyncGenerator<string> {
  for await (const event of events) {
    const parsed = eventSchema.safeParse(event);
    if (!parsed.success) continue;
    const { type, data } = parsed.data;
    yield `${JSON.stringify({ file: relative(root, data.file), name: data.name, status: type === 'test:pass' ? 'pass' : 'fail' })}\n`;
  }
}
