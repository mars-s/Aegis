import { mkdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Test processes share this run's disposable cache. Atomic directories reserve
// listeners without a race between probing a socket and starting the real host.
export async function reserveHostPort(): Promise<{ readonly port: number; readonly release: () => Promise<void> }> {
  const directory = join(process.env.AEGIS_VITE_CACHE ?? tmpdir(), 'aegis-host-listeners');
  await mkdir(directory, { recursive: true });
  const deadline = Date.now() + 30000;
  do {
    // The two real-scene browser fixtures use 4940 and 4941.
    for (let port = 4942; port <= 4959; port++) {
      const lock = join(directory, String(port));
      try { await mkdir(lock); }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EEXIST') continue;
        throw error;
      }
      let held = true;
      return { port, async release() { if (!held) return; held = false; await rmdir(lock); } };
    }
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  throw new Error('The assigned host listener block 4940-4959 is full');
}
