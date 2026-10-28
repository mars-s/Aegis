import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { hostFixture } from './fixture.ts';

test('an interrupted upload removes its temporary file and leaves the host responsive', async () => {
  const host = await hostFixture();
  const address = new URL(host.base), socket = net.createConnection(Number(address.port), address.hostname);
  socket.on('error', () => {});
  try {
    await once(socket, 'connect');
    socket.write(`POST /assets HTTP/1.1\r\nHost: ${address.host}\r\nAuthorization: Bearer ${host.token}\r\nContent-Type: audio/webm\r\nContent-Length: 1000\r\n\r\npartial recording`);
    const assets = join(host.data, 'assets');
    let appeared = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await readdir(assets)).some(name => name.endsWith('.tmp'))) { appeared = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(appeared, true, 'the real upload must start before interrupting it');
    socket.destroy();
    for (let attempt = 0; attempt < 100 && (await readdir(assets)).length; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(await readdir(assets), []);
    assert.equal((await host.response('/health')).status, 200);
  } finally { socket.destroy(); await host.close(); }
});
