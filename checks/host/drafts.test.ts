import { z } from 'zod/v4';
import { BoardSchema, JsonRecordSchema } from '@aegis/domain/schema';
import { HostEventSchema } from '@aegis/protocol/http';
import { hostFixture } from './fixture.ts';
import { required } from './required.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftsFromView, fallbackStatus } from '../../agent/dist/status.js';
const fixture: unknown = await import(new URL('../demo-batch.mjs', import.meta.url).href);
const { demoBatch } = z.object({ demoBatch: z.array(JsonRecordSchema) }).parse(fixture);

const view = (blocks: unknown, run = true) => ({ docs: { 'pi.live': { run, generation: { message: { content: blocks } } } } });

test('drafts read only creates from streaming board_apply calls, and mark the last one as still being written', () => {
  const drafts = draftsFromView(view([
    { type: 'text', text: 'Making it now' },
    { type: 'toolCall', name: 'board_read', arguments: {} },
    { type: 'toolCall', name: 'board_apply', partialJson: '{"commands":[{', arguments: { commands: [
      { op: 'create', type: 'doc', text: 'Sleep report\nbody', w: 600.4 },
      { op: 'move', id: 'abc', x: 1, y: 2 },
      { op: 'create', type: 'object', kind: 'sheet', text: 'sleep.csv' },
      { op: 'create' },
    ] } },
  ]));
  assert.deepEqual(drafts.map(d => [d.type, d.kind, d.title, d.done]), [['doc', undefined, 'Sleep report', true], ['object', 'sheet', 'sleep.csv', true], ['note', undefined, '', false]]);
  assert.equal(required(drafts[0]).w, 600);
  assert.deepEqual(draftsFromView({}), []);
  assert.deepEqual(draftsFromView(view([{ type: 'toolCall', name: 'board_apply', arguments: { commands: 'not a list' } }])), []);
});

test('the status names what is being written while a batch streams', () => {
  assert.equal(fallbackStatus({ drafts: [{ title: 'Sleep report' }] }), 'Writing Sleep report');
  assert.equal(fallbackStatus({ drafts: [{ title: 'A' }, { title: 'Plan the week' }] }), 'Writing 2 windows, now Plan the week');
  assert.equal(fallbackStatus({ tools: [{ name: 'board_apply' }], drafts: [{ title: 'A' }] }), 'Updating the content on the board');
});

test('a streamed batch broadcasts growing drafts before it commits, then clears them', async () => {
  const host = await hostFixture({ extra: { AEGIS_FAKE_TPS: '600' } });
  try {
    const board = BoardSchema.parse(await host.json('/boards', { name: 'Drafts' }));
    const stream = await fetch(`${host.base}/events?token=${host.token}`, { signal: AbortSignal.timeout(20000) });
    const events = required(stream.body).getReader();
    await host.json('/agents', { boardId: board.id, brief: 'FAKE ' + JSON.stringify(demoBatch), model: { provider: 'fake', modelId: 'fake' } });
    const counts: number[] = [], decoder = new TextDecoder(); let buffer = '', committedWith: number | null | undefined = null, finished = false;
    const deadline = Date.now() + 20000;
    while (!finished && Date.now() < deadline) {
      const { value, done } = await events.read(); if (done) break;
      buffer += decoder.decode(value);
      for (let i; (i = buffer.indexOf('\n\n')) >= 0;) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (!line.startsWith('data: ')) continue;
        const value: unknown = JSON.parse(line.slice(6)), ev = HostEventSchema.parse(value);
        if (ev.type === 'agent' && ev.running) counts.push(z.array(JsonRecordSchema).parse(ev.drafts).length);
        if (ev.type === 'board' && committedWith === null) committedWith = counts.at(-1);
        if (ev.type === 'agent' && !ev.running && committedWith !== null) { assert.deepEqual(ev.drafts, []); finished = true; }
      }
    }
    await events.cancel();
    assert.ok(finished, 'the run finished');
    const growing = counts.filter(n => n > 0);
    assert.ok(new Set(growing).size >= 3, `drafts grew while streaming: ${counts.join(',')}`);
    assert.ok(growing.at(-1) === 9, 'every create in the batch was previewed');
  } finally { await host.close(); }
});
