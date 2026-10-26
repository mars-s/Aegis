import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draftsFromView, fallbackStatus } from '../status.mjs';
import { demoBatch } from '../../checks/demo-batch.mjs';

const view = (blocks, run = true) => ({ docs: { 'pi.live': { run, generation: { message: { content: blocks } } } } });

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
  assert.equal(drafts[0].w, 600);
  assert.deepEqual(draftsFromView({}), []);
  assert.deepEqual(draftsFromView(view([{ type: 'toolCall', name: 'board_apply', arguments: { commands: 'not a list' } }])), []);
});

test('the status names what is being written while a batch streams', () => {
  assert.equal(fallbackStatus({ drafts: [{ title: 'Sleep report' }] }), 'Writing Sleep report');
  assert.equal(fallbackStatus({ drafts: [{ title: 'A' }, { title: 'Plan the week' }] }), 'Writing 2 windows, now Plan the week');
  assert.equal(fallbackStatus({ tools: [{ name: 'board_apply' }], drafts: [{ title: 'A' }] }), 'Updating the content on the board');
});

test('a streamed batch broadcasts growing drafts before it commits, then clears them', async () => {
  const token = 'drafts-' + process.pid, data = await mkdtemp(join(tmpdir(), 'aegis-drafts-'));
  const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_TPS: '600' }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const port = await new Promise(r => host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) r(m[1]); }));
    const base = `http://127.0.0.1:${port}`, headers = { authorization: `Bearer ${token}` };
    const board = await (await fetch(base + '/boards', { method: 'POST', headers, body: JSON.stringify({ name: 'Drafts' }) })).json();
    const events = (await fetch(`${base}/events?token=${token}`)).body.getReader();
    await fetch(base + '/agents', { method: 'POST', headers, body: JSON.stringify({ boardId: board.id, brief: 'FAKE ' + JSON.stringify(demoBatch), model: { provider: 'fake', modelId: 'fake' } }) });
    const counts = [], decoder = new TextDecoder(); let buffer = '', committedWith = null, finished = false;
    const deadline = Date.now() + 20000;
    while (!finished && Date.now() < deadline) {
      const { value, done } = await events.read(); if (done) break;
      buffer += decoder.decode(value);
      for (let i; (i = buffer.indexOf('\n\n')) >= 0;) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (!line.startsWith('data: ')) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === 'agent' && ev.running) counts.push(ev.drafts.length);
        if (ev.type === 'board' && committedWith === null) committedWith = counts.at(-1);
        if (ev.type === 'agent' && !ev.running && committedWith !== null) { assert.deepEqual(ev.drafts, []); finished = true; }
      }
    }
    await events.cancel();
    assert.ok(finished, 'the run finished');
    const growing = counts.filter(n => n > 0);
    assert.ok(new Set(growing).size >= 3, `drafts grew while streaming: ${counts.join(',')}`);
    assert.ok(growing.at(-1) === 9, 'every create in the batch was previewed');
  } finally { host.kill(); }
});
