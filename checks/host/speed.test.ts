import { z } from 'zod/v4';
import { BoardSchema, JsonRecordSchema } from '@aegis/domain/schema';
import { BatchResponseSchema, HostEventSchema } from '@aegis/protocol/http';
import type { HostEvent } from '@aegis/protocol/http';
import { applyBatch } from './batch.ts';
import { hostFixture } from './fixture.ts';
import { required } from './required.ts';
const AgentSchema = z.object({ id: z.string(), running: z.boolean(), text: z.string() });
const StartedSchema = z.array(z.object({ id: z.string() }));
const ModelsSchema = z.array(z.object({ provider: z.string(), modelId: z.string() }));
const TimingSchema = z.object({ aegis: z.literal('timing'), kind: z.string(), name: z.string().optional(), hasBoardSummary: z.boolean().optional(), outputBytes: z.number().optional() });
const inputsOf = (text: string) => text.trim().split('\n').map(line => { const value: unknown = JSON.parse(line); return ModelInputSchema.parse(value); });
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyBoard, objectContentSize } from '@aegis/domain/commands';
const fixture: unknown = await import(new URL('../demo-batch.mjs', import.meta.url).href);
const { demoBatch } = z.object({ demoBatch: z.array(JsonRecordSchema) }).parse(fixture);
import { inspectModelInput, assertBoundedGrowth, ModelInputSchema } from './model-input.ts';

test('item 11: demo windows fit content, share the grid and never overlap', () => {
  const result = applyBatch(emptyBoard('demo'), { commands: demoBatch });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const cards = result.board.cards, [doc, stats, goals, diagram, plot, sheet, deck] = cards; assert.ok(doc && stats && goals && diagram && plot && sheet && deck);
  assert.equal(doc.type, 'doc'); assert.equal(deck.type, 'deck');
  assert.ok(!cards.some(c => c.kind === 'reply' || c.type === 'note'), 'answer stays in chat');
  assert.equal(doc.x, deck.x); assert.equal(stats.x, diagram.x);
  assert.equal(stats.y, goals.y); assert.equal(doc.y, stats.y);
  assert.equal(doc.x + doc.w + 24, stats.x); assert.equal(stats.x + stats.w + 24, goals.x);
  assert.equal(diagram.y, Math.max(stats.y + stats.h, goals.y + goals.h) + 24);
  assert.ok(diagram.h < 180, 'a short horizontal diagram must hug its content');
  assert.ok(plot.h >= 36 + 32 + 220 + 28, 'strip, padding, plot, labels and source fit');
  assert.ok(sheet.h >= 36 + 7 * 29 + 28, 'all sheet rows and source fit');
  for (const a of cards) {
    const content = objectContentSize(a);
    assert.ok(a.w >= content.w && a.h >= content.h, `content fits ${a.kind ?? a.type}`);
    assert.equal((a.x - 40) % 128, 0, 'left edge follows the 12-column grid');
    for (const b of cards) if (a !== b) assert.ok(a.x + a.w + 24 <= b.x || b.x + b.w + 24 <= a.x || a.y + a.h + 24 <= b.y || b.y + b.h + 24 <= a.y, `${a.kind ?? a.type} overlaps ${b.kind ?? b.type}`);
  }
  const resized = applyBatch(result.board, { commands: [{ op: 'update', id: stats.id, set: { h: 420 } }] });
  assert.ok(resized.ok); assert.ok(required(resized.board.cards.find(c => c.id === diagram.id)).y >= stats.y + 420 + 24, 'rendered height changes repack supports');
  const manual = applyBatch(resized.board, { commands: [{ op: 'move', id: stats.id, x: 1900, y: 20 }] });
  assert.ok(!required(required(manual.board.cards[0]).props).contentLayout, 'manual positioning releases automatic packing');
});

