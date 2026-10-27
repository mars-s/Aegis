import { z } from "zod/v4";

const ConnectionSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535),
  token: z.string().min(1).max(512),
});

export interface NativeBridge {
  readonly invoke: (command: string, args?: unknown, options?: { readonly headers: Readonly<Record<string, string>> }) => Promise<unknown>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: NativeBridge;
  }
}

export interface Connection {
  readonly base: string;
  readonly token: string;
  readonly native: boolean;
}

function decode(value: unknown): Connection | null {
  const parsed = ConnectionSchema.safeParse(value);
  if (!parsed.success) return null;
  return { base: `http://127.0.0.1:${parsed.data.port}`, token: parsed.data.token, native: window.__TAURI_INTERNALS__ !== undefined };
}

export async function locateConnection(signal: AbortSignal): Promise<Connection | null> {
  const query = new URLSearchParams(location.search);
  const supplied = decode({ port: query.get("port"), token: query.get("token") });
  if (supplied) return supplied;
  const native = window.__TAURI_INTERNALS__;
  if (native) {
    for (let attempt = 0; attempt < 480 && !signal.aborted; attempt++) {
      const info = await native.invoke("agent_info").catch(() => null);
      if (signal.aborted) return null;
      const found = decode(info);
      if (found) return found;
      await new Promise<void>(done => {
        const finish = (): void => {
          clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          done();
        };
        const timer = setTimeout(finish, 250);
        signal.addEventListener("abort", finish, { once: true });
      });
    }
    return null;
  }
  const stored = sessionStorage.getItem("aegis:host") ?? localStorage.getItem("aegis:host");
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    return decode(value);
  } catch {
    return null;
  }
}
