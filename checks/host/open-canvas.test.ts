import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFile, chmod, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { BoardSchema } from '@aegis/domain/schema';
import { ProfileSchema, profileEmpty, WELCOME_BRIEF } from '@aegis/domain/profile';
import { hostFixture } from './fixture.ts';

const AuthSchema = z.object({ openai: z.object({ connected: z.boolean() }), claude: z.object({ connected: z.boolean(), state: z.enum(['missing', 'signed-out', 'ready']), version: z.string().nullable() }) }).strict();
const AgentsSchema = z.array(z.object({ id: z.string(), running: z.boolean(), text: z.string(), partial: z.string(), error: z.string().nullable() }));
const ReceiptsSchema = z.array(z.object({ id: z.string() })).min(1);
async function fixture(state = 'ready') {
  return hostFixture({ prepare: async data => {
    const path = join(data, 'claude'); await copyFile(new URL('../fixtures/claude.mjs', import.meta.url), path); await chmod(path, 0o700); await writeFile(path + '.state', state);
  }, extra: data => ({ AEGIS_CLAUDE_BIN: join(data, 'claude'), AEGIS_TEST_SECRET: 'never-forward-this' }) });
}
async function finished(host: Awaited<ReturnType<typeof hostFixture>>, id: string) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const agent = AgentsSchema.parse(await host.json('/agents')).find(agent => agent.id === id);
    if (agent && !agent.running && (agent.text || agent.error)) return agent;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('Agent did not finish');
}

test('Claude discovery uses only the disposable binary, caches and refreshes all account states', async () => {
  const host = await fixture('signed-out');
  try {
    assert.equal(AuthSchema.parse(await host.json('/auth')).claude.state, 'signed-out');
    await writeFile(join(host.data, 'claude.state'), 'ready');
    assert.equal(AuthSchema.parse(await host.json('/auth')).claude.state, 'signed-out');
    await host.json('/auth/claude/refresh', {});
    const ready = AuthSchema.parse(await host.json('/auth')).claude;
    assert.equal(ready.state, 'ready'); assert.match(ready.version ?? '', /2.1.0/);
    for (const state of ['text', 'fail']) {
      await writeFile(join(host.data, 'claude.state'), state); await host.json('/auth/claude/refresh', {});
      assert.equal(AuthSchema.parse(await host.json('/auth')).claude.state, state === 'text' ? 'ready' : 'signed-out');
    }
    const calls = (await readFile(join(host.data, 'claude.calls'), 'utf8')).trim().split('\n').map(line => z.object({ env: z.array(z.string()) }).parse(JSON.parse(line)));
    assert.ok(calls.every(call => !call.env.some(key => /AEGIS_|API_KEY|TOKEN/.test(key))));
  } finally { await host.close(); }
  const missing = await hostFixture();
  try { assert.equal(AuthSchema.parse(await missing.json('/auth')).claude.state, 'missing'); }
  finally { await missing.close(); }
});

test('profile replace, reset, validation, permissions and token authentication', async () => {
  const host = await hostFixture();
  try {
    assert.ok(profileEmpty(ProfileSchema.parse(await host.json('/profile'))));
    const saved = ProfileSchema.parse(await host.json('/profile', { name: 'Avi', role: 'Designer', goals: 'Focus', workflow: 'Study', canvasHelp: 'Space to think', notes: 'Local only' }));
    assert.equal(saved.name, 'Avi'); assert.ok(saved.updatedAt > 0);
    assert.deepEqual(ProfileSchema.parse(await host.json('/profile')), saved);
    assert.equal((await stat(join(host.data, 'profile.json'))).mode & 0o777, 0o600);
    const replaced = ProfileSchema.parse(await host.json('/profile', { name: 'New name' })); assert.equal(replaced.goals, undefined);
    assert.equal((await host.response('/profile', { key: 'not-a-key' })).status, 400);
    assert.equal((await host.response('/profile', { name: 12 })).status, 400);
    for (const path of ['/profile', '/profile/reset']) assert.equal((await fetch(host.base + path, { method: 'POST', body: '{}' })).status, 401);
    assert.ok(profileEmpty(ProfileSchema.parse(await host.json('/profile/reset', {}))));
  } finally { await host.close(); }
});

