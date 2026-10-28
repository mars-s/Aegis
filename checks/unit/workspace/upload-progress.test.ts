import { afterEach, describe, expect, it } from 'vitest';
import { createHostClient } from '@aegis/host-client';

// Ported from checks/host/media.test.ts ("recording uploads report measured progress and wait for host confirmation"),
// now against the React host client's XMLHttpRequest upload path.
interface ProgressLike { readonly lengthComputable: boolean; readonly loaded: number; readonly total: number }
class RecordingRequest {
  static all: RecordingRequest[] = [];
  upload: { onprogress?: (event: ProgressLike) => void } = {};
  headers: Record<string, string> = {};
  method = ''; url = ''; body: unknown; status = 0; statusText = ''; responseText = '';
  onload?: () => void; onerror?: () => void; onabort?: () => void;
  constructor() { RecordingRequest.all.push(this); }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send(body: unknown) { this.body = body; }
  abort() { this.onabort?.(); }
}
const original = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
afterEach(() => {
  RecordingRequest.all = [];
  if (original === undefined) Reflect.deleteProperty(globalThis, 'XMLHttpRequest'); else Object.defineProperty(globalThis, 'XMLHttpRequest', original);
});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('recorded media upload', () => {
  it('reports measured progress and waits for host confirmation', async () => {
    Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: RecordingRequest });
    const client = createHostClient({ baseUrl: 'http://127.0.0.1:12345', token: 'test-only-token' });
    try {
      const file = new File(['recorded bytes'], 'clip.webm', { type: 'video/webm' });
      const progress: number[] = [];
      let complete = false;
      const saving = client.upload(file, undefined, value => { progress.push(value); }).then(value => { complete = true; return value; });
      await settle();
      const request = RecordingRequest.all[0];
      if (!request) throw new Error('No upload request was sent');
      expect(request.method).toBe('POST'); expect(request.url).toBe('http://127.0.0.1:12345/assets'); expect(request.body).toBe(file);
      expect(request.headers.authorization).toBe('Bearer test-only-token');
      request.upload.onprogress?.({ lengthComputable: true, loaded: 42, total: 100 });
      request.upload.onprogress?.({ lengthComputable: false, loaded: 1, total: 0 });
      request.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
      await settle(); expect(complete).toBe(false); expect(progress).toEqual([0, 42, 100]);
      const url = `asset:${'a'.repeat(32)}.webm`;
      request.status = 200; request.responseText = JSON.stringify({ url, type: 'video/webm', size: 14 }); request.onload?.();
      expect(await saving).toEqual({ kind: 'ok', value: { url, type: 'video/webm', size: 14 } }); expect(complete).toBe(true);
      expect(progress.at(-1)).toBe(100);

      const failed = client.upload(file, undefined, () => {});
      await settle();
      const failedRequest = RecordingRequest.all[1];
      if (!failedRequest) throw new Error('No second upload request was sent');
      failedRequest.status = 500; failedRequest.responseText = JSON.stringify({ error: 'Disk full' }); failedRequest.onload?.();
      expect(await failed).toMatchObject({ kind: 'error', error: { kind: 'http', status: 500, message: 'Disk full' } });

      const cancel = new AbortController();
      const cancelled = client.upload(file, cancel.signal, () => {});
      await settle(); cancel.abort();
      expect(await cancelled).toEqual({ kind: 'error', error: { kind: 'cancelled' } });
    } finally { client.dispose(); }
  });
});