test('item 11: long replies grow and impossible spans fail atomically', () => {
  const result = applyBatch(emptyBoard('long'), { commands: [
    { op: 'create', type: 'object', kind: 'reply', ref: 'reply', data: { headline: 'A saved answer', text: 'A useful sentence about the result. '.repeat(10), figures: [{ label: 'Focus', value: '15 h', note: 'Illustrative' }, { label: 'Meetings', value: '8 h' }] } },
    { op: 'layout', ids: ['$reply'], shape: 'grid', cols: 12, spans: [6], fit: true },
  ] });
  assert.ok(result.ok); assert.ok(required(result.board.cards[0]).h > 250);
  // A slightly narrow span widens instead of discarding the whole batch: a live run regenerated 14 KB three times.
  const narrow = structuredClone(demoBatch), narrowLayout = required(narrow.at(-2)), spans = z.array(z.number()).parse(narrowLayout.spans); spans[1] = 1; narrowLayout.spans = spans;
  const widened = applyBatch(emptyBoard('narrow'), { commands: narrow });
  assert.ok(widened.ok, JSON.stringify(widened.errors)); assert.match(required(required(widened.notes)[0]), /widened .* from 1 to \d+ columns/);
  assert.deepEqual(z.array(z.number()).parse(required(narrow.at(-2)).spans).slice(0, 2), [6, 1], 'the caller\'s command is not mutated');
  for (const a of widened.board.cards) for (const b of widened.board.cards) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.kind ?? a.type} overlaps ${b.kind ?? b.type}`);
  // Content wider than the whole grid still fails atomically.
  const bad = structuredClone(demoBatch); Object.assign(required(bad.at(-2)), { cols: 2, spans: z.array(z.number()).parse(required(bad.at(-2)).spans).map(() => 1), columns: undefined });
  const board = emptyBoard('bad'), failed = applyBatch(board, { commands: bad });
  assert.equal(failed.ok, false); assert.equal(failed.board, board); assert.match(required(failed.errors[0]).reason, /wider than the whole grid/);
});

test('measured repacking retains a nonzero grid origin and starting column', () => {
  const commands = structuredClone(demoBatch);
  required(commands.at(-2)).columns = [6, 0, 3, 0, 0, 0, 6, 0, 3];
  required(commands.at(-2)).x = 200; required(commands.at(-2)).y = 300;
  const result = applyBatch(emptyBoard('offset'), { commands });
  assert.ok(result.ok);
  const doc = required(result.board.cards[0]), x = doc.x;
  assert.equal(x, 200 + 6 * 128);
  const fitted = applyBatch(result.board, { commands: [{ op: 'update', id: doc.id, set: { h: doc.h - 120 } }] });
  assert.ok(fitted.ok); assert.equal(required(fitted.board.cards[0]).x, x); assert.equal(required(fitted.board.cards[0]).y, 300);
});

let host: Awaited<ReturnType<typeof hostFixture>>, data = '', base = '', token = '', records: z.output<typeof TimingSchema>[] = [];
const call = async <S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>> => { const response = await host.response(path, body); const value: unknown = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return schema.parse(value); };
before(async () => {
  host = await hostFixture({ extra: data => ({ AEGIS_PROFILE_TOOLS: '1', AEGIS_FAKE_CAPTURE_INPUT: join(data, 'model-input.jsonl') }), record(value) { const parsed = TimingSchema.safeParse(value); if (parsed.success) records.push(parsed.data); } });
  data = host.data; base = host.base; token = host.token;
});
after(async () => { await host?.close(); });

test('item 10: first-turn summary, compact reads and opt-in full card details', async () => {
  const board = await call('/boards', { name: 'Read sizes' }, BoardSchema);
  const body = 'Detailed project notes. '.repeat(1000);
  await call(`/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'doc', text: 'Long document', props: { body }, newId: 'details1' }] }, BatchResponseSchema);
  records = [];
  const [agent] = await call('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS ' + JSON.stringify([['board_read', {}], ['board_read', { ids: ['details1'], detail: true }]]) }, StartedSchema);
    assert.ok(agent);
  const started = Date.now();
  for (;;) {
    const a = required((await call(`/agents?board=${board.id}`, undefined, z.array(AgentSchema))).find(a => a.id === agent.id));
    if (!a.running && a.text) break;
    assert.ok(Date.now() - started < 10000); await new Promise(r => setTimeout(r, 20));
  }
  assert.equal(required(records.find(r => r.kind === 'model')).hasBoardSummary, true);
  const reads = records.filter(r => r.kind === 'tool' && r.name === 'board_read');
  assert.equal(reads.length, 2); assert.ok(required(required(reads[0]).outputBytes) < 1000); assert.ok(required(required(reads[1]).outputBytes) > body.length);
  const inputs = inputsOf(await readFile(join(data, 'model-input.jsonl'), 'utf8'));
  const first = inputs.find(input => JSON.stringify(input.messages).includes('details1'));
  const measured = inspectModelInput(first, body);
  assert.ok(measured.summaryBytes < 2000);
  assert.equal(required(measured.summary.cards[0]).id, 'details1');
});

