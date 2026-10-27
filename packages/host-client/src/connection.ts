import { Effect } from 'effect';
import type { Board } from '@aegis/domain/schema';
import { decodeStoredBoard } from '@aegis/protocol/storage';
import { decodeAssetUpload, decodeBatchResponse, decodeBoardList, decodeHostEvent, decodeHostError, decodeOkResponse } from '@aegis/protocol/http';
import type { HostClient } from './contracts.js';
import type { HostFailure, HostResult } from './result.js';
import { readEventStream } from './sse.js';

export interface HostOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetch?: typeof fetch;
}

function offline(error: unknown): HostFailure {
  return { kind: 'offline', message: error instanceof Error ? error.message : 'The local host could not be reached' };
}

/** All HTTP work is scoped, interruptible and has one attempt per user write. */
export function createHostClient(options: HostOptions): HostClient {
  const lifetime = new AbortController();
  const base = options.baseUrl.replace(/\/$/, '');
  const fetchHost = options.fetch ?? globalThis.fetch;

  function request<T>(args: {
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly decode: (value: unknown) => T;
    readonly body?: { readonly kind: 'json'; readonly value: unknown } | { readonly kind: 'file'; readonly file: File };
    readonly signal?: AbortSignal | undefined;
  }): Promise<HostResult<T>> {
    if (lifetime.signal.aborted || args.signal?.aborted) return Promise.resolve({ kind: 'error', error: { kind: 'cancelled' } });
    const operation = Effect.scoped(Effect.gen(function* () {
      const controller = yield* Effect.acquireRelease(
        Effect.sync(() => new AbortController()),
        controller => Effect.sync(() => { controller.abort(); }),
      );
      const signal = AbortSignal.any([lifetime.signal, controller.signal, ...(args.signal ? [args.signal] : [])]);
      if (signal.aborted) return yield* Effect.fail<HostFailure>({ kind: 'cancelled' });
      const response = yield* Effect.tryPromise({
        try: () => fetchHost(base + args.path, {
          method: args.method, signal,
          headers: { authorization: `Bearer ${options.token}`, 'content-type': args.body?.kind === 'file' ? args.body.file.type : 'application/json' },
          ...(args.body === undefined ? {} : { body: args.body.kind === 'file' ? args.body.file : JSON.stringify(args.body.value) }),
        }),
        catch: error => signal.aborted ? { kind: 'cancelled' } as const : offline(error),
      });
      if (signal.aborted) return yield* Effect.fail<HostFailure>({ kind: 'cancelled' });
      if (response.status === 401) return yield* Effect.fail<HostFailure>({ kind: 'unauthorised' });
      if (!response.ok) {
        const message = yield* Effect.promise(async () => {
          try {
            const value: unknown = await response.json();
            return decodeHostError(value);
          } catch { return response.statusText; }
        });
        if (signal.aborted) return yield* Effect.fail<HostFailure>({ kind: 'cancelled' });
        return yield* Effect.fail<HostFailure>({ kind: 'http', status: response.status, message });
      }
      const value: unknown = yield* Effect.tryPromise({ try: () => response.json(), catch: error => signal.aborted ? { kind: 'cancelled' } as const : { kind: 'protocol', message: String(error) } as const });
      if (signal.aborted) return yield* Effect.fail<HostFailure>({ kind: 'cancelled' });
      return yield* Effect.try({ try: () => args.decode(value), catch: error => ({ kind: 'protocol', message: error instanceof Error ? error.message : 'Invalid host response' } as const) });
    }));
    return Effect.runPromise(Effect.match(operation, {
      onSuccess: value => ({ kind: 'ok', value } as const),
      onFailure: error => ({ kind: 'error', error } as const),
    }));
  }

  return {
    boards: signal => request({ method: 'GET', path: '/boards', decode: decodeBoardList, signal }),
    board: (id, signal) => request({ method: 'GET', path: `/boards/${encodeURIComponent(id)}`, decode: decodeStoredBoard, signal }),
    createBoard: (name, signal) => request({ method: 'POST', path: '/boards', body: { kind: 'json', value: { name } }, decode: decodeStoredBoard, signal }),
    commit: (batch, signal) => request({
      method: 'POST', path: `/boards/${encodeURIComponent(batch.boardId)}/batch`,
      body: { kind: 'json', value: { commands: batch.commands } }, decode: decodeBatchResponse, signal,
    }),
    saveCamera: (id, view: Board['view'], signal) => request({
      method: 'POST', path: `/boards/${encodeURIComponent(id)}/view`, body: { kind: 'json', value: { view } },
      decode: decodeOkResponse, signal,
    }),
    events: args => {
      if (lifetime.signal.aborted || args.signal.aborted) return Promise.resolve({ kind: 'error', error: { kind: 'cancelled' } });
      const signal = AbortSignal.any([lifetime.signal, args.signal]);
      const operation = Effect.scoped(Effect.gen(function* () {
        const controller = yield* Effect.acquireRelease(
          Effect.sync(() => new AbortController()),
          controller => Effect.sync(() => { controller.abort(); }),
        );
        const eventSignal = AbortSignal.any([signal, controller.signal]);
        if (eventSignal.aborted) return yield* Effect.fail<HostFailure>({ kind: 'cancelled' });
        return yield* Effect.tryPromise({
          try: async () => {
            const response = await fetchHost(`${base}/events?token=${encodeURIComponent(options.token)}`, {
              signal: eventSignal, headers: { accept: 'text/event-stream' },
            });
            if (!response.ok) throw new Error(`Event connection failed with HTTP ${response.status}`);
            if (!response.body) throw new Error('Event connection has no body');
            args.opened();
            await readEventStream({
              body: response.body, signal: eventSignal,
              message: data => {
                const value: unknown = JSON.parse(data);
                args.event(decodeHostEvent(value), new TextEncoder().encode(data).byteLength);
              },
            });
          },
          catch: error => eventSignal.aborted ? { kind: 'cancelled' } as const : { kind: 'protocol', message: error instanceof Error ? error.message : 'Event connection failed' } as const,
        });
      }));
      return Effect.runPromise(Effect.match(operation, {
        onSuccess: () => ({ kind: 'ok', value: undefined } as const),
        onFailure: error => ({ kind: 'error', error } as const),
      }));
    },
    upload: (file, signal) => request({ method: 'POST', path: '/assets', body: { kind: 'file', file }, decode: decodeAssetUpload, signal }),
    assetUrl: url => url.startsWith('asset:') ? `${base}/assets/${encodeURIComponent(url.slice(6))}` : url,
    dispose: () => { lifetime.abort(); },
  };
}
