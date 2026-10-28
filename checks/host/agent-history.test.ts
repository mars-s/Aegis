import { SHAPES } from '@aegis/domain/objects';
import { z } from 'zod/v4';
import { BoardSchema, JsonRecordSchema, JsonSchema } from '@aegis/domain/schema';
import type { Board } from '@aegis/domain/schema';
import { BatchResponseSchema } from '@aegis/protocol/http';
import { applyBatch } from './batch.ts';
import { hostFixture } from './fixture.ts';
import { required } from './required.ts';
const AgentSchema = z.object({ id: z.string(), running: z.boolean(), revision: z.number(), turns: z.array(z.object({ text: z.string() })), history: z.array(z.object({ id: z.string(), finished: z.number().nullable(), canUndo: z.boolean(), undone: z.boolean(), summary: z.string(), changes: z.array(z.object({ title: z.string() }).catchall(JsonSchema)) }).catchall(JsonSchema)) });
const StartedSchema = z.array(z.object({ id: z.string() }));
const OkSchema = z.object({ ok: z.literal(true) });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { historyFromView, requestUndoCommands } from '../../agent/dist/status.js';
import { emptyBoard } from '@aegis/domain/commands';
const moduleFixture: unknown = await import(new URL('../demo-batch.mjs', import.meta.url).href);
const { demoBatch } = z.object({ demoBatch: z.array(JsonRecordSchema) }).parse(moduleFixture);
import { BACKGROUND_CONTEXT as context } from '../../agent/node_modules/@earendil-works/chord/dist/context/index.js';
import { createModels } from '../../agent/node_modules/@earendil-works/pi-ai/dist/models.js';
import { Harness, createRegistry } from '../../agent/node_modules/@earendil-works/pi-durable/dist/index.js';
import { openNodeSqliteStorage } from '../../agent/node_modules/@earendil-works/pi-durable/dist/storage/sqlite/node.js';

const request = { kind: 'aegis.request', data: { requestId: 'request', brief: 'Tidy the work', started: 100 } };
const change = <T extends { id: string }, U extends { id: string }>(before: readonly T[], after: readonly U[]) => ({ kind: 'aegis.change', data: { requestId: 'request', before: { cards: before, fields: {} }, after: { cards: after, removed: before.filter(c => !after.some(n => n.id === c.id)).map(c => c.id), fields: {} } } });
const card = (id: string, text: string, x = 0) => ({ id, text, type: 'note', x, y: 0, w: 200, h: 100 });
test('measured content and grid repacking update request after-state without absorbing person edits', () => {
  const original = applyBatch(emptyBoard('measured'), { commands: demoBatch }).board;
  const measured = applyBatch(original, { commands: original.cards.filter(c => ['doc', 'object'].includes(c.type)).map(c => ({ op: 'measure', id: c.id, h: Math.max(96, c.h - 60) })) });
  assert.equal(measured.ok, true, JSON.stringify(measured.errors));
  const measurement = (before: Board, after: Board) => ({ ...change(before.cards, after.cards), kind: 'aegis.normalise' });
  const entries = [request, change([], original.cards), { kind: 'aegis.request.end', data: { requestId: 'request', finished: 200 } }, measurement(original, measured.board)];
  assert.equal(required(historyFromView({ entries }, measured.board)[0]).canUndo, true);
  assert.equal(required(requestUndoCommands(measured.board, entries, 'request')[0]).cards.length, 0);
  const doc = required(measured.board.cards[0]);
  for (const set of [{ props: { body: 'My later content' } }, { h: doc.h + 40 }, { x: doc.x + 40 }]) {
    const edited: Board = applyBatch(measured.board, { commands: [{ op: 'update', id: doc.id, set }] }).board;
    const next: Board = applyBatch(edited, { commands: [{ op: 'measure', id: doc.id, h: doc.h + 80 }] }).board;
    const laterEntries: unknown[] = [...entries, measurement(edited, next)];
    assert.equal(required(historyFromView({ entries: laterEntries }, next)[0]).canUndo, false, JSON.stringify(set));
    assert.throws(() => requestUndoCommands(next, laterEntries, 'request'), /edited again/);
  }
  assert.equal(required(historyFromView({ entries }, measured.board)[0]).canUndo, true, 'repeated reads do not mutate saved snapshots');
});

