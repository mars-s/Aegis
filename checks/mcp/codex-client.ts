import { z } from 'zod/v4';
import { CallToolResultSchema, ReadResourceResultSchema } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import type { CallToolRequest } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import type { mcpConfiguration } from '../../agent/dist/mcp-config.js';

const IncomingSchema = z.object({ id: z.union([z.number(), z.string(), z.null()]).optional(), method: z.string().optional(), result: z.unknown().optional(), error: z.object({ message: z.string() }).optional() });
const InventorySchema = z.object({ data: z.array(z.object({ name: z.string(), tools: z.record(z.string(), z.unknown()).optional(), runtimeStatus: z.string().optional() })) });
// Exercise the installed Codex MCP client directly. No model turn or saved chat is created.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

export async function codexMcpClient(config: ReturnType<typeof mcpConfiguration>['config']) {
  const workspace = await mkdtemp(join(tmpdir(), 'aegis-codex-client-'));
  const entry = config.mcpServers.aegis;
  const serverConfig = `{aegis={command=${JSON.stringify(entry.command)},args=${JSON.stringify(entry.args)},env={AEGIS_DATA=${JSON.stringify(entry.env.AEGIS_DATA)}}}}`;
  const child = spawn(process.env.AEGIS_CODEX || 'codex', ['app-server', '--stdio', '-c', `mcp_servers=${serverConfig}`, '-c', 'features.apps=false'], {
    cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let nextId = 1, diagnostics = '';
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> }>();
  child.stderr.on('data', bytes => { diagnostics = (diagnostics + bytes).slice(-4000); });
  const failPending = (error: unknown) => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); } pending.clear(); };
  child.on('error', failPending);
  child.on('exit', code => failPending(new Error(`Codex app-server exited ${code}: ${diagnostics}`)));
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on('line', line => {
    let value: unknown; try { value = JSON.parse(line); } catch { return; }
    const parsed = IncomingSchema.safeParse(value); if (!parsed.success) return; const message = parsed.data;
    if (message.method) {
      if (Object.hasOwn(message, 'id')) child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Interactive requests are not supported by this check.' } }) + '\n');
      return;
    }
    const request = typeof message.id === 'number' ? pending.get(message.id) : undefined; if (!request) return;
    clearTimeout(request.timer); if (typeof message.id === 'number') pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  function rpc(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex ${method} timed out: ${diagnostics}`)); }, 20000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  async function close() {
    if (child.exitCode === null && child.pid) {
      const stopped = once(child, 'exit');
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 2000);
      await stopped; clearTimeout(timer);
    }
    lines.close(); await rm(workspace, { recursive: true, force: true });
  }
  try {
    await rpc('initialize', { clientInfo: { name: 'aegis_codex_check', version: '1' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    const started = z.object({ thread: z.object({ id: z.string() }) }).parse(await rpc('thread/start', { cwd: workspace, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only' }));
    const threadId = started.thread.id;
    let inventory: z.output<typeof InventorySchema>['data'][number] | undefined;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const status = InventorySchema.parse(await rpc('mcpServerStatus/list', { threadId, serverName: 'aegis' }));
      inventory = status.data.find(s => s.name === 'aegis');
      if (inventory?.tools && Object.keys(inventory.tools).length) break;
      if (inventory?.runtimeStatus === 'failed') throw new Error('Codex could not initialise Aegis: ' + diagnostics);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(inventory?.tools && Object.keys(inventory.tools).some(name => name.endsWith('board_apply')), 'Codex must discover the Aegis board tools.');
    return {
      callTool: async ({ name, arguments: args }: CallToolRequest['params']) => CallToolResultSchema.parse(await rpc('mcpServer/tool/call', { threadId, server: 'aegis', tool: name, arguments: args ?? {} })),
      readResource: async ({ uri }: { uri: string }) => ReadResourceResultSchema.parse(await rpc('mcpServer/resource/read', { threadId, server: 'aegis', uri })),
      close,
    };
  } catch (error) { await close(); throw error; }
}
