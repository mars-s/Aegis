import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBatch, emptyBoard, objectContentSize } from '../../app/src/lib/board/commands.js';
import { demoBatch } from '../../checks/demo-batch.mjs';

test('item 11: demo windows fit content, share the grid and never overlap', () => {
  const result = applyBatch(emptyBoard('demo'), { commands: demoBatch });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const [reply, plot, diagram, sheet, plan] = result.board.cards;
  assert.equal(plot.y, diagram.y); assert.equal(sheet.y, plan.y);
  assert.equal(reply.x, plot.x); assert.equal(plot.x, sheet.x);
  assert.equal(plot.x + plot.w + 24, diagram.x); assert.equal(sheet.x + sheet.w + 24, plan.x);
  assert.equal(plot.y, reply.y + reply.h + 24);
  assert.equal(sheet.y, Math.max(plot.y + plot.h, diagram.y + diagram.h) + 24);
  assert.ok(diagram.h < 180, 'a three-node horizontal diagram must hug its content');
  assert.ok(plot.h >= 36 + 32 + 220 + 28, 'strip, padding, plot, labels and source fit');
  assert.ok(sheet.h >= 36 + 5 * 29 + 28, 'all sheet rows and source fit');
  for (const a of result.board.cards) {
    const content = objectContentSize(a);
    assert.ok(a.w >= content.w && a.h >= content.h, `content fits ${a.kind}`);
    for (const b of result.board.cards) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.kind} overlaps ${b.kind}`);
  }
});

test('item 11: long replies grow and impossible spans fail atomically', () => {
  const commands = structuredClone(demoBatch); commands[0].data.text = 'A long but useful sentence about the result. '.repeat(10);
  commands[0].data.figures = [{ label: 'Focus', value: '15 h', note: 'Illustrative' }, { label: 'Meetings', value: '8 h' }];
  const result = applyBatch(emptyBoard('long'), { commands }); assert.ok(result.ok);
  assert.ok(result.board.cards[0].h > 250);
  const bad = structuredClone(demoBatch); bad.at(-2).spans = [12, 1, 11, 7, 5];
  const board = emptyBoard('bad'), failed = applyBatch(board, { commands: bad });
  assert.equal(failed.ok, false); assert.equal(failed.board, board); assert.match(failed.errors[0].reason, /more columns/);
});

let host, data, base, records = [];
const token = 'speed-test-' + process.pid;
const call = async (path, body) => {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  const value = await r.json(); assert.equal(r.status, 200, JSON.stringify(value)); return value;
};
before(async () => {
  data = await mkdtemp(join(tmpdir(), 'aegis-speed-test-'));
  host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, AEGIS_DATA: data, AEGIS_TOKEN: token, AEGIS_PORT: '0', AEGIS_FAKE_MODEL: '1', AEGIS_PROFILE_TOOLS: '1' } });
  let pending = '';
  base = await new Promise((resolve, reject) => {
    host.stdout.on('data', bytes => {
      pending += bytes;
      let i;
      while ((i = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, i); pending = pending.slice(i + 1);
        try { const r = JSON.parse(line); if (r.aegis === 'ready') resolve(`http://127.0.0.1:${r.port}`); else if (r.aegis === 'timing') records.push(r); } catch {}
      }
    }); host.once('exit', reject);
  });
});
after(async () => { host?.kill(); await rm(data, { recursive: true, force: true }); });

test('item 10: first-turn summary, compact reads and opt-in full card details', async () => {
  const board = await call('/boards', { name: 'Read sizes' });
  const body = 'Detailed project notes. '.repeat(1000);
  await call(`/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'doc', text: 'Long document', props: { body }, newId: 'details1' }] });
  records = [];
  const [agent] = await call('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS ' + JSON.stringify([['board_read', {}], ['board_read', { ids: ['details1'], detail: true }]]) });
  const started = Date.now();
  for (;;) {
    const a = (await call(`/agents?board=${board.id}`)).find(a => a.id === agent.id);
    if (!a.running && a.text) break;
    assert.ok(Date.now() - started < 10000); await new Promise(r => setTimeout(r, 20));
  }
  assert.equal(records.find(r => r.kind === 'model').hasBoardSummary, true);
  const reads = records.filter(r => r.kind === 'tool' && r.name === 'board_read');
  assert.equal(reads.length, 2); assert.ok(reads[0].outputBytes < 1000); assert.ok(reads[1].outputBytes > body.length);
  assert.ok(records.find(r => r.kind === 'model').inputBytes < body.length);
});

test('item 10: default models favour a fast model and keep the strong model available', async () => {
  const models = await call('/models');
  assert.equal(models.filter(m => m.provider === 'openai')[0].modelId, 'gpt-6-luna');
  assert.ok(models.some(m => m.modelId === 'gpt-6.1-sol'));
});

test('item 10: parallel tool calls publish each committed diff before the run finishes', async () => {
  const board = await call('/boards', { name: 'Parallel diffs' });
  await call(`/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'note', newId: 'parallel1', text: 'One' }, { op: 'create', type: 'note', newId: 'parallel2', text: 'Two' }] });
  const abort = new AbortController();
  const response = await fetch(base + '/events?token=' + token, { signal: abort.signal });
  const reader = response.body.getReader(), decoder = new TextDecoder(), events = [];
  let pending = '';
  const collecting = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        let i;
        while ((i = pending.indexOf('\n\n')) >= 0) {
          const line = pending.slice(0, i); pending = pending.slice(i + 2);
          if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
        }
      }
    } catch (error) { if (!abort.signal.aborted) throw error; }
  })();
  try {
    const [agent] = await call('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS ' + JSON.stringify([[
      ['board_apply', { commands: [{ op: 'move', id: 'parallel1', x: 80, y: 40 }] }],
      ['board_apply', { commands: [{ op: 'move', id: 'parallel2', x: 400, y: 40 }] }],
    ]]) });
    const deadline = Date.now() + 10000;
    while (!events.some(e => e.type === 'agent' && e.id === agent.id && !e.running && e.text)) { assert.ok(Date.now() < deadline); await new Promise(r => setTimeout(r, 20)); }
    const changes = events.filter(e => e.type === 'board' && e.boardId === board.id);
    assert.deepEqual(changes.map(e => [e.baseRev, e.rev]), [[1, 2], [2, 3]]);
    assert.ok(changes.every(e => e.patch.cards.length === 1 && !e.patch.order && !e.patch.links));
    const readyAt = events.findIndex(e => e.type === 'agent' && e.id === agent.id && !e.running && e.text);
    assert.ok(changes.every(e => events.indexOf(e) < readyAt));
    const final = await call(`/boards/${board.id}`);
    assert.deepEqual(final.cards.map(c => [c.x, c.y]), [[80, 40], [400, 40]]);
  } finally { abort.abort(); await collecting; }
});