test('measure accepts only derived height, ignores stale reports and leaves fixed windows alone', () => {
  const board = applyBatch(emptyBoard('measure-guards'), { commands: demoBatch }).board;
  const doc = required(board.cards[0]);
  const stale = applyBatch(board, { commands: [{ op: 'measure', id: doc.id, h: 200, baseHeight: doc.h - 1 }] });
  assert.deepEqual(stale.board.cards, board.cards);
  const fixed = applyBatch(board, { commands: [{ op: 'update', id: doc.id, set: { props: { fixedHeight: true } } }] }).board;
  assert.deepEqual(applyBatch(fixed, { commands: [{ op: 'measure', id: doc.id, h: 200 }] }).board.cards, fixed.cards);
  assert.equal(applyBatch(board, { commands: [{ op: 'measure', id: doc.id, h: NaN }] }).ok, false);
  const measured = applyBatch(board, { commands: [{ op: 'measure', id: doc.id, h: 200, set: { props: { body: 'Cannot write content' } } }] }).board;
  for (const card of measured.cards) {
    const original = required(board.cards.find(c => c.id === card.id));
    assert.deepEqual(card.props, original.props); assert.deepEqual(card.data, original.data);
  }
  assert.equal(required(measured.cards[0]).h, 200);
});

test('initial widget defaults join request history but later widget interactions stay protected', () => {
  const original = applyBatch(emptyBoard('widget-defaults'), { commands: [demoBatch.find(c => c.kind === 'html')] }).board;
  const widget = required(original.cards[0]); assert.ok(widget.kind === 'html'); const source = { html: widget.data.html, css: widget.data.css, js: widget.data.js };
  const state = JSON.stringify({ version: 1, controls: [], text: [], custom: { count: 0 } });
  const command = { op: 'initialise_html', id: widget.id, source, state };
  const initial = applyBatch(original, { commands: [command] });
  assert.ok(initial.ok, JSON.stringify(initial.errors));
  assert.equal(SHAPES.html.parse(required(initial.board.cards[0]).data).state, state);
  const entries = [request, change([], original.cards), { ...change(original.cards, initial.board.cards), kind: 'aegis.normalise' }];
  assert.equal(required(requestUndoCommands(initial.board, entries, 'request')[0]).cards.length, 0);
  const later = applyBatch(initial.board, { commands: [{ op: 'object_set', id: widget.id, path: ['state'], value: state.replace('"count":0', '"count":1') }] }).board;
  const reinitialised = applyBatch(later, { commands: [command] }).board;
  assert.deepEqual(reinitialised.cards, later.cards, 'duplicate initialisation cannot replace a live value');
  assert.throws(() => requestUndoCommands(later, entries, 'request'), /edited again/);
  assert.deepEqual(applyBatch(original, { commands: [{ ...command, source: { ...source, js: 'old source' } }] }).board.cards, original.cards, 'stale source initialisation is ignored');
  assert.equal(applyBatch(original, { commands: [{ ...command, state: 'invalid' }] }).ok, false);
  assert.throws(() => requestUndoCommands(initial.board, [request, change([], original.cards)], 'request'), /edited again/, 'an ordinary first state edit is not assumed to be automatic');
});

