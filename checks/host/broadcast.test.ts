import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoardSchema } from '@aegis/domain/schema';
import { HostEventSchema } from '@aegis/protocol/http';
import { z } from 'zod/v4';
import { hostFixture } from './fixture.ts';

test('agent collection creation reaches SSE and durable Undo when optional child props are absent', async () => {
  const host = await hostFixture(), abort = new AbortController();
  try {
    const board = BoardSchema.parse(await host.json('/boards', { name: 'Collection broadcast' }));
    const response = await fetch(host.base + '/events', { headers: { authorization: `Bearer ${host.token}` }, signal: abort.signal });
    assert.ok(response.body);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    const received = (async () => {
      let buffered = '';
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) throw new Error('SSE closed before the board event');
        buffered += decoder.decode(chunk.value, { stream: true });
        let newline: number;
        while ((newline = buffered.indexOf('\n\n')) >= 0) {
          const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 2);
          if (!line.startsWith('data: ')) continue;
          const value: unknown = JSON.parse(line.slice(6)), event = HostEventSchema.parse(value);
          if (event.type === 'board' && event.boardId === board.id) return event;
        }
      }
    })();
    const timeout = setTimeout(() => abort.abort(), 10000);
    try {
      await host.json('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKE ' + JSON.stringify([
        { op: 'create', type: 'note', text: 'First idea', ref: 'first' },
        { op: 'create', type: 'note', text: 'Second idea', ref: 'second' },
        { op: 'create', type: 'coll', text: 'Ideas', props: { kids: ['$first', '$second'] } },
      ]) });
      const event = await received;
      assert.equal(event.patch.cards.length, 3);
      assert.deepEqual(event.patch.cards.filter(card => card.type === 'note').map(card => card.text), ['First idea', 'Second idea']);
      const historySchema = z.array(z.object({ history: z.array(z.object({ canUndo: z.boolean(), changes: z.array(z.object({ title: z.string() })) })) }));
      for (let attempt = 0; attempt < 100; attempt++) {
        const agents = historySchema.parse(await host.json('/agents?board=' + board.id)), entry = agents[0]?.history[0];
        if (entry?.canUndo) { assert.equal(entry.changes.length, 3); return; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.fail('Collection history did not become undoable');
    } finally { clearTimeout(timeout); }
  } finally { abort.abort(); await host.close(); }
});
