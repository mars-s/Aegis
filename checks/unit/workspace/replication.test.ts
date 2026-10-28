import { describe, expect, it } from 'vitest';
import { AgentIdSchema, applyBatch, BoardSchema, RevisionSchema } from '@aegis/domain';
import type { Board, Command } from '@aegis/domain';
import { connectWorkspace } from '@aegis/host-client';
import type { BoardClient, HostResult } from '@aegis/host-client';
import { decodeHostEvent } from '@aegis/protocol/http';
import { createWorkspace } from '../../../app/src/workspace/store.js';
import { boardWith, deferred, memoryHost, noteId, otherBoardId, otherId } from './helpers.js';

function change(board: Board, commands: readonly Command[]): Board {
  const result = applyBatch(board, { commands: [...commands] });
  if (!result.ok) throw new Error(result.errors[0]?.reason ?? 'Invalid fixture');
  return result.board;
}

function event(before: Board, after: Board, undoRequest?: string) {
  return decodeHostEvent({
    type: 'board', boardId: after.id, baseRev: before.rev, rev: after.rev,
    patch: { cards: after.cards, removed: before.cards.filter(card => !after.cards.some(next => next.id === card.id)).map(card => card.id), links: after.links, order: after.cards.map(card => card.id), fields: {} },
    author: { kind: 'agent', conversationId: '1', ...(undoRequest ? { undoRequest } : {}) }, touched: after.cards.map(card => card.id), focus: null, sentAt: 1,
  });
}