test('item 10: actual first-turn payload growth is bounded across 25 and 250 cards', async () => {
  const measured: ReturnType<typeof inspectModelInput>[] = [];
  const body = 'PRIVATE_DOCUMENT_BODY_NEVER_IN_FIRST_TURN '.repeat(1000);
  for (const count of [25, 250]) {
    const board = await call('/boards', { name: `Payload ${count}` }, BoardSchema);
    const seed = Array.from({ length: count }, (_, i) => ({ op: 'create', type: 'doc', text: `Document ${i}`, newId: `payload${String(i).padStart(4, '0')}`, props: { body }, x: i * 240, y: 0 }));
    for (let offset = 0; offset < count; offset += 25) await call(`/boards/${board.id}/batch`, { commands: seed.slice(offset, offset + 25) }, BatchResponseSchema);
    const brief = `Measure first turn for ${count} cards`;
    const [agent] = await call('/agents', { boardId: board.id, brief, model: { provider: 'fake', modelId: 'fake' } }, StartedSchema);
    assert.ok(agent);
    const deadline = Date.now() + 15000;
    while ((await call(`/agents?board=${board.id}`, undefined, z.array(AgentSchema))).find(a => a.id === agent.id)?.running) { assert.ok(Date.now() < deadline); await new Promise(r => setTimeout(r, 20)); }
    const inputs = inputsOf(await readFile(join(data, 'model-input.jsonl'), 'utf8'));
    const input = inputs.find(input => input.messages.some(message => message.role === 'user' && Array.isArray(message.content) && message.content.some(part => z.object({ text: z.string() }).safeParse(part).data?.text === brief)));
    measured.push(inspectModelInput(input, body));
  }
  assertBoundedGrowth(required(measured[0]), required(measured[1]));
  process.stdout.write('PAYLOAD ' + JSON.stringify(measured.map(({ summaryBytes, messageBytes, payloadBytes }) => ({ summaryBytes, messageBytes, payloadBytes }))) + '\n');
});

test('item 10: default models favour a fast model and keep the strong model available', async () => {
  const models = await call('/models', undefined, ModelsSchema);
  assert.equal(required(models.filter(m => m.provider === 'openai')[0]).modelId, 'gpt-6-luna');
  assert.ok(models.some(m => m.modelId === 'gpt-6.1-sol'));
});

test('item 10: parallel tool calls publish each committed diff before the run finishes', async () => {
  const board = await call('/boards', { name: 'Parallel diffs' }, BoardSchema);
  await call(`/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'note', newId: 'parallel1', text: 'One' }, { op: 'create', type: 'note', newId: 'parallel2', text: 'Two' }] }, BatchResponseSchema);
  const abort = new AbortController();
  const response = await fetch(base + '/events?token=' + token, { signal: abort.signal });
  const reader = required(response.body).getReader(), decoder = new TextDecoder(), events: HostEvent[] = [];
  let pending = '';
  const collecting = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        let i;
        while ((i = pending.indexOf('\n\n')) >= 0) {
          const line = pending.slice(0, i); pending = pending.slice(i + 2);
          if (line.startsWith('data: ')) events.push(HostEventSchema.parse(JSON.parse(line.slice(6))));
        }
      }
    } catch (error) { if (!abort.signal.aborted) throw error; }
  })();
  try {
    const [agent] = await call('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS ' + JSON.stringify([[
      ['board_apply', { commands: [{ op: 'move', id: 'parallel1', x: 80, y: 40 }] }],
      ['board_apply', { commands: [{ op: 'move', id: 'parallel2', x: 400, y: 40 }] }],
    ]]) }, StartedSchema);
    assert.ok(agent);
    const deadline = Date.now() + 10000;
    while (!events.some(e => e.type === 'agent' && e.id === agent.id && !e.running && e.text)) { assert.ok(Date.now() < deadline); await new Promise(r => setTimeout(r, 20)); }
    const changes = events.filter(event => event.type === 'board').filter(event => event.boardId === board.id);
    assert.deepEqual(changes.map(e => [e.baseRev, e.rev]), [[1, 2], [2, 3]]);
    assert.ok(changes.every(e => e.patch.cards.length === 1 && !e.patch.order && !e.patch.links));
    const readyAt = events.findIndex(e => e.type === 'agent' && e.id === agent.id && !e.running && e.text);
    assert.ok(changes.every(e => events.indexOf(e) < readyAt));
    const final = await call(`/boards/${board.id}`, undefined, BoardSchema);
    assert.deepEqual(final.cards.map(c => [c.x, c.y]), [[80, 40], [400, 40]]);
  } finally { abort.abort(); await collecting; }
});
