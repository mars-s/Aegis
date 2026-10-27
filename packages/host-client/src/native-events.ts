/** The browser owns SSE framing and backpressure; the caller owns reconnection. */
export function readNativeEvents(args: {
  readonly url: string;
  readonly signal: AbortSignal;
  readonly opened: () => void;
  readonly message: (data: string) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (args.signal.aborted) { resolve(); return; }
    const source = new EventSource(args.url);
    const encoder = new TextEncoder();
    const close = (): void => {
      source.close();
      source.onopen = null;
      source.onmessage = null;
      source.onerror = null;
      args.signal.removeEventListener('abort', abort);
    };
    const abort = (): void => { close(); resolve(); };
    const fail = (error: unknown): void => { close(); reject(error); };
    source.onopen = () => {
      if (args.signal.aborted) return;
      try { args.opened(); } catch (error) { fail(error); }
    };
    source.onmessage = (event: MessageEvent<unknown>) => {
      if (args.signal.aborted) return;
      try {
        if (typeof event.data !== 'string') throw new Error('Event connection returned non-text data');
        if (encoder.encode(event.data).byteLength > 2 * 1024 * 1024) throw new Error('Event stream message exceeds its byte limit');
        args.message(event.data);
      } catch (error) { fail(error); }
    };
    source.onerror = () => { fail(new Error('Event connection closed')); };
    args.signal.addEventListener('abort', abort, { once: true });
    if (args.signal.aborted) abort();
  });
}
