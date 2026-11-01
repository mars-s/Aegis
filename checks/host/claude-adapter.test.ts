import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, copyFile, chmod, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod/v4';
import { createProviders } from '../../agent/dist/providers.js';
import { createClaudeCode } from '../../agent/dist/claude-code.js';
import { createLifetime } from '../../agent/dist/lifetime.js';
import { createProfile } from '../../agent/dist/profile.js';

// This test needs subprocesses but no listening sockets or live accounts.
test('CLI adapter streams, cancels and refreshes without credentials or a host listener', async () => {
  const data = await mkdtemp(join(tmpdir(), 'aegis-cli-adapter-')), path = join(data, 'claude');
  const override = process.env.AEGIS_CLAUDE_BIN, secret = process.env.AEGIS_TEST_SECRET;
  process.env.AEGIS_CLAUDE_BIN = path; process.env.AEGIS_TEST_SECRET = 'keep-private';
  const lifetime = createLifetime();
  try {
    const claude = createClaudeCode({ data, lifetime, configuration: () => ({ mcpServers: {} }) });
    assert.equal((await claude.status()).state, 'missing');
    await copyFile(new URL('../fixtures/claude.mjs', import.meta.url), path); await chmod(path, 0o700);
    await writeFile(path + '.state', 'signed-out'); assert.equal((await claude.status(true)).state, 'signed-out');
    await writeFile(path + '.state', 'ready'); assert.equal((await claude.status(true)).state, 'ready');
    const { models } = await createProviders({ data, device: 'test', lifetime, broadcast: () => {}, timing: () => {}, mcpConfiguration: () => ({ mcpServers: {} }) }); models.setProvider(claude.provider);
    const model = models.getModel('claude', 'sonnet'); assert.ok(model);
    const stream = models.streamSimple(model, { systemPrompt: 'Use Australian English.', messages: [{ role: 'user', content: 'A small request.', timestamp: Date.now() }] });
    let text = '', deltas = 0;
    for await (const event of stream) if (event.type === 'text_delta') { text += event.delta; deltas++; }
    assert.equal(text, 'Claude Code checked the canvas.'); assert.ok(deltas > 1);
    assert.equal((await stream.result()).stopReason, 'stop');
    const controller = new AbortController();
    const cancelled = models.streamSimple(model, { messages: [{ role: 'user', content: 'WAIT_FOR_CANCEL', timestamp: Date.now() }] }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 150);
    assert.equal((await cancelled.result()).stopReason, 'aborted');
    const calls = (await readFile(path + '.calls', 'utf8')).trim().split('\n').map(line => z.object({ args: z.array(z.string()), env: z.array(z.string()), cwd: z.string() }).parse(JSON.parse(line)));
    assert.ok(calls.every(call => !call.env.some(key => /AEGIS_|TOKEN|API_KEY/.test(key))));
    assert.ok(calls.filter(call => call.args.includes('-p')).every(call => call.cwd === join(data, 'claude-code') && call.args.includes('--strict-mcp-config')));
    await writeFile(path + '.state', 'text'); assert.equal((await claude.status(true)).state, 'ready');
    await writeFile(path + '.state', 'fail'); assert.equal((await claude.status(true)).state, 'signed-out');
  } finally {
    await lifetime.close(); await rm(data, { recursive: true, force: true });
    if (override === undefined) delete process.env.AEGIS_CLAUDE_BIN; else process.env.AEGIS_CLAUDE_BIN = override;
    if (secret === undefined) delete process.env.AEGIS_TEST_SECRET; else process.env.AEGIS_TEST_SECRET = secret;
  }
});

test('profile merges are serial and replacement removes old fields', async () => {
  const data = await mkdtemp(join(tmpdir(), 'aegis-profile-store-'));
  try {
    const profile = createProfile(data);
    await Promise.all([profile.update({ name: 'Avi' }), profile.update({ goals: 'Focus' })]);
    assert.equal((await profile.read()).name, 'Avi'); assert.equal((await profile.read()).goals, 'Focus');
    await profile.replace({ role: 'Designer' }); assert.equal((await profile.read()).name, undefined);
    await profile.reset(); assert.equal((await profile.read()).role, undefined);
  } finally { await rm(data, { recursive: true, force: true }); }
});

// Pi Durable and the fake model can exercise the introduction without HTTP.
test('durable introduction saves the profile through the real profile_update tool', async () => {
  const { createBoards } = await import('../../agent/dist/boards.js');
  const { createRuns } = await import('../../agent/dist/runs.js');
  const { atomicJson } = await import('../../agent/dist/files.js');
  const { emptyBoard } = await import('@aegis/domain/commands');
  const { WELCOME_BRIEF } = await import('@aegis/domain/profile');
  const { fileURLToPath } = await import('node:url');
  const data = await mkdtemp(join(tmpdir(), 'aegis-welcome-direct-')), lifetime = createLifetime();
  const previous = process.env.AEGIS_FAKE_MODEL, capture = process.env.AEGIS_FAKE_CAPTURE_INPUT; process.env.AEGIS_FAKE_MODEL = '1'; process.env.AEGIS_FAKE_CAPTURE_INPUT = join(data, 'input.jsonl');
  try {
    const profile = createProfile(data);
    const providers = await createProviders({ data, device: 'check', lifetime, broadcast: () => {}, timing: () => {}, mcpConfiguration: () => ({ mcpServers: {} }) });
    const boards = createBoards({ directory: join(data, 'boards'), broadcast: () => {}, record: async () => {}, refreshAgents: () => {}, timing: () => {} });
    const board = emptyBoard('introduction'); await atomicJson(boards.boardPath(board.id), board);
    const runs = await createRuns({ data, assets: join(data, 'assets'), agentRoot: fileURLToPath(new URL('../../agent/', import.meta.url)), boards, providers, profile, broadcast: () => {}, timing: () => {}, lifetime });
    const { id } = await runs.spawnAgent({ boardId: board.id, brief: WELCOME_BRIEF, model: { provider: 'fake', modelId: 'fake' } });
    async function waitFor(check: () => Promise<boolean>) {
      const deadline = Date.now() + 8000;
      while (!await check()) { if (Date.now() > deadline) throw new Error('Introduction did not finish'); await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    await waitFor(async () => (await runs.agents(board.id)).some(agent => agent.id === id && !agent.running && /Who are you/.test(agent.text)));
    const input = z.object({ messages: z.array(z.object({ role: z.string(), toolsAdded: z.array(z.object({ name: z.string() })).optional() })) }).parse(JSON.parse((await readFile(join(data, 'input.jsonl'), 'utf8')).split('\n')[0] ?? '{}'));
    assert.ok(input.messages.some(message => message.role === 'system' && message.toolsAdded?.some(tool => tool.name === 'board_apply')));
    await runs.message(id, 'I am Avi. I design and study, and want a calmer canvas.');
    await waitFor(async () => (await profile.read()).notes?.includes('Avi') === true);
    assert.match((await profile.read()).notes ?? '', /calmer canvas/);
    await waitFor(async () => (await runs.agents(board.id)).every(agent => !agent.running && agent.history.every(entry => entry.finished !== null))); 
  } finally {
    await lifetime.close(); await rm(data, { recursive: true, force: true });
    if (previous === undefined) delete process.env.AEGIS_FAKE_MODEL; else process.env.AEGIS_FAKE_MODEL = previous;
    if (capture === undefined) delete process.env.AEGIS_FAKE_CAPTURE_INPUT; else process.env.AEGIS_FAKE_CAPTURE_INPUT = capture;
  }
});
