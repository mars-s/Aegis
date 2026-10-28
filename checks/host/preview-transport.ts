import http from 'node:http';
import type { IncomingMessage, IncomingHttpHeaders, RequestOptions } from 'node:http';
import { Duplex } from 'node:stream';

type ResponseListener = (response: IncomingMessage) => void;
type FixtureResponse = { status?: number; headers?: IncomingHttpHeaders; chunks?: Buffer[] };

// Use Node's real request and response streams with an in-memory HTTP socket.
// No DNS or network connection can escape this fixture.
export function transport(response: (url: URL, options: RequestOptions) => FixtureResponse): typeof http.request {
  return (input: string | URL | RequestOptions, optionsOrCallback?: RequestOptions | ResponseListener, callback?: ResponseListener) => {
    const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : 'http://fixture.invalid');
    const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : typeof input === 'object' && !(input instanceof URL) ? input : {};
    const listener = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
    const data = response(url, options), chunks = data.chunks ?? [Buffer.from('<title>Safe page</title>')];
    const headers = { 'content-length': String(chunks.reduce((size, chunk) => size + chunk.length, 0)), connection: 'close', ...(data.headers ?? { 'content-type': 'text/html' }) };
    let sent = false;
    const socket = new Duplex({
      read() {},
      write(_chunk, _encoding, done) {
        done();
        if (sent) return;
        sent = true;
        queueMicrotask(() => {
          socket.push(`HTTP/1.1 ${data.status ?? 200} Fixture\r\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join('\r\n')}\r\n\r\n`);
          for (const chunk of chunks) socket.push(chunk);
          socket.push(null);
        });
      },
    });
    const { agent: _agent, ...connectionOptions } = options;
    return http.request('http://fixture.invalid', { ...connectionOptions, createConnection: () => socket }, listener);
  };
}
