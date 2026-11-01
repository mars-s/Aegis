import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v4';

const ReadySchema = z.object({ aegis: z.literal('ready'), port: z.number().int().positive() });
export async function hostFixture(options: { record?: (value: unknown) => void; prepare?: (data: string) => Promise<void>; ui?: string; extra?: Readonly<Record<string, string>> | ((data: string) => Readonly<Record<string, string>>) } = {}) {
  const data = await mkdtemp(join(tmpdir(), 'aegis-ts-host-')), cache = await mkdtemp(join(tmpdir(), 'aegis-ts-cache-')), token = randomUUID();
  let child: ChildProcessWithoutNullStreams | undefined, base = '';
  async function start(): Promise<void> {
    let diagnostics = '', output = '';
    const processHost = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
      cwd: new URL('../../agent/', import.meta.url), stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, AEGIS_PORT_OFFSET: process.env.AEGIS_PORT_OFFSET ?? '4600', AEGIS_DATA: data, AEGIS_VITE_CACHE: cache, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_CLAUDE_BIN: join(data, 'no-claude'), ...(options.ui ? { AEGIS_UI: options.ui } : {}), ...(typeof options.extra === 'function' ? options.extra(data) : options.extra) },
    });
    child = processHost;
    processHost.stderr.on('data', bytes => { diagnostics = (diagnostics + String(bytes)).slice(-8000); });
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Host did not start: ${diagnostics}`)), 10000);
      processHost.once('error', error => { clearTimeout(timer); reject(error); });
      processHost.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited ${code}: ${diagnostics}`)); });
      processHost.stdout.on('data', bytes => {
        output += String(bytes);
        let newline: number;
        while ((newline = output.indexOf('\n')) >= 0) {
          const line = output.slice(0, newline); output = output.slice(newline + 1);
          let value: unknown; try { value = JSON.parse(line); } catch { continue; }
          options.record?.(value);
          const ready = ReadySchema.safeParse(value);
          if (ready.success) { clearTimeout(timer); resolve(ready.data.port); }
        }
      });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop(): Promise<void> {
    const current = child; if (!current || current.exitCode !== null) return;
    const stopped = once(current, 'exit'); current.kill();
    const force = setTimeout(() => current.kill('SIGKILL'), 3000);
    try { await stopped; } finally { clearTimeout(force); }
  }
  async function response(path: string, value?: unknown): Promise<Response> {
    return fetch(base + path, { method: value === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}` }, ...(value === undefined ? {} : { body: JSON.stringify(value) }), signal: AbortSignal.timeout(15000) });
  }
  async function json(path: string, value?: unknown): Promise<unknown> {
    const result = await response(path, value); const decoded: unknown = await result.json();
    assert.equal(result.status, 200, JSON.stringify(decoded)); return decoded;
  }
  try { await options.prepare?.(data); await start(); }
  catch (error) { await stop(); await rm(data, { recursive: true, force: true }); await rm(cache, { recursive: true, force: true }); throw error; }
  return { data, token, get base() { return base; }, json, response, start, stop,
    async close(): Promise<void> { await stop(); await Promise.all([rm(data, { recursive: true, force: true }), rm(cache, { recursive: true, force: true })]); },
  };
}
