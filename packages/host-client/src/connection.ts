import { Effect } from 'effect';
import type { Board } from '@aegis/domain/schema';
import { decodeStoredBoard } from '@aegis/protocol/storage';
import { decodeAssetUpload, decodeBatchResponse, decodeBoardList, decodeHostEvent, decodeHostError, decodeOkResponse } from '@aegis/protocol/http';
import { AgentModelSchema, AgentReceiptSchema, AgentSnapshotSchema } from '@aegis/protocol/agents';
import { AccountsSchema, LibraryResultSchema, LibrarySnapshotSchema, LinkPreviewSchema, McpSetupSchema, RewriteResponseSchema, decodeSandbox } from '@aegis/protocol/services';
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

  function uploadFile(file: File, signal: AbortSignal, progress: (percent: number) => void): Promise<Response> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const cancel = (): void => { xhr.abort(); };
      const cleanup = (): void => { signal.removeEventListener('abort', cancel); };
      xhr.open('POST', base + '/assets');
      xhr.setRequestHeader('authorization', `Bearer ${options.token}`);
      xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.max(0, Math.min(100, event.loaded / event.total * 100))); };
      xhr.onerror = () => { cleanup(); reject(new Error('The local host could not receive this file.')); };
      xhr.onabort = () => { cleanup(); reject(new Error('Upload cancelled.')); };
      xhr.onload = () => { cleanup(); resolve(new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText })); };
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) { cleanup(); reject(new Error('Upload cancelled.')); return; }
      xhr.send(file);
    });
  }

  function request<T>(args: {
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly decode: (value: unknown) => T;
    readonly body?: { readonly kind: 'json'; readonly value: unknown } | { readonly kind: 'file'; readonly file: File };
    readonly signal?: AbortSignal | undefined;
    readonly progress?: ((percent: number) => void) | undefined;
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
        try: () => args.body?.kind === 'file' && args.progress && typeof XMLHttpRequest !== 'undefined' && !options.fetch ? uploadFile(args.body.file, signal, args.progress) : fetchHost(base + args.path, {
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
    agents: {
      list: (boardId, signal) => request({ method: 'GET', path: boardId ? `/agents?board=${encodeURIComponent(boardId)}` : '/agents', decode: value => AgentSnapshotSchema.array().parse(value), signal }),
      models: signal => request({ method: 'GET', path: '/models', decode: value => AgentModelSchema.array().parse(value), signal }),
      connected: async (provider, signal) => {
        if (provider === 'fake') return request({ method: 'GET', path: '/models', decode: value => AgentModelSchema.array().parse(value).some(model => model.provider === provider), signal });
        const result = await request({ method: 'GET', path: '/auth', decode: value => AccountsSchema.parse(value), signal });
        return result.kind === 'error' ? result : { kind: 'ok', value: result.value.some(account => account.provider === provider && account.connected) };
      },
      start: (input, signal) => request({ method: 'POST', path: '/agents', body: { kind: 'json', value: input }, decode: value => AgentReceiptSchema.array().parse(value), signal }),
      message: (id, content, selectedIds, signal) => request({ method: 'POST', path: `/agents/${encodeURIComponent(id)}/message`, body: { kind: 'json', value: { content, selectedIds } }, decode: decodeOkResponse, signal }),
      stop: (id, signal) => request({ method: 'POST', path: `/agents/${encodeURIComponent(id)}/stop`, body: { kind: 'json', value: {} }, decode: decodeOkResponse, signal }),
      undoRequest: (id, requestId, signal) => request({ method: 'POST', path: `/agents/${encodeURIComponent(id)}/history/${encodeURIComponent(requestId)}/undo`, body: { kind: 'json', value: {} }, decode: decodeOkResponse, signal }),
    },
    accounts: signal => request({ method: 'GET', path: '/auth', decode: value => AccountsSchema.parse(value), signal }),
    authenticate: (provider, action, signal) => request({ method: 'POST', path: `/auth/${action}`, body: { kind: 'json', value: { provider } }, decode: value => AccountsSchema.parse(value), signal }),
    answer: (provider, answer, signal) => request({ method: 'POST', path: '/auth/answer', body: { kind: 'json', value: { provider, answer } }, decode: decodeOkResponse, signal }),
    mcp: signal => request({ method: 'GET', path: '/integrations/mcp', decode: value => McpSetupSchema.parse(value), signal }),
    rewrite: (input, signal) => request({ method: 'POST', path: '/rewrite', body: { kind: 'json', value: input }, decode: value => RewriteResponseSchema.parse(value), signal }),
    linkPreview: (url, signal) => request({ method: 'GET', path: `/link-preview?url=${encodeURIComponent(url)}`, decode: value => LinkPreviewSchema.parse(value), signal }),
    registerSandbox: (input, signal) => request({ method: 'POST', path: '/sandbox', body: { kind: 'json', value: input }, decode: value => decodeSandbox(value, base), signal }),
    library: {
      read: signal => request({ method: 'GET', path: '/library', decode: value => LibrarySnapshotSchema.parse(value), signal }),
      change: (change, signal) => request({ method: 'POST', path: '/library', body: { kind: 'json', value: change }, decode: value => LibraryResultSchema.parse(value), signal }),
      createBoard: (name, parent, signal) => request({ method: 'POST', path: '/boards', body: { kind: 'json', value: { name, parent } }, decode: decodeStoredBoard, signal }),
      renameBoard: (id, name, signal) => request({ method: 'POST', path: `/boards/${encodeURIComponent(id)}/name`, body: { kind: 'json', value: { name } }, decode: decodeOkResponse, signal }),
      duplicate: (id, signal) => request({ method: 'POST', path: '/library/duplicate', body: { kind: 'json', value: { id } }, decode: value => LibraryResultSchema.parse(value), signal }),
      removeBoard: (id, signal) => request({ method: 'POST', path: `/boards/${encodeURIComponent(id)}/delete`, body: { kind: 'json', value: {} }, decode: value => LibraryResultSchema.parse(value), signal }),
    },
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
    upload: async (file, signal, progress) => { progress?.(0); const result = await request({ method: 'POST', path: '/assets', body: { kind: 'file', file }, decode: decodeAssetUpload, signal, progress }); if (result.kind === 'ok') progress?.(100); return result; },
    assetUrl: url => url.startsWith('asset:') ? `${base}/assets/${encodeURIComponent(url.slice(6))}` : url,
    dispose: () => { lifetime.abort(); },
  };
}
