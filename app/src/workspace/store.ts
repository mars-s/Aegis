import { applyBatch } from '@aegis/domain/commands';
import { BatchIdSchema, CardIdSchema, LinkIdSchema, RevisionSchema } from '@aegis/domain/schema';
import type { AgentId, BatchId, Board, Card, CardContent, CardId, Command, RequestId } from '@aegis/domain/schema';
import { failureMessage } from '@aegis/host-client/result';
import type { HostFailure, PendingBatch, ReplicationState } from '@aegis/host-client';
import type { HostEvent } from '@aegis/protocol/http';
import { boardChange, cardContent, equalValue, historyCommands, selectedIds, stabiliseBoard } from './projection.js';
import { createSource as makeSource } from './source.js';
import type { WritableSource } from './source.js';
import type { AgentStatus, FieldError, LocalResult, SaveState, SceneChange, UiState, Workspace } from './types.js';

function fieldErrors(errors: readonly { readonly index: number; readonly reason: string }[]): readonly FieldError[] {
  return errors.map(error => ({ ...error, path: `commands.${error.index}${error.reason.includes(':') ? `.${error.reason.split(':')[0]}` : ''}` }));
}

export function createWorkspace(args: { readonly board: Board; readonly id?: () => string }): Workspace {
  const nextId = args.id ?? (() => crypto.randomUUID().replaceAll('-', '').slice(0, 12));
  let publicationDepth = 0;
  const notifications = new Set<() => void>();
  function notify(listener: () => void): void {
    if (publicationDepth > 0) notifications.add(listener);
    else listener();
  }
  function createSource<T>(initial: T): WritableSource<T> { return makeSource(initial, notify); }
  function transaction<T>(action: () => T): T {
    publicationDepth++;
    try { return action(); } finally {
      publicationDepth--;
      if (publicationDepth === 0) {
        const listeners = [...notifications];
        notifications.clear();
        for (const listener of listeners) listener();
      }
    }
  }
  let confirmed = args.board;
  let projected = args.board;
  let epoch = 0;
  let disposed = false;
  let pending: readonly PendingBatch[] = [];
  let blocked: Extract<SaveState, { readonly kind: 'blocked' }> | null = null;
  const sceneListeners = new Set<(change: SceneChange) => void>();
  const contentSources = new Map<CardId, WritableSource<CardContent | null>>();
  const recordSources = new Map<CardId, WritableSource<Card | null>>();
  const agentSources = new Map<string, WritableSource<AgentStatus | null>>();
  const agents = new Map<string, AgentStatus>();
  const eventSource = createSource<HostEvent | null>(null);
  let byId = new Map(projected.cards.map(card => [card.id, card]));
  const metadata = createSource<Pick<Board, 'id' | 'name' | 'rev'>>({ id: projected.id, name: projected.name, rev: projected.rev });
  const saving = createSource<SaveState>({ kind: 'saved', revision: confirmed.rev });
  const selection = createSource<readonly CardId[]>([]);
  const history = createSource({ undo: false, redo: false });
  const ui = createSource<UiState>({ editor: null, leftPanel: false, rightPanel: false });
  const connectionError = createSource<HostFailure | null>(null);
  const replicationState = createSource<ReplicationState>({ epoch, closed: disposed, boardId: confirmed.id, confirmedRevision: confirmed.rev, pending, blocked: false });
  let undoEntries: { readonly before: Board; readonly after: Board }[] = [];
  let redoEntries: { readonly before: Board; readonly after: Board }[] = [];
  const expectedAgentUndos = new Set<{ readonly agentId: AgentId; readonly requestId: RequestId }>();

  function rememberHistory(before: Board): void {
    undoEntries.push({ before, after: projected });
    if (undoEntries.length > 80) undoEntries.shift();
    redoEntries = [];
    history.set({ undo: true, redo: false });
  }

  function publishReplication(): void {
    const nextSaving: SaveState = blocked ? { ...blocked, pending: pending.length } : pending.length ? { kind: 'saving', pending: pending.length } : { kind: 'saved', revision: confirmed.rev };
    if (!equalValue(saving.getSnapshot(), nextSaving)) saving.set(nextSaving);
    const previous = replicationState.getSnapshot();
    if (previous.epoch !== epoch || previous.closed !== disposed || previous.boardId !== confirmed.id || previous.confirmedRevision !== confirmed.rev || previous.pending !== pending || previous.blocked !== (blocked !== null)) {
      replicationState.set({ epoch, closed: disposed, boardId: confirmed.id, confirmedRevision: confirmed.rev, pending, blocked: blocked !== null });
    }
  }

  function publish(next: Board, replace = false, origin: SceneChange['origin'] = 'sync'): void {
    const previous = projected;
    projected = replace ? next : stabiliseBoard(previous, next);
    byId = new Map(projected.cards.map(card => [card.id, card]));
    const change = boardChange(previous, projected);
    const meta = { id: projected.id, name: projected.name, rev: projected.rev };
    if (!equalValue(metadata.getSnapshot(), meta)) metadata.set(meta);
    for (const [id, source] of contentSources) {
      const card = byId.get(id);
      const content = card ? cardContent(card) : null;
      if (!equalValue(source.getSnapshot(), content)) source.set(content);
    }
    for (const [id, source] of recordSources) source.set(byId.get(id) ?? null);
    const selected = selectedIds(selection.getSnapshot(), projected.cards);
    if (!equalValue(selection.getSnapshot(), selected)) selection.set(selected);
    const notification: SceneChange = replace ? { ...change, kind: 'replace', board: projected, origin } : { ...change, kind: 'change', origin };
    for (const listener of [...sceneListeners]) notify(() => { listener(notification); });
  }

  function block(batchId: BatchId, reason: string, errors: readonly FieldError[] = []): void {
    blocked = { kind: 'blocked', batchId, reason, pending: pending.length, errors };
  }

  function rebase(origin: SceneChange['origin'] = 'sync'): void {
    let next = confirmed;
    for (const entry of pending) {
      const result = applyBatch(next, { commands: [...entry.commands] });
      if (!result.ok) {
        const errors = fieldErrors(result.errors);
        block(entry.id, errors[0]?.reason ?? 'A queued edit conflicts with the current board', errors);
        break;
      }
      next = result.board;
    }
    publish(next, false, origin);
    publishReplication();
  }

  function submit(commands: readonly Command[], remember: boolean): LocalResult {
    if (disposed) return { kind: 'rejected', errors: [{ index: -1, path: 'workspace', reason: 'The workspace is closed' }] };
    const prepared = structuredClone(commands);
    for (const command of prepared) {
      if (command.op === 'create' && !command.newId) command.newId = CardIdSchema.parse(nextId());
      if (command.op === 'connect' && !command.newId) command.newId = LinkIdSchema.parse(nextId());
    }
    const result = applyBatch(projected, { commands: prepared });
    if (!result.ok) return { kind: 'rejected', errors: fieldErrors(result.errors) };
    const before = projected;
    const id = BatchIdSchema.parse(crypto.randomUUID());
    pending = [...pending, { id, boardId: confirmed.id, commands: prepared }];
    publish(result.board, false, 'local');
    const derived = prepared.every(command => command.op === 'measure' || command.op === 'initialise_html');
    if (derived) {
      const previous = undoEntries.at(-1);
      if (previous) {
        const normalised = applyBatch(previous.after, { commands: prepared });
        if (normalised.ok) undoEntries[undoEntries.length - 1] = { ...previous, after: normalised.board };
      }
    } else if (remember) {
      rememberHistory(before);
    }
    publishReplication();
    const existing = new Set(before.cards.map(card => card.id));
    return { kind: 'applied', batchId: id, created: result.created, ids: projected.cards.filter(card => !existing.has(card.id)).map(card => card.id) };
  }

  function accept(expected: number, event: HostEvent): 'applied' | 'ignored' | 'gap' {
    if (disposed || expected !== epoch) return 'ignored';
    if (event.type === 'agent') {
      if (event.boardId !== undefined && event.boardId !== confirmed.id) return 'ignored';
      const previous = agents.get(event.id);
      if (event.revision !== undefined && previous?.revision !== undefined && event.revision <= previous.revision) return 'ignored';
      agents.set(event.id, event);
      agentSources.get(event.id)?.set(event);
      eventSource.set(event);
      return 'applied';
    }
    if (event.type !== 'board') { eventSource.set(event); return 'applied'; }
    if (event.boardId !== confirmed.id || event.rev <= confirmed.rev) return 'ignored';
    if (!event.patch || event.baseRev !== confirmed.rev) return 'gap';
    const expectedUndos = event.author.kind === 'agent' && event.author.conversationId !== undefined && event.author.undoRequest
      ? [...expectedAgentUndos].filter(request => request.agentId === String(event.author.conversationId) && request.requestId === event.author.undoRequest)
      : [];
    const before = projected;
    const removed = new Set(event.patch.removed);
    const changed = new Map(event.patch.cards.map(card => [card.id, card]));
    const cards = confirmed.cards.filter(card => !removed.has(card.id)).map(card => {
      const next = changed.get(card.id);
      changed.delete(card.id);
      return next ?? card;
    });
    cards.push(...changed.values());
    const all = new Map(cards.map(card => [card.id, card]));
    const ordered = event.patch.order ? event.patch.order.flatMap(id => {
      const card = all.get(id);
      return card ? [card] : [];
    }) : cards;
    confirmed = Object.assign({}, confirmed);
    confirmed.cards = ordered;
    confirmed.links = event.patch.links ?? confirmed.links;
    confirmed.rev = event.rev;
    confirmed.focus = event.focus;
    const fields = event.patch.fields;
    if (fields.bg === null) delete confirmed.bg;
    else if (fields.bg !== undefined) confirmed.bg = fields.bg;
    if (fields.palette === null) delete confirmed.palette;
    else if (fields.palette !== undefined) confirmed.palette = fields.palette;
    if (fields.tray === null) delete confirmed.tray;
    else if (fields.tray !== undefined) confirmed.tray = fields.tray;
    rebase(event.author.kind === 'agent' && !event.author.undoRequest ? 'agent' : 'sync');
    if (expectedUndos.length) {
      for (const request of expectedUndos) expectedAgentUndos.delete(request);
      rememberHistory(before);
    }
    eventSource.set(event);
    return 'applied';
  }

  return {
    scene: { snapshot: () => projected, subscribe: listener => { sceneListeners.add(listener); return () => { sceneListeners.delete(listener); }; } },
    replication: {
      state: replicationState,
      acknowledge: (expected, batchId, response) => transaction(() => {
        const head = pending[0];
        if (disposed || expected !== epoch || !head || head.id !== batchId) return;
        if (!response.ok) {
          const errors = fieldErrors(response.errors);
          block(batchId, errors[0]?.reason ?? 'The host refused that edit', errors);
          publishReplication();
          return;
        }
        const applied = applyBatch(confirmed, { commands: [...head.commands] });
        if (applied.ok) {
          confirmed = Object.assign({}, applied.board);
          confirmed.rev = RevisionSchema.parse(response.rev);
        }
        pending = pending.slice(1);
        blocked = null;
        connectionError.set(null);
        rebase();
      }),
      reconcile: (expected, board) => transaction(() => {
        if (disposed || expected !== epoch || board.id !== confirmed.id || board.rev < confirmed.rev) return;
        confirmed = board;
        connectionError.set(null);
        rebase();
      }),
      accept: (expected, event) => transaction(() => accept(expected, event)),
      failed: (expected, batchId, error) => transaction(() => {
        if (disposed || expected !== epoch || pending[0]?.id !== batchId) return;
        block(batchId, failureMessage(error));
        connectionError.set(error);
        publishReplication();
      }),
    },
    metadata, saving, selection, history, ui, connectionError, events: eventSource,
    agent: id => {
      let source = agentSources.get(id);
      if (!source) {
        source = createSource<AgentStatus | null>(agents.get(id) ?? null);
        agentSources.set(id, source);
      }
      return source;
    },
    card: id => {
      let source = contentSources.get(id);
      if (!source) {
        const card = byId.get(id);
        source = createSource<CardContent | null>(card ? cardContent(card) : null);
        contentSources.set(id, source);
      }
      return source;
    },
    record: id => {
      let source = recordSources.get(id);
      if (!source) {
        source = createSource<Card | null>(byId.get(id) ?? null);
        recordSources.set(id, source);
      }
      return source;
    },
    submit: commands => transaction(() => submit(commands, true)),
    expectAgentUndo: (agentId, requestId) => {
      const request = { agentId, requestId };
      if (!disposed) expectedAgentUndos.add(request);
      return () => { expectedAgentUndos.delete(request); };
    },
    undo: () => transaction(() => {
      const entry = undoEntries.at(-1);
      if (!entry) return { kind: 'rejected', errors: [{ index: -1, path: 'history', reason: 'Nothing left to undo' }] };
      const result = submit(historyCommands(entry.before), false);
      if (result.kind === 'applied') {
        undoEntries.pop(); redoEntries.push(entry);
        history.set({ undo: undoEntries.length > 0, redo: true });
      }
      return result;
    }),
    redo: () => transaction(() => {
      const entry = redoEntries.at(-1);
      if (!entry) return { kind: 'rejected', errors: [{ index: -1, path: 'history', reason: 'Nothing left to redo' }] };
      const result = submit(historyCommands(entry.after), false);
      if (result.kind === 'applied') {
        redoEntries.pop(); undoEntries.push(entry);
        history.set({ undo: true, redo: redoEntries.length > 0 });
      }
      return result;
    }),
    retry: () => transaction(() => {
      if (disposed) return;
      blocked = null;
      rebase();
    }),
    act: intent => transaction(() => {
      if (disposed) return;
      switch (intent.kind) {
        case 'select': {
          const ids = selectedIds(intent.ids, projected.cards);
          if (!equalValue(selection.getSnapshot(), ids)) selection.set(ids);
          return;
        }
        case 'edit-close':
          ui.set({ ...ui.getSnapshot(), editor: null });
          return;
        case 'edit':
          if (byId.has(intent.id)) ui.set({ ...ui.getSnapshot(), editor: { id: intent.id, view: intent.view } });
          return;
        case 'panel':
          ui.set({ ...ui.getSnapshot(), ...(intent.side === 'left' ? { leftPanel: intent.open } : { rightPanel: intent.open }) });
          return;
        default: {
          const exhaustive: never = intent;
          return exhaustive;
        }
      }
    }),
    replaceBoard: board => transaction(() => {
      if (disposed || pending.length > 0) return false;
      epoch++;
      confirmed = board;
      blocked = null;
      undoEntries = []; redoEntries = [];
      expectedAgentUndos.clear();
      agents.clear();
      for (const source of agentSources.values()) source.set(null);
      agentSources.clear();
      for (const source of contentSources.values()) source.set(null);
      for (const source of recordSources.values()) source.set(null);
      contentSources.clear(); recordSources.clear();
      eventSource.set(null);
      selection.set([]);
      history.set({ undo: false, redo: false });
      ui.set({ ...ui.getSnapshot(), editor: null });
      publish(board, true);
      publishReplication();
      return true;
    }),
    dispose: () => transaction(() => {
      if (disposed) return;
      disposed = true;
      epoch++;
      expectedAgentUndos.clear();
      publishReplication();
      sceneListeners.clear();
      for (const source of contentSources.values()) source.clear();
      for (const source of recordSources.values()) source.clear();
      for (const source of agentSources.values()) source.clear();
      agents.clear(); agentSources.clear(); eventSource.clear();
      contentSources.clear(); recordSources.clear();
      metadata.clear(); saving.clear(); selection.clear(); history.clear(); ui.clear(); connectionError.clear(); replicationState.clear();
    }),
  };
}
