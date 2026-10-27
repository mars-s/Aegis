import http from 'node:http';
import type { IncomingMessage } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { emptyBoard } from '@aegis/domain/commands';
import { decodeStoredLibrary } from '@aegis/protocol/storage';
import { atomicFile, atomicJson, readJson, errorMessage, errorStatus } from './files.js';
import { createBoards } from './boards.js';
import { createLibraryActions, emptyLibrary, tidyLibrary, LibraryOperationSchema } from './library.js';
import { createUiUpdater } from './ui-update.js';
import { handleMcpRequest } from './mcp.js';
import { mcpConfiguration } from './mcp-config.js';
import { createLifetime } from './lifetime.js';
import { createEvents } from './events.js';
import { createAssets } from './assets.js';
import { createSandboxes, SANDBOX_LIMIT } from './sandbox.js';
import { createUiFiles } from './ui-files.js';
import { createProviders, RewriteSchema } from './providers.js';
import { createRuns } from './runs.js';
import { body, send } from './http.js';
import { AgentCreationSchema, AnswerSchema, BoardCreationSchema, CameraSchema, InstallSchema, ItemSchema, MessageSchema, NameSchema, ProviderSchema } from './requests.js';
import { linkPreview } from './link-preview.js';

const agentRoot = fileURLToPath(new URL('..', import.meta.url));
const DATA = process.env.AEGIS_DATA || join(homedir(), 'Library', 'Application Support', 'Aegis');
const BOARDS = join(DATA, 'boards'), ASSETS = join(DATA, 'assets');
const UI_DIRS = [process.env.AEGIS_UI, join(DATA, 'ui', 'current')].filter((path): path is string => Boolean(path));
const PORT = Number(process.env.AEGIS_PORT || 4790);
await mkdir(BOARDS, { recursive: true, mode: 0o700 });
await mkdir(ASSETS, { recursive: true, mode: 0o700 });
async function secret(name: string, make = () => randomBytes(32).toString('base64url'), valid: (value: string) => boolean = () => true): Promise<string> {
  const path = join(DATA, name);
  try { const value = (await readFile(path, 'utf8')).trim(); if (valid(value)) return value; }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  const value = make(); await writeFile(path, value, { mode: 0o600 }); return value;
}
const TOKEN = process.env.AEGIS_TOKEN || await secret('agent-token');
const DEVICE = await secret('device-id', () => randomUUID(), value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
const lifetime = createLifetime(), events = createEvents(lifetime), { broadcast } = events;
function timing(value: object): void { if (process.env.AEGIS_PROFILE_TOOLS) process.stdout.write(JSON.stringify({ aegis: 'timing', ...value }) + '\n'); }
const boards = createBoards({ directory: BOARDS, broadcast, record: change => runs.record(change), refreshAgents: id => runs.refreshAgents(id), timing });
const { loadBoard, listBoards, boardPath, withBoard, commit } = boards;
const libraryPath = join(DATA, 'library.json');
async function library() {
  const boards = await listBoards(), lib = tidyLibrary(decodeStoredLibrary(await readJson(libraryPath, emptyLibrary())), boards.map(board => board.id));
  return { nodes: lib.nodes, boards: boards.map(board => ({ ...board, parent: lib.boards[board.id] ?? null })) };
}
const libraryAction = createLibraryActions({ listBoards, loadBoard, withBoard, newBoard: emptyBoard, makeId: () => randomBytes(8).toString('hex'),
  readLibrary: async () => decodeStoredLibrary(await readJson(libraryPath, emptyLibrary())), writeLibrary: value => atomicJson(libraryPath, value),
  writeBoard: board => atomicJson(boardPath(board.id), { ...board, editedAt: Date.now() }), removeBoard: id => unlink(boardPath(id)), changed: () => broadcast({ type: 'library' }),
});
function changeLibrary(input: unknown) { const op = LibraryOperationSchema.parse(input); return libraryAction(op.op === 'delete' && op.recursive === true ? 'delete' : 'change', op); }
const assets = createAssets(ASSETS), { saveAsset, sendAsset } = assets;
const mcpHost = { loadBoard, listBoards, commit, library, changeLibrary, createBoard: (args: unknown) => libraryAction('createBoard', BoardCreationSchema.parse(args)), readAsset: assets.readAsset };
const mcpConnectionPath = join(DATA, 'mcp-connection.json'), pluginDir = join(agentRoot, '..', 'plugins', 'aegis'), mcpBridge = join(DATA, 'integrations', 'mcp', 'server.mjs');
await atomicFile(mcpBridge, await readFile(join(pluginDir, 'server.mjs')));
const { uiRoot, sendUi } = createUiFiles(UI_DIRS);
const ui = createUiUpdater({ data: DATA, appDir: process.env.AEGIS_APP_SRC || join(agentRoot, '..', 'app'), onChange: () => broadcast({ type: 'ui' }), lifetime });
const providers = await createProviders({ data: DATA, device: DEVICE, broadcast, timing, lifetime });
const { fake } = providers;
const runs = await createRuns({ data: DATA, assets: ASSETS, agentRoot, boards, providers, broadcast, timing, lifetime });
const { spawnAgent, agents, message, stop, undoRequest } = runs;
const { registerSandbox, sendSandbox } = createSandboxes(port);
function port(): number { const address = server.address(); if (address === null || typeof address === 'string') throw new Error('Host is not listening'); return address.port; }
function authorised(req: IncomingMessage): boolean {
  const got = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer /, '')), want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const server = http.createServer(async (req, res) => {
  try {
    for (const [key, value] of Object.entries(CORS)) res.setHeader(key, value);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(String(req.headers.host ?? ''))) return send(res, 403, { error: 'loopback only' });
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/health') return send(res, 200, { ok: true, runtime: 'Pi Durable 1.3.0', ui: !!(await uiRoot()) });
    const uiPath = url.pathname.match(/^\/ui\/(.*)$/);
    if (uiPath && req.method === 'GET') return await sendUi(req, res, uiPath[1]);
    const asset = url.pathname.match(/^\/assets\/([^/]+)$/);
    if (asset?.[1] && (req.method === 'GET' || req.method === 'HEAD')) return await sendAsset(req, res, asset[1]);
    if (req.method === 'GET' && url.pathname.startsWith('/sandbox/')) return sendSandbox(res, url.pathname.slice('/sandbox/'.length));
    const sseToken = url.searchParams.get('token'), sseBytes = Buffer.from(sseToken ?? ''), tokenBytes = Buffer.from(TOKEN);
    if (!authorised(req) && !(url.pathname === '/events' && sseToken && sseBytes.length === tokenBytes.length && timingSafeEqual(sseBytes, tokenBytes))) return send(res, 401, { error: 'unauthorised' });
    const p = url.pathname, m = req.method;
    if (p === '/mcp') {
      const origin = req.headers.origin;
      if (origin && ![`http://127.0.0.1:${port()}`, `http://localhost:${port()}`].includes(origin)) return send(res, 403, { error: 'local app origin only' });
      return await handleMcpRequest(req, res, mcpHost);
    }
    if (p === '/integrations/mcp' && m === 'GET') return send(res, 200, mcpConfiguration({ data: DATA, bridge: mcpBridge, node: process.execPath, pluginDir, port: port() }));
    if (p === '/sandbox' && m === 'POST') return send(res, 200, registerSandbox(await body(req, SANDBOX_LIMIT)));
    if (p === '/events') return events.connect(req, res);
    if (p === '/boards' && m === 'GET') return send(res, 200, await listBoards());
    if (p === '/boards' && m === 'POST') { const result = await libraryAction('createBoard', BoardCreationSchema.parse(await body(req))); return send(res, 200, await loadBoard(result.created ?? '')); }
    if (p === '/library/duplicate' && m === 'POST') return send(res, 200, await libraryAction('duplicate', ItemSchema.parse(await body(req))));
    const deleting = p.match(/^\/boards\/([a-zA-Z0-9-]+)\/delete$/);
    if (deleting?.[1] && m === 'POST') return send(res, 200, await libraryAction('delete', { id: deleting[1] }));
    const bm = p.match(/^\/boards\/([a-zA-Z0-9-]+)(\/batch|\/view|\/name)?$/), boardId = bm?.[1];
    if (boardId && m === 'GET' && !bm?.[2]) { const board = await loadBoard(boardId); return board ? send(res, 200, board) : send(res, 404, { error: 'no board' }); }
    if (boardId && m === 'POST' && bm?.[2] === '/batch') return send(res, 200, await commit(boardId, await body(req), { kind: 'user' }));
    if (boardId && m === 'POST' && bm?.[2] === '/view') {
      const { view } = CameraSchema.parse(await body(req));
      await withBoard(boardId, async () => { const board = await loadBoard(boardId); if (board) { board.view = view; await atomicJson(boardPath(boardId), board); } });
      return send(res, 200, { ok: true });
    }
    if (boardId && m === 'POST' && bm?.[2] === '/name') {
      const { name } = NameSchema.parse(await body(req));
      await withBoard(boardId, async () => { const board = await loadBoard(boardId); if (board) { board.name = String(name || 'Untitled').slice(0, 120); board.editedAt = Date.now(); await atomicJson(boardPath(boardId), board); } });
      return send(res, 200, { ok: true });
    }
    if (p === '/library' && m === 'GET') return send(res, 200, await library());
    if (p === '/library' && m === 'POST') return send(res, 200, await changeLibrary(await body(req)));
    if (p === '/link-preview' && m === 'GET') return send(res, 200, await linkPreview(url.searchParams.get('url') ?? ''));
    if (p === '/assets' && m === 'POST') return send(res, 200, await saveAsset(req));
    if (p === '/ui-update' && m === 'GET') return send(res, 200, await ui.status());
    if (p === '/ui-update' && m === 'POST') { const value = InstallSchema.parse(await body(req)); return send(res, 200, await ui.install(value.from ? { from: value.from } : {})); }
    if (p === '/ui-update/rollback' && m === 'POST') return send(res, 200, await ui.rollback());
    if (p === '/agents' && m === 'GET') return send(res, 200, await agents(url.searchParams.get('board')));
    if (p === '/agents' && m === 'POST') {
      const input = AgentCreationSchema.parse(await body(req)), count = Math.min(8, Math.max(1, Number(input.count) || 1)), result = [];
      for (let index = 0; index < count; index++) result.push(await spawnAgent({ ...input, brief: String(input.brief ?? '').trim() || 'Sort this board.' }));
      return send(res, 200, result);
    }
    const undo = p.match(/^\/agents\/([a-zA-Z0-9-]+)\/history\/([a-zA-Z0-9-]+)\/undo$/);
    if (undo?.[1] && undo[2] && m === 'POST') return send(res, 200, await undoRequest(undo[1], undo[2]));
    const am = p.match(/^\/agents\/([a-zA-Z0-9-]+)\/(message|stop)$/);
    if (am?.[1] && m === 'POST') {
      if (am[2] === 'stop') await stop(am[1]);
      else { const value = MessageSchema.parse(await body(req)); await message(am[1], String(value.content ?? ''), value.selectedIds); }
      return send(res, 200, { ok: true });
    }
    if (p === '/models') return send(res, 200, providers.modelList());
    if (p === '/rewrite' && m === 'POST') return send(res, 200, await providers.rewriteText(RewriteSchema.parse(await body(req))));
    if (p === '/auth' && m === 'GET') return send(res, 200, await providers.authState());
    if (p === '/auth/start' && m === 'POST') { providers.signIn(ProviderSchema.parse(await body(req)).provider); return send(res, 200, await providers.authState()); }
    if (p === '/auth/cancel' && m === 'POST') { providers.cancelSignIn(ProviderSchema.parse(await body(req)).provider); return send(res, 200, await providers.authState()); }
    if (p === '/auth/answer' && m === 'POST') { const { provider, answer } = AnswerSchema.parse(await body(req)); providers.answer(provider, answer); return send(res, 200, { ok: true }); }
    if (p === '/auth/logout' && m === 'POST') { await providers.credentials.delete(ProviderSchema.parse(await body(req)).provider); return send(res, 200, await providers.authState()); }
    send(res, 404, { error: 'not found' });
  } catch (error) { if (!res.headersSent) send(res, errorStatus(error), { error: errorMessage(error) }); else res.destroy(); }
});
let shuttingDown: Promise<void> | undefined;
async function shutdown(): Promise<void> {
  shuttingDown ??= (async () => {
    server.close(); server.closeAllConnections();
    const connection = await readJson(mcpConnectionPath, null).catch(() => null);
    if (connection && typeof connection === 'object' && 'pid' in connection && connection.pid === process.pid) await unlink(mcpConnectionPath).catch(() => {});
    await lifetime.close();
  })();
  return shuttingDown;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void shutdown().then(() => process.exit(0), error => { process.stderr.write(errorMessage(error) + '\n'); process.exit(1); }); });
if (process.env.AEGIS_PARENT_PIPE) {
  const ended = () => { void shutdown().then(() => process.exit(0)); };
  process.stdin.on('end', ended); process.stdin.on('error', ended); process.stdin.resume();
}
server.listen(PORT, '127.0.0.1', () => {
  void (async () => {
    await atomicJson(mcpConnectionPath, { version: 1, port: port(), token: TOKEN, pid: process.pid });
    process.stdout.write(JSON.stringify({ aegis: 'ready', port: port(), ui: !!(await uiRoot()), ...(process.env.AEGIS_PRINT_TOKEN ? { token: TOKEN } : {}) }) + '\n');
  })().catch(error => { process.stderr.write(errorMessage(error) + '\n'); void shutdown().then(() => { process.exitCode = 1; }); });
});
export { fake };