describe('ordered workspace connection', () => {
  it('carries actual batch provenance and publishes accepted board events without animating local edits or Undo', async () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Agent-authored note', agent: 'synthetic-agent' }]);
    const host = memoryHost(initial), workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client: host.client, workspace });
    const origins: string[] = [], authors: string[] = [];
    workspace.scene.subscribe(change => origins.push(change.origin));
    workspace.events.subscribe(() => { const next = workspace.events.getSnapshot(); if (next?.type === 'board') authors.push(next.author.kind); });
    try {
      await connection.settled(); origins.length = 0;
      workspace.submit([{ op: 'move', id: noteId, x: 100, y: 200 }]);
      expect(origins[0]).toBe('local');
      await connection.settled();
      workspace.undo();
      expect(origins.at(-1)).toBe('local');
      await connection.settled();
      const before = host.board(), after = change(before, [{ op: 'move', id: noteId, x: 300, y: 400 }]);
      host.setBoard(after); host.emit(event(before, after));
      await expect.poll(() => origins.at(-1)).toBe('agent');
      expect(authors.at(-1)).toBe('agent');
      const undone = change(after, [{ op: 'move', id: noteId, x: 0, y: 0 }]);
      host.setBoard(undone); host.emit(event(after, undone, 'synthetic-request'));
      await expect.poll(() => origins.at(-1)).toBe('sync');
      expect(workspace.record(noteId).getSnapshot()?.x).toBe(0);
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('retains failed and later saves until explicit Retry, then sends them in order', async () => {
    const initial = boardWith();
    const host = memoryHost(initial);
    host.online(false);
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client: host.client, workspace });
    try {
      await connection.settled();
      workspace.submit([{ op: 'create', newId: noteId, text: 'Original' }]);
      await connection.settled();
      workspace.submit([{ op: 'update', id: noteId, set: { text: 'Later edit' } }]);
      await connection.settled();
      expect(host.attempts).toHaveLength(1);
      expect(host.board().cards).toHaveLength(0);
      expect(workspace.saving.getSnapshot()).toMatchObject({ kind: 'blocked', pending: 2 });
      host.online(true);
      connection.resynchronise();
      await connection.settled();
      expect(host.attempts).toHaveLength(1);
      expect(workspace.card(noteId).getSnapshot()).toMatchObject({ text: 'Later edit' });
      workspace.retry();
      await connection.settled();
      expect(host.attempts.map(batch => batch.commands[0]?.op)).toEqual(['create', 'create', 'update']);
      expect(host.board().cards).toHaveLength(1);
      expect(host.board().cards[0]?.text).toBe('Later edit');
      expect(workspace.saving.getSnapshot().kind).toBe('saved');
      expect(workspace.replication.state.getSnapshot().pending).toHaveLength(0);
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('keeps an agent change animated when a local save lands while its event is still in flight', async () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Start' }]);
    const host = memoryHost(initial);
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client: host.client, workspace, reconnectMs: 1 });
    const created: { readonly origin: string; readonly id: string }[] = [];
    try {
      await connection.settled();
      const known = new Set(workspace.scene.snapshot().cards.map(card => card.id));
      workspace.scene.subscribe(change => { for (const card of change.upserted) if (!known.has(card.id)) { known.add(card.id); created.push({ origin: change.origin, id: card.id }); } });
      // The agent commits first, but its event has not reached this client yet.
      const before = host.board(), agentBoard = change(before, [{ op: 'create', newId: otherId, text: 'Agent result' }]);
      host.setBoard(agentBoard);
      // A measured height commits on top of the agent's revision before the event arrives.
      workspace.submit([{ op: 'move', id: noteId, x: 40, y: 40 }]);
      await expect.poll(() => host.attempts.length).toBe(1);
      host.emit(event(before, agentBoard));
      await connection.settled();
      expect(created).toEqual([{ origin: 'agent', id: otherId }]);
      expect(workspace.scene.snapshot().rev).toBe(host.board().rev);
      expect(workspace.record(noteId).getSnapshot()).toMatchObject({ x: 40, y: 40 });
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('reads a snapshot when an earlier author event never arrives', async () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Start' }]);
    const host = memoryHost(initial);
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client: host.client, workspace, reconnectMs: 1 });
    try {
      await connection.settled();
      host.setBoard(change(host.board(), [{ op: 'create', newId: otherId, text: 'Lost event' }]));
      workspace.submit([{ op: 'move', id: noteId, x: 40, y: 40 }]);
      await expect.poll(() => workspace.card(otherId).getSnapshot()?.text, { timeout: 2000 }).toBe('Lost event');
      expect(workspace.scene.snapshot().rev).toBe(host.board().rev);
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('does not carry a pending revision check into the next board', async () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Start' }]);
    const host = memoryHost(initial);
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client: host.client, workspace, reconnectMs: 1 });
    try {
      await connection.settled();
      // Another author's revision makes this save land two ahead, which arms the late snapshot check.
      host.setBoard(change(host.board(), [{ op: 'create', newId: otherId, text: 'Elsewhere' }]));
      host.setBoard(change(host.board(), [{ op: 'update', id: otherId, set: { text: 'Elsewhere again' } }]));
      workspace.submit([{ op: 'move', id: noteId, x: 40, y: 40 }]);
      await expect.poll(() => host.attempts.length).toBe(1);
      const next = BoardSchema.parse({ ...boardWith(), id: otherBoardId, name: 'Next board' });
      host.setBoard(next);
      expect(workspace.replaceBoard(next)).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 450));
      workspace.submit([{ op: 'create', newId: noteId, text: 'On the next board' }]);
      await expect.poll(() => workspace.saving.getSnapshot().kind, { timeout: 2000 }).toBe('saved');
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('reconciles a revision gap before applying later queued patches', async () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Initial' }]);
    const host = memoryHost(initial);
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client: host.client, workspace });
    try {
      await connection.settled();
      const missed = change(initial, [{ op: 'update', id: noteId, set: { text: 'Missed event' } }]);
      const latest = change(missed, [{ op: 'move', id: noteId, x: 100, y: 200 }]);
      host.setBoard(latest);
      host.emit(event(missed, latest));
      await connection.settled();
      expect(host.reads).toHaveLength(2);
      expect(workspace.scene.snapshot().rev).toBe(latest.rev);
      expect(workspace.card(noteId).getSnapshot()).toMatchObject({ text: 'Missed event' });
      const later = change(latest, [{ op: 'create', newId: otherId, text: 'After gap' }]);
      host.setBoard(later);
      host.emit(event(latest, later));
      await connection.settled();
      expect(host.reads).toHaveLength(2);
      expect(workspace.scene.snapshot().cards).toHaveLength(2);
      expect(workspace.scene.snapshot().rev).toBe(later.rev);
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('cancels the old board read and drops a late result after board replacement', async () => {
    const initial = boardWith();
    const host = memoryHost(initial);
    const gate = deferred<HostResult<Board>>();
    let oldSignal: AbortSignal | undefined;
    const next = BoardSchema.parse({ ...initial, id: otherBoardId, name: 'Second board' });
    const client: BoardClient = {
      ...host.client,
      board: async (id, signal) => {
        if (id === initial.id) { oldSignal = signal; return gate.promise; }
        return { kind: 'ok', value: next };
      },
    };
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client, workspace });
    try {
      await Promise.resolve();
      expect(workspace.replaceBoard(next)).toBe(true);
      expect(oldSignal?.aborted).toBe(true);
      gate.resolve({ kind: 'ok', value: BoardSchema.parse({ ...initial, name: 'Stale', rev: RevisionSchema.parse(99) }) });
      await connection.settled();
      expect(workspace.scene.snapshot().id).toBe(otherBoardId);
      expect(workspace.metadata.getSnapshot().name).toBe('Second board');
      expect(workspace.scene.snapshot().rev).toBe(next.rev);
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('does not notify content sources when a move is acknowledged and reread', async () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Stable body' }]);
    const host = memoryHost(initial);
    const workspace = createWorkspace({ board: initial });
    const source = workspace.card(noteId);
    const before = source.getSnapshot();
    let notifications = 0;
    source.subscribe(() => { notifications++; });
    const connection = connectWorkspace({ client: host.client, workspace });
    try {
      await connection.settled();
      workspace.submit([{ op: 'move', id: noteId, x: 200, y: 300 }]);
      await connection.settled();
      expect(notifications).toBe(0);
      expect(source.getSnapshot()).toBe(before);
      expect(host.board().cards[0]).toMatchObject({ x: 200, y: 300 });
      expect(workspace.saving.getSnapshot().kind).toBe('saved');
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('keeps edits added during snapshot reconciliation pending until committed', async () => {
    const initial = boardWith();
    const host = memoryHost(initial);
    const snapshot = deferred<HostResult<Board>>();
    const reading = deferred<void>();
    let reads = 0;
    const client: BoardClient = {
      ...host.client,
      board: async (id, signal) => {
        reads++;
        if (reads === 2) { reading.resolve(); return snapshot.promise; }
        return host.client.board(id, signal);
      },
    };
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client, workspace });
    try {
      await connection.settled();
      workspace.submit([{ op: 'create', newId: noteId, text: 'First' }]);
      await reading.promise;
      workspace.submit([{ op: 'update', id: noteId, set: { text: 'During read' } }]);
      expect(workspace.saving.getSnapshot().kind).toBe('saving');
      snapshot.resolve({ kind: 'ok', value: host.board() });
      await connection.settled();
      expect(host.attempts).toHaveLength(2);
      expect(host.board().cards[0]?.text).toBe('During read');
      expect(workspace.saving.getSnapshot().kind).toBe('saved');
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('reconciles after a bounded queue overflows', async () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Start' }]);
    const host = memoryHost(initial);
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client: host.client, workspace, maxQueuedEvents: 1 });
    try {
      await connection.settled();
      const second = change(initial, [{ op: 'update', id: noteId, set: { text: 'Second' } }]);
      const third = change(second, [{ op: 'update', id: noteId, set: { text: 'Third' } }]);
      host.setBoard(third);
      host.emit(event(initial, second));
      host.emit(event(second, third));
      await connection.settled();
      expect(workspace.scene.snapshot().rev).toBe(third.rev);
      expect(workspace.card(noteId).getSnapshot()).toMatchObject({ text: 'Third' });
      expect(host.reads.length).toBeGreaterThan(1);
    } finally { connection.dispose(); workspace.dispose(); }
  });
  it('does not repeat an acknowledged POST when its following snapshot read fails', async () => {
    const initial = boardWith();
    const host = memoryHost(initial);
    let reads = 0;
    const client: BoardClient = {
      ...host.client,
      board: async (id, signal) => {
        reads++;
        if (reads === 2) return { kind: 'error', error: { kind: 'offline', message: 'Read interrupted after commit' } };
        return host.client.board(id, signal);
      },
    };
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client, workspace, reconnectMs: 1 });
    try {
      await connection.settled();
      workspace.submit([{ op: 'create', newId: noteId, text: 'One POST' }]);
      await connection.settled();
      expect(reads).toBe(3);
      expect(host.attempts).toHaveLength(1);
      expect(host.board().cards).toHaveLength(1);
      expect(workspace.saving.getSnapshot().kind).toBe('saved');
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('publishes ordered agent status while a board snapshot is still pending', async () => {
    const initial = boardWith();
    const host = memoryHost(initial);
    const snapshot = deferred<HostResult<Board>>();
    const client: BoardClient = { ...host.client, board: () => snapshot.promise };
    const workspace = createWorkspace({ board: initial });
    const source = workspace.agent(AgentIdSchema.parse('helper-1'));
    const connection = connectWorkspace({ client, workspace });
    try {
      await Promise.resolve();
      host.emit(decodeHostEvent({ type: 'agent', id: 'helper-1', boardId: initial.id, revision: 2, running: false, done: true }));
      expect(source.getSnapshot()).toMatchObject({ revision: 2, done: true });
      host.emit(decodeHostEvent({ type: 'agent', id: 'helper-1', boardId: initial.id, revision: 1, running: true }));
      expect(source.getSnapshot()).toMatchObject({ revision: 2, done: true });
      snapshot.resolve({ kind: 'ok', value: initial });
      await connection.settled();
      expect(source).toBe(workspace.agent(AgentIdSchema.parse('helper-1')));
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('retries a stale snapshot without losing the event that exposed the gap', async () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Initial' }]);
    const host = memoryHost(initial);
    const missed = change(initial, [{ op: 'update', id: noteId, set: { text: 'Missed' } }]);
    const latest = change(missed, [{ op: 'update', id: noteId, set: { text: 'Latest' } }]);
    let reads = 0;
    const client: BoardClient = {
      ...host.client,
      board: async () => ({ kind: 'ok', value: ++reads <= 2 ? initial : latest }),
    };
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client, workspace, reconnectMs: 1 });
    try {
      await connection.settled();
      host.emit(event(missed, latest));
      await connection.settled();
      expect(reads).toBe(3);
      expect(workspace.scene.snapshot().rev).toBe(latest.rev);
      expect(workspace.card(noteId).getSnapshot()).toMatchObject({ text: 'Latest' });
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('closes the connection when its workspace is disposed', async () => {
    const initial = boardWith();
    const host = memoryHost(initial);
    let signal: AbortSignal | undefined;
    const client: BoardClient = {
      ...host.client,
      events: args => { signal = args.signal; return host.client.events(args); },
    };
    const workspace = createWorkspace({ board: initial });
    const connection = connectWorkspace({ client, workspace });
    await connection.settled();
    workspace.dispose();
    await connection.settled();
    expect(signal?.aborted).toBe(true);
    connection.dispose();
  });

});
