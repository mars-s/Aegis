import { z } from 'zod/v4';
import { BoardSchema } from '@aegis/domain/schema';
import { HostEventSchema } from '@aegis/protocol/http';
import { required } from './required.ts';
const ModelSchema = z.object({ provider: z.string(), modelId: z.string() });
const AgentSchema = z.object({ id: z.string(), statusModel: ModelSchema, status: z.string(), running: z.boolean(), revision: z.number() });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityFromView, activityText, createStatusTracker, FAKE_STATUS, fallbackStatus, summariseStatus } from '../../agent/dist/status.js';

test('status falls back to plain tool-based phrases without a classifier or after failure', async () => {
  assert.equal(fallbackStatus({ tools: ['board_read'] }), 'Reading the board and its content');
  const activity = { tools: [{ name: 'board_apply', arguments: '{}' }] };
  assert.equal(await summariseStatus(activity), 'Updating the content on the board');
  assert.equal(await summariseStatus(activity, { complete: async () => { throw Error('offline'); } }), fallbackStatus(activity));
  assert.equal(await summariseStatus(activity, { complete: async () => 'Invalid.' }), fallbackStatus(activity));
});
test('fake status is deterministic and never calls a provider', async () => {
  assert.equal(await summariseStatus({ brief: 'anything' }, { fake: true, complete: () => assert.fail('provider called') }), FAKE_STATUS);
});
test('classifier gets bounded context and strict instructions, and its phrase is preserved', async () => {
  const activity = { brief: 'b'.repeat(3000), tools: [{ name: 'doc_update', arguments: 'a'.repeat(3000) }], partial: 't'.repeat(3000) };
  assert.ok(activityText(activity).length <= 1500);
  assert.equal(await summariseStatus(activity, { complete: async (system, text) => {
    assert.match(system, /3 to 8 words/); assert.match(system, /Australian English/); assert.ok(text.length <= 1500);
    return 'Writing the sleep report';
  } }), 'Writing the sleep report');
});
test('status updates debounce changes, never call more than once per four seconds, and cancel on idle', async () => {
  let time = 0, due = 0, calls = 0, timer: (() => Promise<void>) | null = null; const published: string[] = [];
  const tracker = createStatusTracker({ now: () => time, schedule: (fn, delay) => { timer = fn; due = time + delay; return 1; }, cancel: () => { timer = null; },
    summarise: async () => { calls++; return 'Writing the sleep report'; }, publish: s => published.push(s) });
  tracker.update({ brief: 'report', tools: [], partial: '' });
  tracker.update({ brief: 'report', tools: [{ name: 'read' }], partial: '' });
  assert.equal(calls, 0); time = due; await required<() => Promise<void>>(timer)(); assert.equal(calls, 1);
  tracker.update({ brief: 'report', tools: [{ name: 'write' }], partial: '' });
  assert.equal(due, 4450); time = due; await required<() => Promise<void>>(timer)(); assert.equal(calls, 2);
  timer = null; tracker.update({ brief: 'report', tools: [{ name: 'write' }], partial: '' }); assert.equal(timer, null);
  tracker.update({ brief: 'report', tools: [{ name: 'write', arguments: 'new passage' }], partial: '' });
  tracker.stop(); assert.equal(timer, null); assert.equal(published.length, 2);
});
test('a late classifier result cannot publish after the run stops', async () => {
  let timer: (() => Promise<void>) | null = null, finish: (text: string) => void = () => assert.fail('Classifier did not start'); const published: string[] = [];
  const tracker = createStatusTracker({ schedule: fn => { timer = fn; return 1; }, summarise: () => new Promise(r => { finish = r; }), publish: s => published.push(s) });
  tracker.update({ brief: 'report', tools: [], partial: '' }); const call = required<() => Promise<void>>(timer)(); tracker.stop(); finish('Writing the sleep report'); await call; assert.deepEqual(published, []);
});

