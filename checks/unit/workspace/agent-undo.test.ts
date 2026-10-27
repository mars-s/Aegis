import { describe, expect, it } from 'vitest';
import { AgentIdSchema, applyBatch, RequestIdSchema } from '@aegis/domain';
import type { Board, Command } from '@aegis/domain';
import { connectWorkspace } from '@aegis/host-client';
import { decodeHostEvent } from '@aegis/protocol/http';
import { createWorkspace } from '../../../app/src/workspace/store.js';
import { boardWith, memoryHost, noteId, otherId } from './helpers.js';

const agentId = AgentIdSchema.parse('1'), requestId = RequestIdSchema.parse('request-one');
function change(board: Board, commands: readonly Command[]): Board {
  const result = applyBatch(board, { commands: [...commands] });
  if (!result.ok) throw new Error('Invalid agent Undo fixture');
  return result.board;
}
function event(before: Board, after: Board, agent: string | number = agentId, request: string = requestId) {
  return decodeHostEvent({
    type: 'board', boardId: after.id, baseRev: before.rev, rev: after.rev,
    patch: { cards: after.cards, removed: before.cards.filter(card => !after.cards.some(next => next.id === card.id)).map(card => card.id), links: after.links, order: after.cards.map(card => card.id), fields: {} },
    author: { kind: 'agent', conversationId: agent, undoRequest: request }, touched: after.cards.map(card => card.id), focus: null, sentAt: 1,
  });
}

describe('locally requested agent Undo history', () => {
  it('reverses one requested remote Undo through normal Undo and Redo without removing an unrelated local note', async () => {
    const host = memoryHost(boardWith()), workspace = createWorkspace({ board: host.board() });
    const connection = connectWorkspace({ client: host.client, workspace });
    try {
      await connection.settled();
      workspace.submit([{ op: 'create', newId: noteId, text: 'My unrelated note' }]);
      await connection.settled();
      const beforeCreate = host.board(), created = change(beforeCreate, [{ op: 'create', newId: otherId, text: 'Agent result' }]);
      host.setBoard(created);
      const createdEvent = event(beforeCreate, created);
      if (createdEvent.type !== 'board') throw new Error('Missing board event');
      delete createdEvent.author.undoRequest;
      host.emit(createdEvent); await connection.settled();
      workspace.expectAgentUndo(agentId, requestId);
      const undone = change(created, [{ op: 'delete', ids: [otherId] }]);
      host.setBoard(undone); host.emit(event(created, undone, 1));
      await connection.settled();
      expect(host.attempts).toHaveLength(1);
      expect(workspace.scene.snapshot().cards.map(card => card.text)).toEqual(['My unrelated note']);
      workspace.undo(); await connection.settled();
      expect(workspace.scene.snapshot().cards.map(card => card.text)).toEqual(['My unrelated note', 'Agent result']);
      workspace.redo(); await connection.settled();
      expect(workspace.scene.snapshot().cards.map(card => card.text)).toEqual(['My unrelated note']);
    } finally { connection.dispose(); workspace.dispose(); }
  });

  it('records only the exact expected agent and request, once', () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Later user text', x: 100, y: 100 }]);
    const workspace = createWorkspace({ board: initial });
    workspace.expectAgentUndo(agentId, requestId);
    const otherAgent = change(initial, [{ op: 'move', id: noteId, x: 200, y: 100 }]);
    workspace.replication.accept(0, event(initial, otherAgent, '2'));
    const otherRequest = change(otherAgent, [{ op: 'move', id: noteId, x: 300, y: 100 }]);
    workspace.replication.accept(0, event(otherAgent, otherRequest, agentId, 'other-request'));
    expect(workspace.history.getSnapshot()).toEqual({ undo: false, redo: false });
    const matched = change(otherRequest, [{ op: 'move', id: noteId, x: 400, y: 100 }]);
    const receipt = event(otherRequest, matched);
    expect(workspace.replication.accept(0, receipt)).toBe('applied');
    expect(workspace.replication.accept(0, receipt)).toBe('ignored');
    workspace.undo();
    expect(workspace.record(noteId).getSnapshot()).toMatchObject({ x: 300, text: 'Later user text' });
    expect(workspace.history.getSnapshot()).toEqual({ undo: false, redo: true });
    workspace.dispose();
  });

  it('cancellation cannot cancel a newer expectation for the same request', () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Keep me' }]);
    const workspace = createWorkspace({ board: initial });
    const cancelOld = workspace.expectAgentUndo(agentId, requestId);
    workspace.expectAgentUndo(agentId, requestId);
    cancelOld();
    const after = change(initial, [{ op: 'move', id: noteId, x: 100, y: 100 }]);
    workspace.replication.accept(0, event(initial, after));
    expect(workspace.history.getSnapshot().undo).toBe(true);
    workspace.dispose();
  });

  it('cancelled and replaced board expectations never turn a remote Undo into local history', () => {
    const initial = boardWith([{ op: 'create', newId: noteId, text: 'Keep me' }]);
    const workspace = createWorkspace({ board: initial });
    const cancel = workspace.expectAgentUndo(agentId, requestId); cancel();
    const after = change(initial, [{ op: 'move', id: noteId, x: 100, y: 100 }]);
    workspace.replication.accept(0, event(initial, after));
    expect(workspace.history.getSnapshot().undo).toBe(false);
    workspace.expectAgentUndo(agentId, requestId);
    expect(workspace.replaceBoard(initial)).toBe(true);
    workspace.replication.accept(1, event(initial, after));
    expect(workspace.history.getSnapshot().undo).toBe(false);
    workspace.dispose();
    workspace.expectAgentUndo(agentId, requestId)();
    expect(workspace.replication.accept(1, event(initial, after))).toBe('ignored');
  });
});
