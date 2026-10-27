import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';
import { expect, it } from 'vitest';
import { BatchIdSchema, BoardIdSchema } from '@aegis/domain';
import { connectWorkspace, createHostClient } from '@aegis/host-client';
import type { HostResult } from '@aegis/host-client';
import { createWorkspace } from '../../../app/src/workspace/store.js';
import { noteId, otherId } from './helpers.js';

const ReadySchema = z.object({ aegis: z.literal('ready'), port: z.number().int().positive() });
function value<T>(result: HostResult<T>): T {
  if (result.kind === 'error') throw new Error(JSON.stringify(result.error));
  return result.value;
}

it('saves, reloads, receives SSE and persists camera against the untouched legacy host', async () => {
  const data = await mkdtemp(join(tmpdir(), 'aegis-workspace-host-'));
  const cache = await mkdtemp(join(tmpdir(), 'aegis-workspace-vite-'));
  const token = `workspace-synthetic-${process.pid}`;
  const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
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
      const csv = 'day,hours\nMon,3\nFri,9\n';
      const progress: number[] = [];
      const uploaded = await client.upload(new File([csv], 'fictional-hours.csv', { type: 'text/csv' }), undefined, percent => { progress.push(percent); });
      expect(progress).toEqual([0, 100]);
      expect(uploaded).toMatchObject({ kind: 'ok', value: { type: 'text/csv', size: new TextEncoder().encode(csv).length } });
      if (uploaded.kind !== 'ok') throw new Error('The synthetic CSV did not upload');
      expect(uploaded.value.url).toMatch(/^asset:[a-f0-9]{32}\.csv$/);
      expect(await (await fetch(client.assetUrl(uploaded.value.url))).text()).toBe(csv);
      const created = await client.createBoard('Real host workspace');
      if (created.kind !== 'ok') throw new Error(JSON.stringify(created.error));
      const signal = new AbortController().signal;
      expect(value(await client.accounts(signal)).map(account => [account.provider, account.connected])).toEqual([['openai', false], ['anthropic', false]]);
      expect(value(await client.agents.models(signal)).some(model => model.provider === 'fake')).toBe(true);
      expect(value(await client.agents.connected('fake', signal))).toBe(true);
      expect(value(await client.rewrite({ text: 'A local passage', how: 'Shorten', title: 'Synthetic', around: '' }, signal))).toBe('A local passage (rewritten)');
      expect(value(await client.mcp(signal)).codexCommand).toContain('aegis');
      const folder = value(await client.library.change({ op: 'create', kind: 'folder', parent: null, name: 'Synthetic folder' }, signal));
      if (!folder.created) throw new Error('The synthetic folder was not created');
      const child = value(await client.library.createBoard('Synthetic child', folder.created, signal));
      value(await client.library.renameBoard(child.id, 'Renamed child', signal));
      expect(value(await client.library.read(signal)).boards.find(board => board.id === child.id)).toMatchObject({ name: 'Renamed child', parent: folder.created });
      const duplicate = value(await client.library.duplicate(child.id, signal));
      if (!duplicate.created) throw new Error('The synthetic duplicate was not created');
      value(await client.library.removeBoard(BoardIdSchema.parse(duplicate.created), signal));
      expect(value(await client.library.read(signal)).boards.some(board => board.id === duplicate.created)).toBe(false);
      const receipt = value(await client.agents.start({ boardId: created.value.id, brief: 'FAKEREPLY A local reply', selectedIds: [], model: { provider: 'fake', modelId: 'fake' }, count: 1 }, signal))[0];
      if (!receipt) throw new Error('The synthetic agent was not created');
      await expect.poll(async () => value(await client.agents.list(created.value.id, signal)).find(agent => agent.id === receipt.id)?.text).toBe('A local reply');
      const sandbox = value(await client.registerSandbox({ html: '<p>Local sandbox</p>', css: '', js: '', parentOrigin: `http://127.0.0.1:${port}`, channel: crypto.randomUUID(), font: 'data:font/woff2;base64,AA==', theme: '', motionOff: true }, signal));
      const page = await fetch(sandbox.url);
      expect(page.headers.get('content-security-policy')).toContain('sandbox allow-scripts');
      expect(await page.text()).toContain('Local sandbox');
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
