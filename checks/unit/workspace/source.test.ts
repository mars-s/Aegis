import { describe, expect, it } from 'vitest';
import { createSource } from '../../../app/src/workspace/source.js';
import { readEventStream } from '../../../packages/host-client/src/sse.js';

function bytes(parts: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

describe('workspace sources and event framing', () => {
  it('retains snapshot identity and only notifies for changes', () => {
    const first = { text: 'hello' };
    const source = createSource(first);
    let changes = 0;
    const unsubscribe = source.subscribe(() => { changes++; });
    source.set(first);
    expect(source.getSnapshot()).toBe(first);
    expect(changes).toBe(0);
    source.set({ text: 'changed' });
    expect(changes).toBe(1);
    unsubscribe();
    source.set(first);
    expect(changes).toBe(1);
  });

  it('reads split SSE lines, multiline data and CRLF without replaying comments', async () => {
    const messages: string[] = [];
    await readEventStream({
      body: bytes([': hi\r', '\ndata: one\r\n', 'data: two\r', '\n\r\ndata: three\n\n: ping\n\n']),
      signal: new AbortController().signal,
      message: data => { messages.push(data); },
    });
    expect(messages).toEqual(['one\ntwo', 'three']);
  });

  it('decodes a UTF-8 character split between byte chunks', async () => {
    const encoded = new TextEncoder().encode('data: café\n\n');
    const messages: string[] = [];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    await readEventStream({ body, signal: new AbortController().signal, message: data => { messages.push(data); } });
    expect(messages).toEqual(['café']);
  });

  it('closes a reader on cancellation and rejects an oversized message', async () => {
    let cancelled = false;
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const reading = readEventStream({ body, signal: controller.signal, message: () => {} });
    controller.abort();
    await reading;
    expect(cancelled).toBe(true);
    await expect(readEventStream({
      body: bytes(['data: too much\n\n']), signal: new AbortController().signal,
      message: () => {}, maxMessageBytes: 10,
    })).rejects.toThrow('byte limit');
  });
});
