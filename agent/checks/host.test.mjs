// Starts the real host with a scripted local model and drives it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOKEN = 'check-token-' + process.pid;
let child, base;
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${TOKEN}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 100)); } };

let data;
before(async () => {
  data = await mkdtemp(join(tmpdir(), 'aegis-host-'));
  // An older build wrote a non-UUID device id; ChatGPT sign-in refuses one.
  await writeFile(join(data, 'device-id'), 'not-a-uuid');
  child = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: TOKEN, AEGIS_FAKE_MODEL: '1' } });
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); });
    child.on('exit', code => reject(new Error('host exited ' + code)));
  });
  base = `http://127.0.0.1:${port}`;
});
after(() => child?.kill());

test('requests without the token are refused', async () => {
  const r = await fetch(base + '/boards');
  assert.equal(r.status, 401);
});

test('two agents edit one board at once and neither loses work', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Parallel' });
  await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'note', text: 'seed' }] });
  const brief = n => 'FAKE ' + JSON.stringify([{ op: 'create', type: 'title', text: 'From agent ' + n, ref: 't' }, { op: 'focus', ids: ['$t'] }]);
  const a = await call('POST', '/agents', { boardId: board.id, brief: brief(1), model: { provider: 'fake', modelId: 'fake' } });
  const b = await call('POST', '/agents', { boardId: board.id, brief: brief(2), model: { provider: 'fake', modelId: 'fake' } });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const final = await until(async () => {
    const { body } = await call('GET', `/boards/${board.id}`);
    return body.cards.length === 3 ? body : null;
  });
  assert.deepEqual(final.cards.map(c => c.text).sort(), ['From agent 1', 'From agent 2', 'seed']);
  const agents = await until(async () => { const { body } = await call('GET', `/agents?board=${board.id}`); return body.every(x => !x.running && x.text) ? body : null; });
  assert.equal(agents.length, 2);
  assert.ok(agents.every(x => x.text === 'Done: sorted the board.'));
});

test('a bad batch from an agent changes nothing', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Bad' });
  await call('POST', '/agents', { boardId: board.id, brief: 'FAKE ' + JSON.stringify([{ op: 'create', type: 'note', text: 'x' }, { op: 'move', id: 'nope', x: 0, y: 0 }]), model: { provider: 'fake', modelId: 'fake' } });
  await until(async () => (await call('GET', `/agents?board=${board.id}`)).body.some(x => !x.running && x.text));
  assert.equal((await call('GET', `/boards/${board.id}`)).body.cards.length, 0);
});

test('sign-in state lists both providers', async () => {
  const { body } = await call('GET', '/auth');
  assert.deepEqual(Object.keys(body).sort(), ['anthropic', 'openai']);
});

test('ChatGPT sign-in starts with a login link and a paste box, and the device id is a UUID', async () => {
  await call('POST', '/auth/start', { provider: 'openai' });
  const s = await until(async () => { const { body } = await call('GET', '/auth'); return body.openai.link ? body.openai : null; });
  assert.equal(s.state, 'pending', s.error ?? '');
  assert.match(s.link, /^https:\/\/auth\.openai\.com\//);
  assert.equal(s.prompt.type, 'manual_code');
  assert.match(await readFile(join(data, 'device-id'), 'utf8'), /^[0-9a-f-]{36}$/);
  await call('POST', '/auth/cancel', { provider: 'openai' });
  const after = await until(async () => { const { body } = await call('GET', '/auth'); return body.openai.state !== 'pending' ? body.openai : null; });
  assert.equal(after.state, 'idle'); assert.equal(after.error, null);
});

test('starting a sign-in again replaces the unfinished one', async () => {
  await call('POST', '/auth/start', { provider: 'anthropic' });
  const first = await until(async () => (await call('GET', '/auth')).body.anthropic.link);
  await call('POST', '/auth/start', { provider: 'anthropic' });
  const second = await until(async () => { const l = (await call('GET', '/auth')).body.anthropic.link; return l && l !== first ? l : null; });
  assert.notEqual(first, second);
  assert.equal((await call('GET', '/auth')).body.anthropic.state, 'pending');
  await call('POST', '/auth/cancel', { provider: 'anthropic' });
});
