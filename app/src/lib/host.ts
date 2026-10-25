// The agent host: Pi Durable on 127.0.0.1. Tauri tells us its port and token; a browser passes ?port=&token=.
type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__;
export const native = !!tauri;

export type Host = {
  base: string;
  get<T = any>(path: string): Promise<T>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  events(): EventSource;
  assetUrl(url: string | undefined): string;
  upload(file: File): Promise<{ url: string; type: string; size: number }>;
  openUrl(url: string): Promise<void>;
  /** Whether the app's native commands answer from this page: 'ok', 'browser', or the error. */
  bridge(): Promise<string>;
  copy(text: string): Promise<void>;
};

async function locate(onWait: (waiting: boolean) => void): Promise<{ port: string; token: string } | null> {
  const q = new URLSearchParams(location.search);
  // The host serves the UI itself in production and passes its own port and token in the address.
  let port = q.get('port'), token = q.get('token');
  if (port && token) { sessionStorage.setItem('aegis:host', JSON.stringify({ port, token })); return { port, token }; }
  if (tauri) {
    // The first launch after an update can take a while (macOS checks the new files): wait up to two minutes.
    for (let i = 0; i < 480; i++) {
      const info = (await tauri.invoke('agent_info').catch(() => null)) as { port?: number; token?: string } | null;
      if (info?.port && info.token) { onWait(false); return { port: String(info.port), token: info.token }; }
      if (i === 8) onWait(true);
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }
  const saved = sessionStorage.getItem('aegis:host') ?? localStorage.getItem('aegis:host');
  if (saved) return JSON.parse(saved);
  return null;
}

export async function connect(onWait: (waiting: boolean) => void = () => {}): Promise<Host | null> {
  const found = await locate(onWait);
  if (!found) return null;
  localStorage.setItem('aegis:host', JSON.stringify(found));
  const { port, token } = found;
  const base = `http://127.0.0.1:${port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  };
  return {
    base,
    get: p => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    events: () => new EventSource(`${base}/events?token=${encodeURIComponent(token)}`),
    // Boards store "asset:<name>"; the host serves it on this launch's port.
    assetUrl: url => (typeof url === 'string' && url.startsWith('asset:') ? `${base}/assets/${encodeURIComponent(url.slice(6))}` : url ?? ''),
    async upload(file) {
      const r = await fetch(base + '/assets', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': file.type }, body: file });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
    },
    async openUrl(url) {
      if (tauri) await tauri.invoke('open_url', { url });
      else window.open(url, '_blank', 'noopener');
    },
    async bridge() {
      if (!tauri) return 'browser';
      try { await tauri.invoke('agent_info'); return 'ok'; } catch (e) { return String((e as Error)?.message ?? e); }
    },
    copy: text => (tauri ? tauri.invoke('copy_text', { text }).then(() => {}) : navigator.clipboard.writeText(text)),
  };
}
