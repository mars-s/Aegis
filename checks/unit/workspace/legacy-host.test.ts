import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';
import { expect, it } from 'vitest';
import { BatchIdSchema } from '@aegis/domain';
import { connectWorkspace, createHostClient } from '@aegis/host-client';
import { createWorkspace } from '../../../app/src/workspace/store.js';
import { noteId, otherId } from './helpers.js';

const ReadySchema = z.object({ aegis: z.literal('ready'), port: z.number().int().positive() });

it('saves, reloads, receives SSE and persists camera against the untouched legacy host', async () => {
  const data = await mkdtemp(join(tmpdir(), 'aegis-workspace-host-'));
  const cache = await mkdtemp(join(tmpdir(), 'aegis-workspace-vite-'));
  const token = `workspace-synthetic-${process.pid}`;
  const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
    cwd: fileURLToPath(new URL('../../../agent/', import.meta.url)),
    env: { ...process.env, AEGIS_DATA: data, AEGIS_VITE_CACHE: cache, AEGIS_PORT_OFFSET: process.env.AEGIS_PORT_OFFSET ?? '4100', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  host.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-10000); });
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const port = await new Promise<number>((resolve, reject) => {
      let buffer = '';
      readyTimer = setTimeout(() => { reject(new Error(`Host did not start: ${stderr}`)); }, 15000);
      host.once('exit', code => { reject(new Error(`Host exited ${code}: ${stderr}`)); });
      host.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        let end = buffer.indexOf('\n');
        while (end !== -1) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (line.startsWith('{')) {
            const value: unknown = JSON.parse(line);
            const decoded = ReadySchema.safeParse(value);
            if (decoded.success) { clearTimeout(readyTimer); resolve(decoded.data.port); }
          }
          end = buffer.indexOf('\n');
        }
      });
    });
    const client = createHostClient({ baseUrl: `http://127.0.0.1:${port}`, token });
    try {
      expect(await client.boards()).toEqual({ kind: 'ok', value: [] });
      const created = await client.createBoard('Real host workspace');
      if (created.kind !== 'ok') throw new Error(JSON.stringify(created.error));
      const workspace = createWorkspace({ board: created.value });
      const connection = connectWorkspace({ client, workspace });
      try {
        await connection.settled();
        const local = workspace.submit([
          { op: 'create', newId: noteId, type: 'note', text: 'Saved through Effect', ref: 'note' },
          { op: 'create', newId: otherId, type: 'title', text: 'Real HTTP', ref: 'title' },
        ]);
        expect(local).toMatchObject({ kind: 'applied', created: { note: noteId, title: otherId } });
        await connection.settled();
        expect(workspace.saving.getSnapshot().kind).toBe('saved');
        const reloaded = await client.board(created.value.id);
        if (reloaded.kind !== 'ok') throw new Error(JSON.stringify(reloaded.error));
        expect(reloaded.value.cards.map(card => card.text)).toEqual(['Saved through Effect', 'Real HTTP']);
        expect(reloaded.value.rev).toBe(1);
        expect(await client.saveCamera(created.value.id, { x: 12, y: 34, z: 2 })).toEqual({ kind: 'ok', value: undefined });
        const moved = await client.board(created.value.id);
        expect(moved).toMatchObject({ kind: 'ok', value: { view: { x: 12, y: 34, z: 2 } } });
        let eventTimer: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe = () => {};
        const updated = new Promise<void>((resolve, reject) => {
          eventTimer = setTimeout(() => { reject(new Error('Real SSE patch did not arrive')); }, 5000);
          unsubscribe = workspace.record(noteId).subscribe(() => {
            if (workspace.record(noteId).getSnapshot()?.text === 'Remote SSE') {
              clearTimeout(eventTimer); resolve();
            }
          });
        });
        try {
          const response = await client.commit({ id: BatchIdSchema.parse('remote-synthetic'), boardId: created.value.id, commands: [{ op: 'update', id: noteId, set: { text: 'Remote SSE' } }] });
          expect(response).toMatchObject({ kind: 'ok', value: { ok: true } });
          await updated;
          expect(workspace.card(noteId).getSnapshot()).toMatchObject({ text: 'Remote SSE' });
        } finally { unsubscribe(); clearTimeout(eventTimer); }
      } finally { connection.dispose(); workspace.dispose(); }
    } finally { client.dispose(); }
  } finally {
    clearTimeout(readyTimer);
    if (host.exitCode === null) {
      await new Promise<void>(resolve => { host.once('exit', () => { resolve(); }); host.kill('SIGTERM'); });
    }
    await Promise.all([rm(data, { recursive: true, force: true }), rm(cache, { recursive: true, force: true })]);
  }
}, 30000);
