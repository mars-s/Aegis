import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod/v4';

const TranscriptSchema = z.object({
  seq: z.number(),
  text: z.string(),
  done: z.boolean(),
  error: z.string().nullable(),
});

type Invoke = (command: string, args?: unknown) => Promise<unknown>;

function bridge(): Invoke | null {
  const native = window.__TAURI_INTERNALS__;
  return typeof native?.invoke === 'function' ? native.invoke.bind(native) : null;
}

function notify(message: string): void {
  dispatchEvent(new CustomEvent('aegis:notice', { detail: message }));
}

/**
 * Apple's on-device recogniser, started from the orb. The shell keeps the latest
 * transcript; this polls it and pushes each new line into the ask box.
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const timer = useRef<number | null>(null);
  const since = useRef(0);
  const latest = useRef(onText);
  latest.current = onText;

  const clear = (): void => {
    if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; }
  };

  const stop = useCallback(async (): Promise<void> => {
    clear();
    setListening(false);
    setStarting(false);
    await bridge()?.('speech', { action: 'stop' }).catch(() => undefined);
  }, []);

  const start = useCallback(async (): Promise<void> => {
    const invoke = bridge();
    if (!invoke) { notify('Dictation needs the desktop app.'); return; }
    if (listening) { await stop(); return; }
    setStarting(true);
    since.current = 0;
    try {
      await invoke('speech', { action: 'start' });
    } catch (error) {
      setStarting(false);
      notify(error instanceof Error ? error.message : String(error));
      return;
    }
    setStarting(false);
    setListening(true);
    timer.current = window.setInterval(async () => {
      let raw: unknown = null;
      try { raw = await invoke('speech_poll'); } catch { return; }
      const next = TranscriptSchema.safeParse(raw);
      if (!next.success || next.data.seq === since.current) return;
      since.current = next.data.seq;
      if (next.data.error) { notify(next.data.error); void stop(); return; }
      if (next.data.text) latest.current(next.data.text);
      if (next.data.done) void stop();
    }, 120);
  }, [listening, stop]);

  useEffect(() => () => { clear(); void bridge()?.('speech', { action: 'stop' }).catch(() => undefined); }, []);

  return { listening: listening || starting, start, stop };
}
