import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { historyFromView, requestUndoCommands } from '../status.mjs';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { Harness, createRegistry } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';

const request = { kind: 'aegis.request', data: { requestId: 'request', brief: 'Tidy the work', started: 100 } };
const change = (before, after) => ({ kind: 'aegis.change', data: { requestId: 'request', before: { cards: before, fields: {} }, after: { cards: after, removed: before.filter(c => !after.some(n => n.id === c.id)).map(c => c.id), fields: {} } } });
const card = (id, text, x = 0) => ({ id, text, type: 'note', x, y: 0, w: 200, h: 100 });
test('request history folds batches, names moves, edits, creates and deletes, and rejects later edits', () => {
  const a = card('aaaaaa', 'Draft'), b = card('bbbbbb', 'Old idea'), c = card('cccccc', 'New plan');
  const moved = { ...a, x: 300 }, edited = { ...moved, text: 'Final draft' };
  const entries = [request, change([a, b], [moved, c]), change([moved], [edited]), { kind: 'aegis.request.end', data: { requestId: 'request', finished: 2100 } }];
  const [entry] = historyFromView({ entries });
  assert.equal(entry.elapsedMs, 2000); assert.equal(entry.canUndo, true);
  assert.deepEqual(entry.changes.find(c => c.id === a.id), { id: a.id, title: 'Final draft', previousTitle: 'Draft', actions: ['Moved', 'Edited'] });
  assert.match(entry.summary, /Created 1 window, moved 1 window, edited 1 window, deleted 1 window/);
  const unrelated = card('dddddd', 'My later note');
  const commands = requestUndoCommands({ cards: [edited, c, unrelated], links: [] }, entries, 'request');
  assert.deepEqual(commands[0].cards.sort((a, b) => a.id.localeCompare(b.id)), [a, b, unrelated]);
  assert.throws(() => requestUndoCommands({ cards: [{ ...edited, text: 'Later work' }, c], links: [] }, entries, 'request'), /edited again/);
  const grown = { ...c, h: 300, props: { autoHeightMin: c.h } };
  const autoEntries = [request, change([], [{ ...c, props: {} }])];
  assert.equal(requestUndoCommands({ cards: [grown], links: [] }, autoEntries, 'request')[0].cards.length, 0, 'automatic note growth remains undoable');
  assert.throws(() => requestUndoCommands({ cards: [{ ...grown, props: { ...grown.props, fixedHeight: true } }], links: [] }, autoEntries, 'request'), /edited again/);
  assert.throws(() => requestUndoCommands({ cards: [{ ...c, props: {} }, unrelated], links: [{ id: 'link', a: c.id, b: unrelated.id }] }, autoEntries, 'request'), /new connection/);
});

