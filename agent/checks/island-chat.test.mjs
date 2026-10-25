// Item 9 uses the real durable host and board tools, with a prompt-sensitive local model.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conversationFromView } from '../status.mjs';

let child, base;
const token = 'island-chat-' + process.pid;
const answer = 'I grouped your existing cards by topic and kept every card. '.repeat(18);
const fixture = `
import assert from 'node:assert/strict';
import { fake } from './server.mjs';
import { fauxAssistantMessage as say, fauxToolCall as tool } from '@earendil-works/pi-ai/providers/faux';
const respond = async ctx => {
  fake.appendResponses([step]);
  const systemPrompt = ctx.messages.filter(m => m.role === 'system').flatMap(m => [typeof m.content === 'string' ? m.content : m.content.map(c => c.text).join(''), ...Object.values(m.sections ?? {})]).join('\\n');
  assert.match(systemPrompt, /Chat lives in the island conversation/);
  assert.match(systemPrompt, /Create zero new reply or note cards/);
  assert.doesNotMatch(systemPrompt, /plus a reply on top|every answer goes into objects/);
  const create = ctx.messages.filter(m => m.role === 'system').flatMap(m => m.toolsAdded ?? []).find(t => t.name === 'create');
  assert.match(create.description, /reply object is only for an explicit request/);
  assert.doesNotMatch(create.description, /Always first|Place the reply first|reply on top/);
  const messages = ctx.messages;
  const latest = messages.findLastIndex(m => m.role === 'user');
  const content = messages[latest].content;
  const request = typeof content === 'string' ? content : content.filter(c => c.type === 'text').map(c => c.text).join('');
  const results = messages.slice(latest).filter(m => m.role === 'toolResult');
  if (!results.length) return say(tool('board_read', {}), { stopReason: 'toolUse' });
  if (/clean up/i.test(request) && results.length === 1) {
    const board = JSON.parse(results[0].content.filter(c => c.type === 'text').map(c => c.text).join(''));
    return say(tool('board_apply', { commands: board.cards.map((c, i) => ({ op: 'move', id: c.id, x: i * 300, y: 120 })) }), { stopReason: 'toolUse' });
  }
  if (/create a plan/i.test(request) && !/save your answer/i.test(request) && results.length === 1) return say(tool('create', { kind: 'plan', title: 'Study plan', data: { steps: [{ title: 'Read', kind: 'task' }, { title: 'Draft', kind: 'task' }] } }), { stopReason: 'toolUse' });
  if (/create a plan/i.test(request) && results.length === 1) return say(tool('create', { kind: 'reply', title: '', data: { headline: 'Saved plan', text: 'Read, draft, review.' } }), { stopReason: 'toolUse' });
  return say(/what is on/i.test(request) ? 'There are two notes on this board.' : ${JSON.stringify(answer)});
};
const step = async ctx => { try { return await respond(ctx); } catch (e) { console.error(e); throw e; } };
fake.setResponses([step]);
`;
before(async () => {
  child = spawn(process.execPath, ['--no-warnings', '--input-type=module', '-e', fixture], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, AEGIS_DATA: await mkdtemp(join(tmpdir(), 'aegis-island-chat-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' },
  });
  child.stderr.on('data', d => process.stderr.write(d));
  const port = await new Promise((ok, no) => { child.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) ok(m[1]); }); child.on('exit', c => no(Error('host exited ' + c))); });
  base = `http://127.0.0.1:${port}`;
});
after(() => child?.kill());
async function call(path, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  assert.equal(r.status, 200); return r.json();
}
async function done(board, id, count) {
  for (let i = 0; i < 150; i++) {
    const agent = (await call(`/agents?board=${board}`)).find(a => a.id === id);
    if (agent?.error) assert.fail(JSON.stringify(agent));
    if (agent && !agent.running && agent.turns.filter(t => t.role === 'assistant').length === count) { assert.equal(agent.error, null); return agent; }
    await new Promise(r => setTimeout(r, 50));
  }
  assert.fail('conversation did not finish');
}
const model = { provider: 'fake', modelId: 'fake' };

test('clean-up and board questions add zero reply or note cards; full final text and all turns survive follow-up', async () => {
  const board = await call('/boards', { name: 'Conversation only' });
  await call(`/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'note', text: 'First topic', x: 1200, y: 700 }, { op: 'create', type: 'note', text: 'Second topic', x: 500, y: 800 }] });
  const before = await call(`/boards/${board.id}`);
  const [{ id }] = await call('/agents', { boardId: board.id, brief: 'Clean up this board', model });
  const agent = await done(board.id, id, 1);
  const after = await call(`/boards/${board.id}`);
  assert.equal(after.cards.length, 2);
  assert.deepEqual(after.cards.map(c => c.id), before.cards.map(c => c.id));
  assert.ok(after.cards.every(c => c.type === 'note' && c.kind !== 'reply'));
  assert.deepEqual(after.cards.map(c => [c.x, c.y]), [[0, 120], [300, 120]]);
  assert.equal(agent.text, answer); assert.ok(agent.text.length > 600);
  assert.deepEqual(agent.turns.map(t => t.role), ['user', 'assistant']);
  assert.equal(agent.turns[0].text, 'Clean up this board');
  await call(`/agents/${id}/message`, { content: 'What is on this board?' });
  const follow = await done(board.id, id, 2);
  assert.equal(follow.text, 'There are two notes on this board.');
  assert.deepEqual(follow.turns.map(t => t.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal((await call(`/boards/${board.id}`)).cards.length, 2);
});

test('a content request creates its requested object without a reply preamble', async () => {
  const board = await call('/boards', { name: 'Requested plan' });
  const [{ id }] = await call('/agents', { boardId: board.id, brief: 'Create a plan for my study', model });
  await done(board.id, id, 1);
  const saved = await call(`/boards/${board.id}`);
  assert.equal(saved.cards.length, 1); assert.equal(saved.cards[0].kind, 'plan');
});

test('an explicit request to save content as a card can still create it', async () => {
  const board = await call('/boards', { name: 'Requested content' });
  const [{ id }] = await call('/agents', { boardId: board.id, brief: 'Create a plan and save your answer as a card', model });
  await done(board.id, id, 1);
  const saved = await call(`/boards/${board.id}`);
  assert.equal(saved.cards.length, 1); assert.equal(saved.cards[0].kind, 'reply');
  assert.equal(saved.cards[0].data.headline, 'Saved plan');
});

test('tool commentary and tool results stay out of conversation; streaming text is separate from the final answer', () => {
  const result = conversationFromView({ entries: [
    { id: 'u', kind: 'pi.user', model: [{ content: 'Tidy this board' }] },
    { id: 't', kind: 'pi.assistant', model: [{ content: [{ type: 'text', text: 'Reading' }, { type: 'toolCall', name: 'board_read' }] }] },
    { kind: 'pi.tool-result', model: [{ content: [{ type: 'text', text: 'private tool result' }] }] },
    { id: 'a', kind: 'pi.assistant', model: [{ content: [{ type: 'text', text: 'All tidy.' }] }] },
  ], docs: { 'pi.live': { generation: { message: { content: [{ type: 'text', text: 'Writing a follow-up' }] } } } } });
  assert.deepEqual(result, { turns: [{ id: 'u', role: 'user', text: 'Tidy this board' }, { id: 'a', role: 'assistant', text: 'All tidy.' }], text: 'All tidy.', partial: 'Writing a follow-up' });
});
