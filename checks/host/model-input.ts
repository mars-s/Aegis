import assert from 'node:assert/strict';
import { z } from 'zod/v4';
import { JsonSchema } from '@aegis/domain/schema';

export const ModelInputSchema = z.object({ messages: z.array(z.object({ role: z.string(), content: z.union([z.string(), z.array(JsonSchema)]).optional() }).catchall(JsonSchema)) }).catchall(JsonSchema);
const SummarySchema = z.object({ total: z.number(), truncated: z.boolean(), cards: z.array(z.object({ id: z.string() }).catchall(JsonSchema)) }).catchall(JsonSchema);
const TextSchema = z.object({ type: z.literal('text'), text: z.string() });

// These assertions retain the original payload checks from checks/agent-speed.mjs.
export function inspectModelInput(value: unknown, forbiddenBody = '') {
  const input = ModelInputSchema.parse(value);
  const messages = JSON.stringify(input.messages.filter(message => message.role === 'user'));
  const summaryPart = input.messages.flatMap(message => message.role === 'user' && Array.isArray(message.content) ? message.content : []).flatMap(part => {
    const parsed = TextSchema.safeParse(part); return parsed.success ? [parsed.data] : [];
  }).find(part => part.text.startsWith('Current board summary'));
  assert.ok(summaryPart, 'first model input includes the board summary');
  const summaryText = summaryPart.text.slice(summaryPart.text.indexOf('\n') + 1);
  if (forbiddenBody) assert.ok(!JSON.stringify(input).includes(forbiddenBody), 'first model input must omit full document bodies');
  const summary = SummarySchema.parse(JSON.parse(summaryText)), summaryBytes = Buffer.byteLength(summaryText);
  assert.ok(summaryBytes <= 24000, `compact board summary exceeds 24000 bytes: ${summaryBytes}`);
  assert.ok(Buffer.byteLength(messages) <= 32000, 'first-turn messages stay within 32000 bytes');
  assert.ok(summary.cards.every(card => !('props' in card) && !('data' in card)), 'summary omits document bodies and object datasets');
  return { summary, summaryBytes, messageBytes: Buffer.byteLength(messages), payloadBytes: Buffer.byteLength(JSON.stringify(input)) };
}
export function assertBoundedGrowth(small: ReturnType<typeof inspectModelInput>, large: ReturnType<typeof inspectModelInput>): void {
  assert.equal(small.summary.total, 25); assert.equal(large.summary.total, 250);
  assert.equal(large.summary.truncated, true);
  assert.ok(large.summary.cards.length <= 100, 'first turn pages large boards');
  assert.ok(large.summaryBytes <= small.summaryBytes * 4.5, '10x more cards must cost at most 4.5x summary bytes');
  assert.ok(large.payloadBytes <= small.payloadBytes * 4.5, 'actual provider payload grows sublinearly');
  assert.ok(large.payloadBytes - small.payloadBytes <= 20000, 'provider payload growth is bounded by 20000 bytes');
}
