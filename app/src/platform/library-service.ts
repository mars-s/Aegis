import { z } from 'zod/v4';
import { BoardIdSchema } from '@aegis/domain';
import type { BoardId } from '@aegis/domain';
import { failureMessage } from '@aegis/host-client';
import type { HostClient, HostResult, WorkspaceConnection } from '@aegis/host-client';
import type { LibraryService, LibrarySnapshot } from '../chrome/library-model.js';
import type { Workspace } from '../workspace/index.js';
import { createSource } from '../workspace/source.js';

const pendingFields = { name: z.string(), ids: z.array(z.string()), current: BoardIdSchema.nullable(), until: z.number().finite() };
const PendingSchema = z.discriminatedUnion('board', [
  z.object({ ...pendingFields, board: z.literal(true), id: BoardIdSchema }),
  z.object({ ...pendingFields, board: z.literal(false), id: z.string() }),
]);
export function hostValue<T>(result: HostResult<T>): T {
  if (result.kind === 'ok') return result.value;
  if (result.error.kind === 'cancelled') throw new DOMException('Cancelled', 'AbortError');
  throw new Error(failureMessage(result.error));
}

export function createLibraryService(args: {
  readonly workspace: Workspace;
  readonly client: HostClient;
  readonly replication: WorkspaceConnection;
  readonly open: (id: BoardId) => Promise<boolean>;
  readonly notify: (message: string) => void;
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}) {
  const key = 'aegis:library-deletion', lifetime = new AbortController();
  const source = createSource<LibrarySnapshot>({ nodes: [], boards: [] });
  const pending = createSource<z.output<typeof PendingSchema> | null>(null);
  let raw: LibrarySnapshot = source.getSnapshot();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let operations: Promise<unknown> = Promise.resolve();
  function sequence<T>(run: () => Promise<T>): Promise<T> {
    const result = operations.then(run);
    operations = result.catch(() => {});
    return result;
  }
  function publish(): void {
    const removed = new Set(pending.getSnapshot()?.ids ?? []);
    source.set({ nodes: raw.nodes.filter(node => !removed.has(node.id)), boards: raw.boards.filter(board => !removed.has(board.id)) });
  }
  async function refresh(signal: AbortSignal): Promise<void> {
    const next = hostValue(await args.client.library.read(AbortSignal.any([lifetime.signal, signal])));
    if (lifetime.signal.aborted || signal.aborted) return;
    raw = next; publish();
  }
  function save(value: z.output<typeof PendingSchema> | null): void {
    pending.set(value);
    if (value) args.storage.setItem(key, JSON.stringify(value)); else args.storage.removeItem(key);
    if (timer) clearTimeout(timer);
    timer = value ? setTimeout(() => { timer = null; void sequence(commit).catch(cause => args.notify(cause instanceof Error ? cause.message : 'Could not delete this item.')); }, Math.max(0, value.until - Date.now())) : null;
    publish();
  }
  async function commit(): Promise<void> {
    const value = pending.getSnapshot();
    if (!value || lifetime.signal.aborted) return;
    try {
      const current = hostValue(await args.client.library.read(lifetime.signal));
      const exists = [...current.boards, ...current.nodes].some(item => item.id === value.id);
      if (exists) hostValue(await (value.board ? args.client.library.removeBoard(value.id, lifetime.signal) : args.client.library.change({ op: 'delete', id: value.id, recursive: true }, lifetime.signal)));
      save(null); await refresh(lifetime.signal);
    } catch (cause) {
      if (!lifetime.signal.aborted) { save(null); args.notify(`Could not delete "${value.name}". It is still in your Library.`); }
      throw cause;
    }
  }
  async function undo(): Promise<void> {
    const value = pending.getSnapshot();
    if (!value) return;
    save(null); await refresh(lifetime.signal);
    if (value.current) await args.open(value.current);
  }
  const service: LibraryService = {
    source, refresh,
    open: async id => pending.getSnapshot()?.ids.includes(id) ? false : args.open(id),
    load: async (id, signal) => hostValue(await args.client.board(id, AbortSignal.any([lifetime.signal, signal]))),
    createChild: async (parent, at) => {
      await args.replication.settled();
      hostValue(await args.client.library.createChild('Untitled canvas', parent, at, lifetime.signal));
      args.replication.resynchronise();
      await args.replication.settled();
      await refresh(lifetime.signal);
    },
    create: async (kind, parent) => {
      const created = kind === 'board'
        ? hostValue(await args.client.library.createBoard('Untitled', parent, lifetime.signal)).id
        : hostValue(await args.client.library.change({ op: 'create', kind, parent }, lifetime.signal)).created;
      if (!created) throw new Error('The Library item was not created.');
      await refresh(lifetime.signal);
      if (kind === 'board') await args.open(BoardIdSchema.parse(created));
      return created;
    },
    rename: async (item, name) => {
      if (item.item === 'board') hostValue(await args.client.library.renameBoard(item.id, name, lifetime.signal));
      else hostValue(await args.client.library.change({ op: 'rename', id: item.id, name }, lifetime.signal));
      args.replication.resynchronise(); await args.replication.settled(); await refresh(lifetime.signal);
    },
    move: async (item, destination) => {
      if (destination.kind === 'board') hostValue(await args.client.library.change({ op: 'move', id: item.id, boardParent: destination.id }, lifetime.signal));
      else hostValue(await args.client.library.change({ op: 'move', id: item.id, parent: destination.id }, lifetime.signal));
      args.replication.resynchronise(); await args.replication.settled(); await refresh(lifetime.signal);
    },
    duplicate: async item => {
      const result = hostValue(await args.client.library.duplicate(item.id, lifetime.signal));
      if (!result.created) throw new Error('The Library item was not duplicated.');
      await refresh(lifetime.signal); return result.created;
    },
    cover: async (id, cover) => { hostValue(await args.client.library.change({ op: 'cover', id, cover }, lifetime.signal)); await refresh(lifetime.signal); },
    remove: item => sequence(async () => {
      if (pending.getSnapshot()) await commit();
      await refresh(lifetime.signal);
      const removed = new Set<string>([item.id]);
      let previous = 0;
      while (removed.size !== previous) {
        previous = removed.size;
        for (const child of [...raw.nodes, ...raw.boards]) {
          const parent = 'boardParent' in child ? child.boardParent ?? child.parent : child.parent;
          if (parent && removed.has(parent)) removed.add(child.id);
        }
      }
      let next = raw.boards.find(board => !removed.has(board.id));
      if (!next) {
        const created = hostValue(await args.client.createBoard('First board', lifetime.signal));
        await refresh(lifetime.signal); next = raw.boards.find(board => board.id === created.id);
      }
      const current = args.workspace.metadata.getSnapshot().id;
      if (removed.has(current) && (!next || !await args.open(next.id))) throw new Error('Save the current board before deleting it.');
      save(PendingSchema.parse({ board: item.item === 'board', id: item.id, name: item.name, ids: [...removed], current, until: Date.now() + 8000 }));
      return { undo: () => sequence(undo) };
    }),
  };
  const unsubscribe = args.workspace.events.subscribe(() => {
    const event = args.workspace.events.getSnapshot();
    if (event?.type !== 'library' && event?.type !== 'board') return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refreshTimer = null; void refresh(lifetime.signal).catch(cause => { if (!lifetime.signal.aborted) args.notify(cause instanceof Error ? cause.message : 'Could not refresh Library.'); }); }, 80);
  });
  return {
    service, pending, undo: () => sequence(undo),
    start: () => {
      try { const value: unknown = JSON.parse(args.storage.getItem(key) ?? 'null'); const parsed = PendingSchema.safeParse(value); if (parsed.success) save(parsed.data); } catch { args.storage.removeItem(key); }
      void refresh(lifetime.signal).catch(cause => { if (!lifetime.signal.aborted) args.notify(cause instanceof Error ? cause.message : 'Could not read Library.'); });
    },
    dispose: () => { lifetime.abort(); unsubscribe(); if (timer) clearTimeout(timer); if (refreshTimer) clearTimeout(refreshTimer); source.clear(); pending.clear(); },
  };
}
export type LibraryRuntime = ReturnType<typeof createLibraryService>;