test('Pi Durable activity includes current tool arguments and streamed partial text', () => {
  const activity = activityFromView({ brief: 'Write a report' }, { docs: { 'pi.live': { tools: [{ callId: 'call1', name: 'doc_update', status: 'running' }], generation: { message: { content: [{ type: 'text', text: 'Writing the findings' }] } } } },
    entries: [{ kind: 'pi.assistant', model: [{ content: [{ type: 'toolCall', id: 'call1', name: 'doc_update', arguments: { id: 'report', text: 'Findings' } }] }] }] });
  assert.equal(activity.partial, 'Writing the findings'); assert.match(required(activity.tools[0]).arguments, /Findings/); assert.equal(required(activity.tools[0]).name, 'doc_update');
});

test('the real host broadcasts fake status while running, retains the model choice and stops', async () => {
  const { spawn } = await import('node:child_process'); const { mkdtemp } = await import('node:fs/promises'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const token = 'status-check-' + process.pid;
  const child = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: new URL('../../agent/', import.meta.url).pathname, env: { ...process.env, AEGIS_DATA: await mkdtemp(join(tmpdir(), 'aegis-status-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_DELAY_MS: '1200' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const abort = new AbortController();
  try {
    const port = await new Promise<string>((resolve, reject) => { child.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m?.[1]) resolve(m[1]); }); child.on('exit', code => reject(Error('Host exited ' + code))); });
    const base = `http://127.0.0.1:${port}`;
    const call = async <S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>> => {
      const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const value: unknown = await response.json(); return schema.parse(value);
    };
    const events = await fetch(base + '/events', { headers: { authorization: `Bearer ${token}` }, signal: abort.signal });
    const board = await call('/boards', { name: 'Status check' }, BoardSchema), model = { provider: 'fake', modelId: 'fake' };
    const { id } = required((await call('/agents', { boardId: board.id, brief: 'FAKE []', model, statusModel: model }, z.array(z.object({ id: z.string() }))))[0]);
    const reader = required(events.body).getReader(); let received = ''; const timeout = setTimeout(() => abort.abort(), 10000);
    try { while (!received.includes(FAKE_STATUS)) { const chunk = await reader.read(); if (chunk.done) break; received += new TextDecoder().decode(chunk.value); } }
    finally { clearTimeout(timeout); }
    assert.ok(received.includes(FAKE_STATUS)); assert.match(received, /"running":true/);
    const agent = required((await call('/agents?board=' + board.id, undefined, z.array(AgentSchema)))[0]); assert.deepEqual(agent.statusModel, model); assert.equal(agent.status, FAKE_STATUS);
    // PM6 finding 1: real SSE updates and GET snapshots use the same revision sequence.
    const updates = received.split('\n').filter(line => line.startsWith('data: ')).map(line => { const value: unknown = JSON.parse(line.slice(6)); return HostEventSchema.parse(value); }).filter(event => event.type === 'agent').filter(event => event.id === id);
    assert.ok(updates.length > 1);
    for (let i = 0; i < updates.length; i++) {
      assert.ok(Number.isSafeInteger(required(required(updates[i]).revision)));
      if (i) assert.ok(required(required(updates[i]).revision) > required(required(updates[i - 1]).revision));
    }
    assert.equal(agent.revision, required(updates.at(-1)).revision, 'an unchanged GET reuses the latest event revision');
    await call(`/agents/${id}/stop`, {}, z.object({ ok: z.literal(true) }));
    let stopped: z.output<typeof AgentSchema> | undefined; for (let i = 0; i < 50; i++) { [stopped] = await call('/agents?board=' + board.id, undefined, z.array(AgentSchema)); if (!required(stopped).running) break; await new Promise(r => setTimeout(r, 50)); }
    assert.equal(required(stopped).running, false); assert.equal(required(stopped).status, 'Stopped');
    assert.ok(required(stopped).revision > agent.revision);
  } finally { abort.abort(); child.kill(); }
});
