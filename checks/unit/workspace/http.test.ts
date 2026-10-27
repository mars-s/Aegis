import { describe, expect, it } from 'vitest';
import { AgentIdSchema, BoardIdSchema, BatchIdSchema } from '@aegis/domain';
import { createHostClient } from '@aegis/host-client';
import type { HostClient, HostResult } from '@aegis/host-client';
import { boardWith, deferred, noteId } from './helpers.js';

describe('Effect host boundary', () => {
  it('decodes every new semantic service and refuses a foreign sandbox capability', async () => {
    const signal = new AbortController().signal;
    const operations: readonly ((client: HostClient) => Promise<HostResult<unknown>>)[] = [
      client => client.agents.list(null, signal), client => client.agents.models(signal),
      client => client.agents.start({ boardId: boardWith().id, brief: 'Synthetic', selectedIds: [], model: { provider: 'fake', modelId: 'fake' }, count: 1 }, signal),
      client => client.accounts(signal), client => client.mcp(signal), client => client.library.read(signal),
      client => client.library.change({ op: 'create', kind: 'folder', parent: null }, signal),
      client => client.rewrite({ text: 'Synthetic', how: 'Shorten', title: '', around: '' }, signal),
      client => client.linkPreview('https://example.invalid', signal),
      client => client.agents.stop(AgentIdSchema.parse('synthetic-agent'), signal),
    ];
    for (const operation of operations) {
      const client = createHostClient({ baseUrl: 'http://127.0.0.1:4101', token: 'check', fetch: async () => new Response('{"invalid":true}') });
      try { expect(await operation(client)).toMatchObject({ kind: 'error', error: { kind: 'protocol' } }); }
      finally { client.dispose(); }
    }
    for (const url of ['https://other.invalid/sandbox/' + 'a'.repeat(64), 'http://127.0.0.1:4101/sandbox/not-a-capability', 'http://127.0.0.1:4101/sandbox/' + 'a'.repeat(64) + '?token=unexpected']) {
      const client = createHostClient({ baseUrl: 'http://127.0.0.1:4101', token: 'check', fetch: async () => new Response(JSON.stringify({ url })) });
      try { expect(await client.registerSandbox({ html: '', css: '', js: '', parentOrigin: 'http://127.0.0.1:4101', channel: crypto.randomUUID(), font: '', theme: '', motionOff: true }, signal)).toMatchObject({ kind: 'error', error: { kind: 'protocol' } }); }
      finally { client.dispose(); }
    }
  });

  it('does not start a host read after the client lifetime ends', async () => {
    let reads = 0;
    const client = createHostClient({ baseUrl: 'http://127.0.0.1:4101', token: 'check', fetch: async () => { reads++; return new Response('[]'); } });
    client.dispose();
    expect(await client.boards()).toEqual({ kind: 'error', error: { kind: 'cancelled' } });
    expect(reads).toBe(0);
  });

  it('reports cancellation while reading a response body as cancellation', async () => {
    const started = deferred<void>();
    const lifetime = new AbortController();
    const client = createHostClient({ baseUrl: 'http://127.0.0.1:4101', token: 'check', fetch: async (_input, init) => {
      const body = new ReadableStream<Uint8Array>({ start: stream => {
        const abort = () => stream.error(new DOMException('Aborted response', 'AbortError'));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      } });
      started.resolve();
      return new Response(body);
    } });
    try {
      const response = client.boards(lifetime.signal);
      await started.promise;
      lifetime.abort();
      expect(await response).toEqual({ kind: 'error', error: { kind: 'cancelled' } });
    } finally { client.dispose(); }
  });

  it('rejects malformed upload responses at the protocol boundary', async () => {
    for (const value of [{ url: 'https://external.example/file.csv', type: 'text/csv', size: 4 }, { url: `asset:${'a'.repeat(32)}.csv`, type: 'text/csv', size: -1 }]) {
      const client = createHostClient({ baseUrl: 'http://127.0.0.1:4101', token: 'check', fetch: async () => new Response(JSON.stringify(value)) });
      try { expect(await client.upload(new File(['a,b'], 'check.csv', { type: 'text/csv' }))).toMatchObject({ kind: 'error', error: { kind: 'protocol' } }); }
      finally { client.dispose(); }
    }
  });

  it('uses real legacy routes and validates JSON at the boundary', async () => {
    const requests: { readonly url: string; readonly init: RequestInit | undefined }[] = [];
    const board = boardWith();
    const client = createHostClient({
      baseUrl: 'http://127.0.0.1:8950/', token: 'synthetic-test-token',
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(JSON.stringify(board), { status: 200 });
      },
    });
    try {
      expect(await client.board(board.id)).toMatchObject({ kind: 'ok', value: board });
      expect(requests[0]?.url).toBe(`http://127.0.0.1:8950/boards/${board.id}`);
      expect(requests[0]?.init?.headers).toEqual({ authorization: 'Bearer synthetic-test-token', 'content-type': 'application/json' });
      expect(requests[0]?.init?.signal?.aborted).toBe(true);
    } finally { client.dispose(); }
  });

  it('returns protocol errors for malformed board data', async () => {
    const client = createHostClient({ baseUrl: 'http://127.0.0.1:8950', token: 'check', fetch: async () => new Response('{"id":3}') });
    try { expect(await client.board(BoardIdSchema.parse('boardaa'))).toMatchObject({ kind: 'error', error: { kind: 'protocol' } }); }
    finally { client.dispose(); }
  });

  it('makes one POST attempt on a network failure and exposes the failure', async () => {
    let attempts = 0;
    const client = createHostClient({
      baseUrl: 'http://127.0.0.1:8950', token: 'check',
      fetch: async () => { attempts++; throw new Error('connection lost'); },
    });
    try {
      const result = await client.commit({ id: BatchIdSchema.parse('synthetic-batch'), boardId: boardWith().id, commands: [{ op: 'create', newId: noteId }] });
      expect(result).toMatchObject({ kind: 'error', error: { kind: 'offline', message: 'connection lost' } });
      expect(attempts).toBe(1);
    } finally { client.dispose(); }
  });

  it('maps an unauthorised response and cancels in-flight requests on disposal', async () => {
    const denied = createHostClient({ baseUrl: 'http://127.0.0.1:8950', token: 'bad', fetch: async () => new Response('{}', { status: 401 }) });
    try { expect(await denied.boards()).toEqual({ kind: 'error', error: { kind: 'unauthorised' } }); }
    finally { denied.dispose(); }
    const pending = createHostClient({
      baseUrl: 'http://127.0.0.1:8950', token: 'check',
      fetch: (_input, init) => new Promise<Response>((_resolve, reject) => {
        const abort = () => { reject(new Error('aborted')); };
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      }),
    });
    const response = pending.boards();
    pending.dispose();
    expect(await response).toEqual({ kind: 'error', error: { kind: 'cancelled' } });
  });
  it('preserves the real host error reason when a save returns an HTTP failure', async () => {
    const client = createHostClient({
      baseUrl: 'http://127.0.0.1:8950', token: 'check',
      fetch: async () => new Response(JSON.stringify({ error: 'No space left on the test device' }), { status: 507 }),
    });
    try {
      expect(await client.commit({ id: BatchIdSchema.parse('failure-check'), boardId: boardWith().id, commands: [{ op: 'create', newId: noteId }] })).toEqual({
        kind: 'error', error: { kind: 'http', status: 507, message: 'No space left on the test device' },
      });
    } finally { client.dispose(); }
  });

});
