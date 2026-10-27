import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HostLifetime } from './lifetime.js';

/** Slow subscribers reconnect from a board snapshot instead of retaining unbounded output. */
export function createEvents(lifetime: HostLifetime) {
  const clients = new Set<ServerResponse>();
  function broadcast(event: unknown): void {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const response of clients) {
      if (response.destroyed || response.writableLength + Buffer.byteLength(line) > 1024 * 1024) { clients.delete(response); response.destroy(); }
      else response.write(line);
    }
  }
  function connect(request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    response.write(': hi\n\n'); clients.add(response);
    const work = lifetime.run(signal => new Promise<void>(resolve => {
      const ping = setInterval(() => {
        if (response.writableLength > 1024 * 1024) response.destroy();
        else response.write(': ping\n\n');
      }, 20000);
      ping.unref();
      const close = () => {
        clearInterval(ping); clients.delete(response);
        request.off('close', close); response.off('close', close); signal.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => { response.destroy(); close(); };
      request.once('close', close); response.once('close', close); signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted || response.destroyed) abort();
    }));
    void work.catch(() => { clients.delete(response); response.destroy(); });
  }
  lifetime.add(() => { for (const client of clients) client.destroy(); clients.clear(); });
  return { broadcast, connect, size: () => clients.size };
}
