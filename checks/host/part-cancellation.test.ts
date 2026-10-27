import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod/v4';
import { BoardSchema } from '@aegis/domain/schema';
import { hostFixture } from './fixture.ts';
import { required } from './required.ts';

const AgentSchema = z.object({ id: z.string(), parent: z.string().nullable(), running: z.boolean() });
test('stopping a lead cancels its waiting helper and releases the request promptly', async () => {
  const host = await hostFixture({ extra: { AEGIS_FAKE_DELAY_MS: '5000' } });
  try {
    const board = BoardSchema.parse(await host.json('/boards', { name: 'Part cancellation' }));
    const started = z.array(z.object({ id: z.string() })).parse(await host.json('/agents', {
      boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS ' + JSON.stringify([
        ['start_part', { title: 'Research', goal: 'Wait for a result', brief: 'FAKEREPLY Research complete' }],
      ]),
    }));
    const leadId = required(started[0]).id;
    let helper: z.output<typeof AgentSchema> | undefined;
    const deadline = Date.now() + 14000;
    while (Date.now() < deadline) {
      helper = z.array(AgentSchema).parse(await host.json('/agents?board=' + board.id)).find(agent => agent.parent === leadId && agent.running);
      if (helper) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.ok(helper, 'the lead is waiting for a live helper');
    const stopping = performance.now();
    await host.json(`/agents/${leadId}/stop`, {});
    assert.ok(performance.now() - stopping < 2000, 'Stop must interrupt the helper wait instead of waiting for its model response');
    const agents = z.array(AgentSchema).parse(await host.json('/agents?board=' + board.id));
    assert.equal(required(agents.find(agent => agent.id === leadId)).running, false);
    assert.equal(required(agents.find(agent => agent.id === helper.id)).running, false);
  } finally { await host.close(); }
});