test('request Undo restores only the fields changed by the agent', () => {
  const before = card('review01', 'Review plan'), after = { ...before, x: 400, w: 240 };
  const entries = [request, change([before], [after])];
  const later = { ...after, text: 'Keep my revised plan', props: { colour: 'blue' } };
  assert.deepEqual(required(requestUndoCommands({ cards: [later], links: [] }, entries, 'request')[0]).cards,
    [{ ...later, x: before.x, w: before.w }]);
  assert.throws(() => requestUndoCommands({ cards: [{ ...later, x: 500 }], links: [] }, entries, 'request'), /Position of Review plan changed since/);
  const finished = [...entries, { kind: 'aegis.request.end', data: { requestId: 'request', finished: 200 } }];
  assert.equal(required(historyFromView({ entries: finished }, { cards: [later], links: [] })[0]).canUndo, true);
  const blocked = required(historyFromView({ entries: finished }, { cards: [{ ...later, x: 500 }], links: [] })[0]);
  assert.equal(blocked.canUndo, false); assert.match(required(blocked.undoBlockedReason), /Position of Review plan changed since/);
  const styled = { ...before, props: { colour: 'plain', locked: false } }, coloured = { ...styled, props: { ...styled.props, colour: 'blue' } };
  assert.deepEqual(required(requestUndoCommands({ cards: [{ ...coloured, props: { ...coloured.props, locked: true } }], links: [] }, [request, change([styled], [coloured])], 'request')[0]).cards,
    [{ ...styled, props: { colour: 'plain', locked: true } }]);
  const nextMove = { ...later, y: 100 };
  const interleaved = [...entries, change([later], [nextMove])];
  assert.deepEqual(required(requestUndoCommands({ cards: [nextMove], links: [] }, interleaved, 'request')[0]).cards, [{ ...later, x: before.x, y: before.y, w: before.w }]);
  assert.deepEqual(required(required(historyFromView({ entries: interleaved })[0]).changes[0]).actions, ['Moved', 'Edited']);
  const addedColour = { ...before, props: { colour: 'blue' } }, thenLocked = { ...addedColour, props: { ...addedColour.props, locked: true } };
  const twoSettings = [request, change([before], [addedColour]), change([addedColour], [thenLocked])];
  assert.deepEqual(required(requestUndoCommands({ cards: [thenLocked], links: [] }, twoSettings, 'request')[0]).cards, [before]);
  assert.deepEqual(required(requestUndoCommands({ cards: [{ ...addedColour, props: { ...addedColour.props, locked: true } }], links: [] }, [request, change([before], [addedColour])], 'request')[0]).cards,
    [{ ...before, props: { locked: true } }]);
});
test('request history folds batches, names moves, edits, creates and deletes, and rejects later edits', () => {
  const a = card('aaaaaa', 'Draft'), b = card('bbbbbb', 'Old idea'), c = card('cccccc', 'New plan');
  const moved = { ...a, x: 300 }, edited = { ...moved, text: 'Final draft' };
  const entries = [request, change([a, b], [moved, c]), change([moved], [edited]), { kind: 'aegis.request.end', data: { requestId: 'request', finished: 2100 } }];
  const entry = required(historyFromView({ entries })[0]);
  assert.equal(entry.elapsedMs, 2000); assert.equal(entry.canUndo, true);
  assert.deepEqual(entry.changes.find(c => c.id === a.id), { id: a.id, title: 'Final draft', previousTitle: 'Draft', actions: ['Moved', 'Edited'] });
  assert.match(entry.summary, /Created 1 window, moved 1 window, edited 1 window, deleted 1 window/);
  const unrelated = card('dddddd', 'My later note');
  const commands = requestUndoCommands({ cards: [edited, c, unrelated], links: [] }, entries, 'request');
  assert.deepEqual(required(commands[0]).cards.sort((a, b) => a.id.localeCompare(b.id)), [a, b, unrelated]);
  assert.throws(() => requestUndoCommands({ cards: [{ ...edited, text: 'Later work' }, c], links: [] }, entries, 'request'), /Text of Final draft changed since/);
  const grown = { ...c, h: 300, props: { autoHeightMin: c.h } };
  const autoEntries = [request, change([], [{ ...c, props: {} }])];
  assert.equal(required(requestUndoCommands({ cards: [grown], links: [] }, autoEntries, 'request')[0]).cards.length, 0, 'automatic note growth remains undoable');
  assert.throws(() => requestUndoCommands({ cards: [{ ...grown, props: { ...grown.props, fixedHeight: true } }], links: [] }, autoEntries, 'request'), /edited again/);
  assert.throws(() => requestUndoCommands({ cards: [{ ...c, props: {} }, unrelated], links: [{ id: 'link', a: c.id, b: unrelated.id }] }, autoEntries, 'request'), /new connection/);
});

