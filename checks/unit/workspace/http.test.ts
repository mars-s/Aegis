import { describe, expect, it } from 'vitest';
import { BoardIdSchema, BatchIdSchema } from '@aegis/domain';
import { createHostClient } from '@aegis/host-client';
import { boardWith, noteId } from './helpers.js';

describe('Effect host boundary', () => {
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
