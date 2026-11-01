import { WELCOME_BRIEF } from '@aegis/domain/profile';
import { z } from 'zod/v4';

export const displayBrief = (text = ''): string => text === WELCOME_BRIEF ? 'Introduction' : text.replace(/\n\n\(Work on the selected cards: [^\r\n)]+\)\s*$/, '');
const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('toolCall'), id: z.string().optional(), name: z.string(), arguments: z.unknown().optional(), partialJson: z.string().optional() }),
]);
const blocks = (value: unknown) => Array.isArray(value) ? value.flatMap((block: unknown) => { const parsed = BlockSchema.safeParse(block); return parsed.success ? [parsed.data] : []; }) : [];
const MessageSchema = z.object({ content: z.unknown().optional() }).transform(message => ({ content: typeof message.content === 'string' ? message.content : blocks(message.content) }));
export const ViewSchema = z.object({
  entries: z.array(z.object({ kind: z.string(), id: z.union([z.string(), z.number()]).optional(), model: z.array(MessageSchema).optional() })).default([]),
  docs: z.object({ 'pi.live': z.object({ run: z.unknown().optional(),
    tools: z.array(z.object({ name: z.string(), status: z.string().optional(), callId: z.string().optional(), arguments: z.unknown().optional() })).optional(),
    nestedTools: z.array(z.object({ name: z.string(), status: z.string().optional(), callId: z.string().optional(), arguments: z.unknown().optional() })).optional(),
    generation: z.object({ message: MessageSchema.optional() }).optional(),
  }).optional() }).optional(),
});
export function conversationFromView(input: unknown) {
  const value = ViewSchema.parse(input);
  const turns: { id: string; role: 'user' | 'assistant'; text: string }[] = [];
  for (const entry of value.entries) {
    if (!['pi.user', 'aegis.request', 'pi.assistant'].includes(entry.kind)) continue;
    const content = entry.model?.[0]?.content;
    const parts = typeof content === 'string' ? [{ type: 'text', text: content }] : content?.filter(c => c.type === 'text') ?? [];
    const user = entry.kind !== 'pi.assistant';
    const text = user ? displayBrief(parts[0]?.text ?? '') : parts.map(c => c.text).join('');
    if (!text.trim()) continue;
    if (!user && Array.isArray(content) && content.some(c => c.type === 'toolCall')) continue;
    turns.push({ id: String(entry.id ?? turns.length), role: user ? 'user' : 'assistant', text });
  }
  const content = value.docs?.['pi.live']?.generation?.message?.content;
  const partial = Array.isArray(content) ? content.filter(c => c.type === 'text').map(c => c.text).join('') : '';
  return { turns, text: turns.findLast(t => t.role === 'assistant')?.text ?? '', partial };
}