test('fake welcome and profile_update persist answers and inject the profile into later runs', async () => {
  const host = await hostFixture({ extra: data => ({ AEGIS_FAKE_CAPTURE_INPUT: join(data, 'inputs.jsonl') }) });
  try {
    const board = BoardSchema.parse(await host.json('/boards', { name: 'Welcome' }));
    const start = ReceiptsSchema.parse(await host.json('/agents', { boardId: board.id, brief: WELCOME_BRIEF, model: { provider: 'fake', modelId: 'fake' } }))[0]; assert.ok(start);
    assert.match((await finished(host, start.id)).text, /Who are you/);
    await host.json(`/agents/${start.id}/message`, { content: 'I am Avi. I design and study. Help me focus.' });
    await finished(host, start.id);
    const until = Date.now() + 5000;
    while (profileEmpty(ProfileSchema.parse(await host.json('/profile'))) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 30));
    assert.match(ProfileSchema.parse(await host.json('/profile')).notes ?? '', /Avi/);
    const receipt = ReceiptsSchema.parse(await host.json('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS [["profile_update",{"name":"Avi","goals":"Keep focus"}]]' }))[0]; assert.ok(receipt);
    await finished(host, receipt.id);
    assert.equal(ProfileSchema.parse(await host.json('/profile')).goals, 'Keep focus');
    const follow = ReceiptsSchema.parse(await host.json('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKEREPLY Profile loaded.' }))[0]; assert.ok(follow); await finished(host, follow.id);
    assert.match(await readFile(join(host.data, 'inputs.jsonl'), 'utf8'), /Keep focus/);
  } finally { await host.close(); }
});

test('Claude streams in-app conversations, uses MCP profile tools, rewrites documents and cancels', async () => {
  const host = await fixture();
  try {
    await host.json('/auth/claude/refresh', {});
    const models = z.array(z.object({ provider: z.string(), modelId: z.string() })).parse(await host.json('/models'));
    assert.deepEqual(models.filter(model => model.provider === 'claude').map(model => model.modelId), ['haiku', 'sonnet', 'opus']);
    const board = BoardSchema.parse(await host.json('/boards', { name: 'Claude welcome' }));
    const receipt = ReceiptsSchema.parse(await host.json('/agents', { boardId: board.id, brief: WELCOME_BRIEF, model: { provider: 'claude', modelId: 'sonnet' } }))[0]; assert.ok(receipt);
    const agent = await finished(host, receipt.id); assert.equal(agent.error, null); assert.match(agent.text, /workflow/);
    await host.json(`/agents/${agent.id}/message`, { content: 'PROFILE_THROUGH_MCP' });
    const until = Date.now() + 5000;
    while (ProfileSchema.parse(await host.json('/profile')).name !== 'Avi' && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(ProfileSchema.parse(await host.json('/profile')).name, 'Avi');
    assert.equal(z.object({ text: z.string() }).parse(await host.json('/rewrite', { text: 'Some words', model: { provider: 'claude', modelId: 'haiku' } })).text, 'A clearer passage.');
    const response = await host.response('/rewrite', { text: 'More words', model: { provider: 'claude', modelId: 'sonnet' }, stream: true });
    const output = await response.text(); assert.match(output, /"delta"/); assert.match(output, /A clearer passage/);
    const calls = (await readFile(join(host.data, 'claude.calls'), 'utf8')).trim().split('\n').map(line => z.object({ args: z.array(z.string()), cwd: z.string() }).parse(JSON.parse(line)));
    const inference = calls.find(call => call.args.includes('-p')); assert.ok(inference);
    assert.equal(inference.cwd, join(host.data, 'claude-code')); assert.ok(inference.args.includes('--strict-mcp-config')); assert.ok(inference.args.includes('mcp__aegis__profile_update')); assert.ok(inference.args.includes('--append-system-prompt'));
    const waiting = ReceiptsSchema.parse(await host.json('/agents', { boardId: board.id, brief: 'WAIT_FOR_CANCEL', model: { provider: 'claude', modelId: 'sonnet' } }))[0]; assert.ok(waiting);
    await host.json(`/agents/${waiting.id}/stop`, {});
    const stopped = AgentsSchema.parse(await host.json('/agents')).find(agent => agent.id === waiting.id); assert.equal(stopped?.running, false);
  } finally { await host.close(); }
});

test('legacy Claude and API key records are removed without becoming provider credentials', async () => {
  const host = await hostFixture({ prepare: data => writeFile(join(data, 'auth.json'), JSON.stringify({ anthropic: { type: 'oauth', access: 'old-token', refresh: 'old-refresh', expires: 1 }, openai: { type: 'api_key', key: 'old-key' } })) });
  try { assert.deepEqual(JSON.parse(await readFile(join(host.data, 'auth.json'), 'utf8')), {}); assert.equal(AuthSchema.parse(await host.json('/auth')).openai.connected, false); }
  finally { await host.close(); }
});
