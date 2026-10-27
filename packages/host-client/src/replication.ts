import { Effect } from 'effect';
import type { HostEvent } from '@aegis/protocol/http';
import type { HostClient, ReplicationPort } from './contracts.js';
import type { HostFailure } from './result.js';

export interface WorkspaceConnection {
  readonly settled: () => Promise<void>;
  readonly resynchronise: () => void;
  readonly dispose: () => void;
}

export interface ConnectionOptions {
  readonly client: HostClient;
  readonly workspace: { readonly replication: ReplicationPort };
  readonly onError?: (error: HostFailure) => void;
  readonly reconnectMs?: number;
  readonly maxQueuedEvents?: number;
  readonly maxQueuedBytes?: number;
}

/** Plain bootstrap adapter. Effect owns delays; the app sees callbacks and promises. */
export function connectWorkspace(options: ConnectionOptions): WorkspaceConnection {
  const port = options.workspace.replication;
  const lifetime = new AbortController();
  const reconnectMs = options.reconnectMs ?? 1500;
  let boardLifetime = new AbortController();
  let subscription = new AbortController();
  let epoch = port.state.getSnapshot().epoch;
  let events: { readonly event: HostEvent; readonly bytes: number }[] = [];
  let queuedBytes = 0;
  let snapshotVersion = 1;
  let reconciledVersion = 0;
  let minimumRevision = port.state.getSnapshot().confirmedRevision;
  let running: Promise<void> | null = null;
  let scheduled = false;
  let disposed = false;
  let waiters: (() => void)[] = [];

  function isCurrent(expected: number): boolean {
    return !disposed && expected === port.state.getSnapshot().epoch;
  }

  async function delay(signal: AbortSignal): Promise<void> {
    await Effect.runPromise(Effect.sleep(reconnectMs), { signal }).catch(() => {});
  }

  function publishIdle(): void {
    const ready = waiters;
    waiters = [];
    for (const resolve of ready) resolve();
  }

  function requestSnapshot(revision = minimumRevision): void {
    snapshotVersion++;
    minimumRevision = Math.max(minimumRevision, revision);
    schedule();
  }

  function schedule(): void {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (disposed || running) return;
      running = drain().finally(() => {
        running = null;
        const state = port.state.getSnapshot();
        if (!disposed && (snapshotVersion !== reconciledVersion || events.length || (!state.blocked && state.pending.length))) schedule();
        else publishIdle();
      });
    });
  }

  async function drain(): Promise<void> {
    while (!disposed) {
      const current = port.state.getSnapshot();
      const expected = current.epoch;
      const signal = AbortSignal.any([lifetime.signal, boardLifetime.signal]);
      if (snapshotVersion !== reconciledVersion) {
        const version = snapshotVersion;
        const loaded = await options.client.board(current.boardId, signal);
        if (!isCurrent(expected)) return;
        if (loaded.kind === 'error') {
          if (loaded.error.kind === 'cancelled') return;
          options.onError?.(loaded.error);
          await delay(signal);
          continue;
        }
        if (loaded.value.id !== current.boardId || loaded.value.rev < Math.max(minimumRevision, port.state.getSnapshot().confirmedRevision)) {
          options.onError?.({ kind: 'protocol', message: 'The host snapshot has not reached the confirmed board revision' });
          await delay(signal);
          continue;
        }
        port.reconcile(expected, loaded.value);
        reconciledVersion = version;
        continue;
      }
      const entry = current.pending[0];
      if (entry && !current.blocked) {
        const saved = await options.client.commit(entry, signal);
        if (!isCurrent(expected)) return;
        if (saved.kind === 'error') {
          port.failed(expected, entry.id, saved.error);
          options.onError?.(saved.error);
          continue;
        }
        port.acknowledge(expected, entry.id, saved.value);
        if (saved.value.ok) requestSnapshot(saved.value.rev);
        continue;
      }
      const queued = events[0];
      if (!queued) return;
      const result = port.accept(expected, queued.event);
      if (result === 'gap') {
        requestSnapshot(queued.event.type === 'board' ? queued.event.rev : minimumRevision);
      } else {
        events.shift();
        queuedBytes -= queued.bytes;
      }
    }
  }

  const unsubscribe = port.state.subscribe(() => {
    const current = port.state.getSnapshot();
    if (epoch !== current.epoch) {
      epoch = current.epoch;
      boardLifetime.abort();
      boardLifetime = new AbortController();
      events = [];
      queuedBytes = 0;
      minimumRevision = current.confirmedRevision;
      snapshotVersion++;
    }
    if (current.closed) dispose();
    else schedule();
  });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    boardLifetime.abort();
    subscription.abort();
    unsubscribe();
    events = [];
    queuedBytes = 0;
    publishIdle();
  }

  async function listen(): Promise<void> {
    while (!disposed) {
      const stream = new AbortController();
      subscription = stream;
      await options.client.events({
        signal: AbortSignal.any([lifetime.signal, stream.signal]),
        opened: () => { if (!disposed && !stream.signal.aborted) requestSnapshot(); },
        event: (event, bytes) => {
          if (disposed || stream.signal.aborted) return;
          if (event.type !== 'board') {
            port.accept(epoch, event);
            return;
          }
          if (event.boardId !== port.state.getSnapshot().boardId) return;
          if (events.length >= (options.maxQueuedEvents ?? 256) || queuedBytes + bytes > (options.maxQueuedBytes ?? 4 * 1024 * 1024)) {
            const latest = Math.max(event.rev, ...events.flatMap(queued => queued.event.type === 'board' ? [queued.event.rev] : []));
            events = [];
            queuedBytes = 0;
            stream.abort();
            requestSnapshot(latest);
          } else {
            events.push({ event, bytes });
            queuedBytes += bytes;
            schedule();
          }
        },
      }).then(result => {
        if (!disposed && !stream.signal.aborted && result.kind === 'error' && result.error.kind !== 'cancelled') options.onError?.(result.error);
      });
      if (disposed) return;
      requestSnapshot();
      await delay(lifetime.signal);
    }
  }

  if (port.state.getSnapshot().closed) dispose();
  else {
    schedule();
    const scope = Effect.scoped(Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sync(dispose));
      yield* Effect.promise(() => listen());
    }));
    void Effect.runPromise(scope).catch(error => {
      if (!disposed) options.onError?.({ kind: 'protocol', message: error instanceof Error ? error.message : 'The connection scope failed' });
    });
  }
  return {
    settled: () => {
      if (disposed || (!running && !scheduled && snapshotVersion === reconciledVersion && !events.length)) return Promise.resolve();
      return new Promise(resolve => { waiters.push(resolve); });
    },
    resynchronise: () => { requestSnapshot(); },
    dispose,
  };
}
