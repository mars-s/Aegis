import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { reserveHostPort } from './ports.ts';
import net from 'node:net';
import { createLifetime } from '../../agent/dist/lifetime.js';
import { createEvents } from '../../agent/dist/events.js';

test('closing the host interrupts run waits and releases each resource once', async () => {
  const lifetime = createLifetime();
  let released = 0, aborted = false;
  lifetime.add(() => { released++; });
  let markStarted: () => void = () => assert.fail('Run was not initialised');
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const pending = lifetime.run(signal => new Promise<void>(resolve => {
    signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
    markStarted();
  }));
  const settled = pending.catch(() => {});
  await started;
  await Promise.all([lifetime.close(), lifetime.close()]);
  await settled;
  assert.equal(aborted, true);
  assert.equal(released, 1);
});

test('an SSE disconnect releases its connection and ping lifetime', async () => {
  const lifetime = createLifetime(), events = createEvents(lifetime);
  const server = http.createServer((request, response) => events.connect(request, response));
  const lease = await reserveHostPort();
  server.listen(lease.port, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/events`);
    assert.equal(events.size(), 1);
    assert.ok(response.body); await response.body.cancel();
    for (let attempt = 0; attempt < 50 && events.size(); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(events.size(), 0);
  } finally { await lifetime.close(); server.closeAllConnections(); const closed = once(server, 'close'); server.close(); await closed; await lease.release(); }
});

test('a stalled SSE consumer is disconnected while the host keeps accepting requests', async () => {
  const lifetime = createLifetime(), events = createEvents(lifetime);
  const server = http.createServer((request, response) => {
    if (request.url === '/events') events.connect(request, response);
    else { response.writeHead(200); response.end('ready'); }
  });
  const lease = await reserveHostPort();
  server.listen(lease.port, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const client = net.createConnection(address.port, '127.0.0.1');
  client.on('error', () => {});
  try {
    await once(client, 'connect'); client.pause();
    client.write(`GET /events HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\n\r\n`);
    for (let attempt = 0; attempt < 50 && events.size() === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(events.size(), 1);
    for (let index = 0; index < 10000 && events.size(); index++) events.broadcast({ type: 'agent', partial: 'x'.repeat(2048) });
    assert.equal(events.size(), 0);
    assert.equal(await (await fetch(`http://127.0.0.1:${address.port}/health`)).text(), 'ready');
  } finally { client.destroy(); await lifetime.close(); server.closeAllConnections(); const closed = once(server, 'close'); server.close(); await closed; await lease.release(); }
});
