import { z } from 'zod/v4';
import { JsonSchema } from '@aegis/domain/schema';
import { legacyModule } from './module.ts';
const model = await legacyModule(new URL('../../../app/src/features/agents/state.js', import.meta.url).href);
const readToken = z.object({ id: z.number(), events: z.map(z.string(), z.number()) });
const agent = z.object({ id: z.string(), revision: z.number().optional() }).catchall(JsonSchema.optional());
export function createAgentState() {
  return z.object({
    beginRead: z.function({ input: [], output: readToken }),
    mergeEvent: z.function({ input: [agent], output: z.boolean() }),
    mergeSnapshot: z.function({ input: [agent, readToken], output: z.boolean() }),
    get: z.function({ input: [z.string()], output: agent.optional() }),
  }).parse(model.call('createAgentState'));
}
