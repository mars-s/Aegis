/** Parses the legacy unnamed SSE messages, including split UTF-8 and CRLF. */
export async function readEventStream(args: {
  readonly body: ReadableStream<Uint8Array>;
  readonly signal: AbortSignal;
  readonly message: (data: string) => void;
  readonly maxMessageBytes?: number;
}): Promise<void> {
  const reader = args.body.getReader();
  const decoder = new TextDecoder();
  const limit = args.maxMessageBytes ?? 2 * 1024 * 1024;
  let line = '';
  let data: string[] = [];
  let bytes = 0;
  let afterCarriageReturn = false;
  const abort = (): void => { void reader.cancel().catch(() => {}); };
  const finishLine = (): void => {
    if (line === '') {
      if (data.length > 0) args.message(data.join('\n'));
      data = [];
      bytes = 0;
    } else if (line === 'data' || line.startsWith('data:')) {
      const value = line === 'data' ? '' : line.slice(line[5] === ' ' ? 6 : 5);
      data.push(value);
    }
    line = '';
  };
  args.signal.addEventListener('abort', abort, { once: true });
  try {
    if (args.signal.aborted) return;
    while (!args.signal.aborted) {
      const part = await reader.read();
      if (part.done) return;
      for (const character of decoder.decode(part.value, { stream: true })) {
        if (afterCarriageReturn && character === '\n') {
          afterCarriageReturn = false;
          continue;
        }
        afterCarriageReturn = character === '\r';
        if (character === '\n' || character === '\r') finishLine();
        else {
          const point = character.codePointAt(0) ?? 0;
          bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
          if (bytes > limit) throw new Error('Event stream message exceeds its byte limit');
          line += character;
        }
      }
    }
  } finally {
    args.signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