test('real multi-batch history and per-request Undo survive a durable host restart', async () => {
  const data = await mkdtemp(join(tmpdir(), 'aegis-history-')), token = 'history-' + process.pid;
  let host, base;
  async function start() {
    host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    host.stderr.on('data', d => process.stderr.write(d));
    const port = await new Promise((resolve, reject) => { host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(m[1]); }); host.once('exit', code => reject(Error(`Host exited ${code}`))); });
    base = `http://127.0.0.1:${port}`;
  }
  async function call(path, body) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value;
  }
  async function done(boardId, count) {
    for (let i = 0; i < 120; i++) {
      const [a] = await call('/agents?board=' + boardId);
      if (a && !a.running && a.history.length === count && a.history.every(h => h.finished)) return a;
      await new Promise(r => setTimeout(r, 30));
    }
    assert.fail('Request history did not finish');
  }
  try {
    await start();
    const board = await call('/boards', { name: 'History fixture' });
    await call(`/boards/${board.id}/batch`, { commands: [
      { op: 'create', type: 'note', newId: 'draft01', text: 'Draft', x: 0, y: 0 },
      { op: 'create', type: 'note', newId: 'delete01', text: 'Old idea', x: 300, y: 0 },
    ] });
    const before = await call(`/boards/${board.id}`);
    const model = { provider: 'fake', modelId: 'fake' };
    const brief = 'FAKETOOLS ' + JSON.stringify([
      ['board_apply', { commands: [{ op: 'move', id: 'draft01', x: 500, y: 120 }, { op: 'create', type: 'note', newId: 'created1', text: 'New plan', x: 0, y: 500 }] }],
      ['board_apply', { commands: [{ op: 'update', id: 'draft01', set: { text: 'Final draft' } }, { op: 'delete', id: 'delete01' }] }],
    ]);
    const [{ id }] = await call('/agents', { boardId: board.id, model, brief });
    let agent = await done(board.id, 1);
    assert.equal(agent.history[0].canUndo, true); assert.equal(agent.history[0].changes.length, 3);
    const history = agent.history;
    host.kill(); await once(host, 'exit'); await start();
    agent = (await call('/agents?board=' + board.id))[0];
    assert.deepEqual(agent.history, history); assert.equal(agent.turns[0].text, brief);
    host.kill(); await once(host, 'exit');
    const storage = await openNodeSqliteStorage(join(data, 'agents.sqlite'));
    const durable = await Harness.open(storage, { models: createModels(), registry: createRegistry() }, context);
    // Reset and compaction both advance the active context head, retaining old transcript entries.
    const conversation = await durable.conversation(Number(id), context);
    await conversation.reset(undefined, context); await durable.close(context);
    await start(); agent = (await call('/agents?board=' + board.id))[0];
    assert.deepEqual(agent.history, history, 'history survives a trimmed active context');
    const rev = (await call(`/boards/${board.id}`)).rev;
    await call(`/agents/${id}/history/${history[0].id}/undo`, {});
    const restored = await call(`/boards/${board.id}`);
    assert.equal(restored.rev, rev + 1);
    assert.deepEqual(restored.cards, before.cards); assert.deepEqual(restored.links, before.links);
    await call(`/agents/${id}/message`, { content: 'Explain the board' });
    agent = await done(board.id, 2);
    assert.equal(agent.history[0].undone, true); assert.equal(agent.history[0].canUndo, false);
    assert.equal(agent.history[1].summary, 'No board changes'); assert.equal(agent.history[1].canUndo, false);
    host.kill(); await once(host, 'exit'); await start();
    agent = (await call('/agents?board=' + board.id))[0];
    assert.equal(agent.history[0].undone, true); assert.equal(agent.history.length, 2);
    const childBrief = 'FAKETOOLS ' + JSON.stringify([
      ['board_apply', { commands: [{ op: 'create', type: 'note', newId: 'helper01', text: 'Research findings', x: 800, y: 800 }] }],
      ['finish', { summary: 'Research complete', digest: 'One research note', found: true }],
    ]);
    const [{ id: lead }] = await call('/agents', { boardId: board.id, model, brief: 'FAKETOOLS ' + JSON.stringify([
      ['start_part', { title: 'Research', goal: 'Find an idea', brief: childBrief }],
    ]) });
    let leadHistory;
    for (let i = 0; i < 120; i++) {
      const agents = await call('/agents?board=' + board.id), root = agents.find(a => a.id === lead);
      if (!root.running && root.history[0]?.canUndo) { leadHistory = root.history[0]; break; }
      await new Promise(r => setTimeout(r, 30));
    }
    assert.ok(leadHistory, 'a delegated change belongs to the original request');
    assert.equal(leadHistory.changes[0].title, 'Research findings');
    await call(`/agents/${lead}/history/${leadHistory.id}/undo`, {});
    assert.deepEqual((await call(`/boards/${board.id}`)).cards, before.cards);
  } finally { if (host?.exitCode === null) { host.kill(); await once(host, 'exit'); } await rm(data, { recursive: true, force: true }); }
});