test('real multi-batch history and per-request Undo survive a durable host restart', async () => {
  const host = await hostFixture(), data = host.data;
  async function start() { await host.start(); }
  async function call<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>> {
    const response = await host.response(path, body); const value: unknown = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return schema.parse(value);
  }
  async function done(boardId: string, count: number) {
    for (let i = 0; i < 120; i++) {
      const [a] = await call('/agents?board=' + boardId, undefined, z.array(AgentSchema));
      if (a && !a.running && a.history.length === count && a.history.every(h => h.finished)) return a;
      await new Promise(r => setTimeout(r, 30));
    }
    assert.fail('Request history did not finish');
  }
  try {
    const board = await call('/boards', { name: 'History fixture' }, BoardSchema);
    await call(`/boards/${board.id}/batch`, { commands: [
      { op: 'create', type: 'note', newId: 'draft01', text: 'Draft', x: 0, y: 0 },
      { op: 'create', type: 'note', newId: 'delete01', text: 'Old idea', x: 300, y: 0 },
    ] }, BatchResponseSchema);
    const before = await call(`/boards/${board.id}`, undefined, BoardSchema);
    const model = { provider: 'fake', modelId: 'fake' };
    const brief = 'FAKETOOLS ' + JSON.stringify([
      ['board_apply', { commands: [{ op: 'move', id: 'draft01', x: 500, y: 120 }, { op: 'create', type: 'note', newId: 'created1', text: 'New plan', x: 0, y: 500 }] }],
      ['board_apply', { commands: [{ op: 'update', id: 'draft01', set: { text: 'Final draft' } }, { op: 'delete', id: 'delete01' }] }],
    ]);
    const { id } = required((await call('/agents', { boardId: board.id, model, brief }, StartedSchema))[0]);
    let agent = await done(board.id, 1);
    assert.equal(required(agent.history[0]).canUndo, true); assert.equal(required(agent.history[0]).changes.length, 3);
    const history = agent.history, revision = agent.revision;
    await host.stop(); await start();
    agent = required((await call('/agents?board=' + board.id, undefined, z.array(AgentSchema)))[0]);
    assert.ok(agent.revision > revision, 'revisions keep increasing after a host restart');
    assert.deepEqual(agent.history, history); assert.equal(required(agent.turns[0]).text, brief);
    await host.stop();
    const storage = await openNodeSqliteStorage(join(data, 'agents.sqlite'));
    const durable = await Harness.open(storage, { models: createModels(), registry: createRegistry() }, context);
    // Reset and compaction both advance the active context head, retaining old transcript entries.
    const record = await durable.commit(async tx => (await tx.scanConversations({}, 256)).items.find(record => String(record.id) === id), context); assert.ok(record);
    const conversation = await durable.conversation(record.id, context); assert.ok(conversation);
    await conversation.reset(undefined, context); await durable.close(context);
    await start(); agent = required((await call('/agents?board=' + board.id, undefined, z.array(AgentSchema)))[0]);
    assert.deepEqual(agent.history, history, 'history survives a trimmed active context');
    const rev = (await call(`/boards/${board.id}`, undefined, BoardSchema)).rev;
    await call(`/agents/${id}/history/${required(history[0]).id}/undo`, {}, BatchResponseSchema);
    const restored = await call(`/boards/${board.id}`, undefined, BoardSchema);
    assert.equal(restored.rev, rev + 1);
    assert.deepEqual(restored.cards, before.cards); assert.deepEqual(restored.links, before.links);
    await call(`/agents/${id}/message`, { content: 'Explain the board' }, OkSchema);
    agent = await done(board.id, 2);
    assert.equal(required(agent.history[0]).undone, true); assert.equal(required(agent.history[0]).canUndo, false);
    assert.equal(required(agent.history[1]).summary, 'No board changes'); assert.equal(required(agent.history[1]).canUndo, false);
    await host.stop(); await start();
    agent = required((await call('/agents?board=' + board.id, undefined, z.array(AgentSchema)))[0]);
    assert.equal(required(agent.history[0]).undone, true); assert.equal(agent.history.length, 2);
    const childBrief = 'FAKETOOLS ' + JSON.stringify([
      ['board_apply', { commands: [{ op: 'create', type: 'note', newId: 'helper01', text: 'Research findings', x: 800, y: 800 }] }],
      ['finish', { summary: 'Research complete', digest: 'One research note', found: true }],
    ]);
    const { id: lead } = required((await call('/agents', { boardId: board.id, model, brief: 'FAKETOOLS ' + JSON.stringify([
      ['start_part', { title: 'Research', goal: 'Find an idea', brief: childBrief }],
    ]) }, StartedSchema))[0]);
    let leadHistory: z.output<typeof AgentSchema>['history'][number] | undefined;
    for (let i = 0; i < 120; i++) {
      const agents = await call('/agents?board=' + board.id, undefined, z.array(AgentSchema)), root = required(agents.find(a => a.id === lead));
      if (!root.running && root.history[0]?.canUndo) { leadHistory = required(root.history[0]); break; }
      await new Promise(r => setTimeout(r, 30));
    }
    assert.ok(leadHistory, 'a delegated change belongs to the original request');
    assert.equal(required(leadHistory.changes[0]).title, 'Research findings');
    await call(`/agents/${lead}/history/${leadHistory.id}/undo`, {}, BatchResponseSchema);
    assert.deepEqual((await call(`/boards/${board.id}`, undefined, BoardSchema)).cards, before.cards);

    // The browser measures after the model finishes. Those saves must be durable history too.
    const demo = await call('/boards', { name: 'Measured demo history' }, BoardSchema);
    const { id: demoAgent } = required((await call('/agents', { boardId: demo.id, model, brief: 'FAKE ' + JSON.stringify(demoBatch) }, StartedSchema))[0]);
    let demoHistory = required((await done(demo.id, 1)).history[0]);
    const unmeasured = await call(`/boards/${demo.id}`, undefined, BoardSchema);
    const measure = unmeasured.cards.filter(c => ['doc', 'object'].includes(c.type)).map(c => ({ op: 'measure', id: c.id, h: Math.max(96, c.h - 60), baseHeight: c.h }));
    await call(`/boards/${demo.id}/batch`, { commands: measure }, BatchResponseSchema);
    const canonical = await call(`/boards/${demo.id}`, undefined, BoardSchema);
    assert.notDeepEqual(canonical.cards, unmeasured.cards, 'measurements change saved geometry');
    demoHistory = required(required((await call('/agents?board=' + demo.id, undefined, z.array(AgentSchema)))[0]).history[0]);
    assert.equal(demoHistory.canUndo, true);
    const widget = required(canonical.cards.find(c => c.kind === 'html')); assert.ok(widget.kind === 'html');
    const state = JSON.stringify({ version: 1, controls: [], text: [], custom: { count: 0 } });
    await call(`/boards/${demo.id}/batch`, { commands: [{ op: 'initialise_html', id: widget.id, source: { html: widget.data.html, css: widget.data.css, js: widget.data.js }, state }] }, BatchResponseSchema);
    assert.equal(required(required((await call('/agents?board=' + demo.id, undefined, z.array(AgentSchema)))[0]).history[0]).canUndo, true, 'first widget defaults belong to the original request');
    const savedWidget = canonical.cards.find(c => c.id === widget.id); assert.ok(savedWidget?.kind === 'html'); savedWidget.data.state = state;
    await host.stop(); await start();
    assert.equal(required(required((await call('/agents?board=' + demo.id, undefined, z.array(AgentSchema)))[0]).history[0]).canUndo, true, 'measured after-state survives restart');
    const docId = required(canonical.cards[0]).id;
    await call(`/boards/${demo.id}/batch`, { commands: [{ op: 'update', id: docId, set: { props: { body: 'Keep my later document edit' } } }, { op: 'measure', id: docId, h: 500 }] }, BatchResponseSchema);
    assert.equal(required(required((await call('/agents?board=' + demo.id, undefined, z.array(AgentSchema)))[0]).history[0]).canUndo, false, 'mixing a measure with a real edit never makes the edit automatic');
    const changed = await call(`/boards/${demo.id}`, undefined, BoardSchema);
    await call(`/boards/${demo.id}/batch`, { commands: [{ op: 'measure', id: docId, h: required(changed.cards[0]).h + 20 }] }, BatchResponseSchema);
    assert.equal(required(required((await call('/agents?board=' + demo.id, undefined, z.array(AgentSchema)))[0]).history[0]).canUndo, false, 'later measurements do not absorb the content edit');
    await call(`/boards/${demo.id}/batch`, { commands: [{ op: 'restore', cards: canonical.cards, links: canonical.links }] }, BatchResponseSchema);
    const undoRev = (await call(`/boards/${demo.id}`, undefined, BoardSchema)).rev;
    await call(`/agents/${demoAgent}/history/${demoHistory.id}/undo`, {}, BatchResponseSchema);
    const empty = await call(`/boards/${demo.id}`, undefined, BoardSchema);
    assert.equal(empty.cards.length, 0); assert.equal(empty.rev, undoRev + 1);
  } finally { await host.close(); }
});
