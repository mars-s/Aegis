// Aegis agent host: Pi Durable on 127.0.0.1, driving boards through the board commands.
// The canvas talks to it over HTTP with a bearer token; it pushes changes as server-sent events.
import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink, chmod, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { Harness, createRegistry, defineExtension, defineTool, section, AgentDoc, LiveDoc } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { applyBatch, describe, emptyBoard } from '../web/board/commands.js';
import { applyLibraryOp, emptyLibrary, tidyLibrary } from './library.mjs';

const DATA = process.env.AEGIS_DATA || join(homedir(), 'Library', 'Application Support', 'Aegis');
const BOARDS = join(DATA, 'boards');
const ASSETS = join(DATA, 'assets');
const PORT = Number(process.env.AEGIS_PORT || 4790);
await mkdir(BOARDS, { recursive: true, mode: 0o700 });
await mkdir(ASSETS, { recursive: true, mode: 0o700 });

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
  await rename(tmp, path);
}
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
async function secret(name, make = () => randomBytes(32).toString('base64url'), valid = () => true) {
  const path = join(DATA, name);
  try { const v = (await readFile(path, 'utf8')).trim(); if (valid(v)) return v; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const value = make();
  await writeFile(path, value, { mode: 0o600 }); return value;
}
const TOKEN = process.env.AEGIS_TOKEN || await secret('agent-token');
// ChatGPT sign-in identifies this install by a UUID; earlier builds wrote a non-UUID here, so replace it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE = await secret('device-id', () => randomUUID(), v => UUID.test(v));

// ---------- boards: one JSON file each, every change through applyBatch ----------
const safeId = id => String(id ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
const boardPath = id => join(BOARDS, `${safeId(id)}.json`);
const boardLocks = new Map();
function withBoard(id, fn) {
  const prev = boardLocks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn); boardLocks.set(id, next.catch(() => {})); return next;
}
async function loadBoard(id) { return readJson(boardPath(id), null); }
async function listBoards() {
  const out = [];
  for (const f of await readdir(BOARDS).catch(() => [])) if (f.endsWith('.json')) {
    const b = await readJson(join(BOARDS, f), null); if (b) out.push({ id: b.id, name: b.name, cards: b.cards.length, rev: b.rev });
  }
  return out;
}
async function commit(boardId, batch, author) {
  return withBoard(boardId, async () => {
    const board = await loadBoard(boardId);
    if (!board) return { ok: false, errors: [{ index: -1, reason: `no board ${boardId}`, hint: 'list boards first' }] };
    const result = applyBatch(board, batch);
    if (!result.ok) return { ok: false, rev: board.rev, errors: result.errors };
    await atomicJson(boardPath(boardId), result.board);
    broadcast({ type: 'board', boardId, rev: result.board.rev, author, touched: result.touched, focus: result.board.focus ?? null });
    return { ok: true, rev: result.board.rev, created: result.created };
  });
}

// ---------- library: projects and folders holding boards ----------
const libraryPath = join(DATA, 'library.json');
let libraryChain = Promise.resolve();
async function library() {
  const boards = await listBoards();
  const lib = tidyLibrary(await readJson(libraryPath, emptyLibrary()), boards.map(b => b.id));
  return { nodes: lib.nodes, boards: boards.map(b => ({ ...b, parent: lib.boards[b.id] ?? null })) };
}
function changeLibrary(op) {
  const task = libraryChain.then(async () => {
    const ids = (await listBoards()).map(b => b.id);
    const r = applyLibraryOp(await readJson(libraryPath, emptyLibrary()), op, ids);
    if (!r.ok) throw Object.assign(new Error(r.error), { status: 400 });
    await atomicJson(libraryPath, r.library);
    broadcast({ type: 'library' });
    return { ok: true, created: r.created ?? null };
  });
  libraryChain = task.catch(() => {}); return task;
}

// ---------- assets: images and video, stored by random name ----------
// Reading needs no token (img and video tags can't send one); the 128-bit name is the capability.
const MEDIA = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
  mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm' };
const EXT_OF = Object.fromEntries(Object.entries(MEDIA).reverse().map(([e, t]) => [t, e]));
const ASSET_RE = /^[a-f0-9]{32}\.([a-z0-9]{3,4})$/;
async function saveAsset(req) {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  const ext = EXT_OF[type]; if (!ext) throw Object.assign(new Error(`unsupported file type ${type || '(none)'}`), { status: 415 });
  const name = `${randomBytes(16).toString('hex')}.${ext}`, tmp = join(ASSETS, `${name}.tmp`);
  let size = 0;
  req.on('data', c => { size += c.length; if (size > 1024 ** 3) req.destroy(new Error('file is over 1 GB')); });
  await pipeline(req, createWriteStream(tmp, { mode: 0o600 }));
  if (!size) { await unlink(tmp).catch(() => {}); throw new Error('empty file'); }
  await rename(tmp, join(ASSETS, name));
  return { url: `asset:${name}`, type, size };
}
async function sendAsset(req, res, name) {
  const m = ASSET_RE.exec(name); if (!m || !MEDIA[m[1]]) return send(res, 404, { error: 'no asset' });
  const path = join(ASSETS, name); let info;
  try { info = await stat(path); } catch { return send(res, 404, { error: 'no asset' }); }
  const headers = { 'content-type': MEDIA[m[1]], 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" };
  // WebKit seeks video with byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) { res.writeHead(416, { 'content-range': `bytes */${info.size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return pipeline(createReadStream(path, { start, end }), res).catch(() => {});
  }
  res.writeHead(200, { ...headers, 'content-length': info.size });
  if (req.method === 'HEAD') return res.end();
  return pipeline(createReadStream(path), res).catch(() => {});
}

// ---------- events to the canvas ----------
const clients = new Set();
function broadcast(event) { const line = `data: ${JSON.stringify(event)}\n\n`; for (const res of clients) res.write(line); }

// ---------- models and sign-in ----------
class Credentials {
  constructor(path) { this.path = path; this.chain = Promise.resolve(); }
  async all() { return readJson(this.path, {}); }
  async read(id) { return (await this.all())[id]; }
  async list() { return Object.entries(await this.all()).map(([providerId, c]) => ({ providerId, type: c.type })); }
  modify(id, fn) {
    const task = this.chain.then(async () => { const all = await this.all(); const v = await fn(all[id]); if (v !== undefined) { all[id] = v; await atomicJson(this.path, all); } return all[id]; });
    this.chain = task.catch(() => {}); return task;
  }
  delete(id) {
    const task = this.chain.then(async () => { const all = await this.all(); delete all[id]; await atomicJson(this.path, all); });
    this.chain = task.catch(() => {}); return task;
  }
}
const credentials = new Credentials(join(DATA, 'auth.json'));
const models = createModels({ credentials, authContext: { env: async () => undefined, fileExists: async () => false } });
models.setProvider(openaiProvider());
models.setProvider(anthropicProvider());
let fake = null;
if (process.env.AEGIS_FAKE_MODEL) {
  // Checks only: a scripted local model, so tests never reach a provider.
  // It reads the board, then sends the batch written after "FAKE " in the brief, then says done.
  const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import('@earendil-works/pi-ai/providers/faux');
  fake = fauxProvider({ provider: 'fake', models: [{ id: 'fake', name: 'Fake (checks only)' }] });
  const step = (ctx) => {
    fake.appendResponses([step]);
    const msgs = ctx.messages;
    const brief = msgs.find(m => m.role === 'user'); const briefText = typeof brief?.content === 'string' ? brief.content : brief?.content?.find?.(c => c.type === 'text')?.text ?? '';
    const results = msgs.filter(m => m.role === 'toolResult').length;
    const batch = /^FAKE ([\s\S]+)$/.exec(briefText)?.[1];
    if (!batch) return fauxAssistantMessage('Fake model: start the brief with FAKE and a JSON command list.');
    if (results === 0) return fauxAssistantMessage(fauxToolCall('board_read', {}), { stopReason: 'toolUse' });
    if (results === 1) return fauxAssistantMessage(fauxToolCall('board_apply', { commands: JSON.parse(batch) }), { stopReason: 'toolUse' });
    return fauxAssistantMessage('Done: sorted the board.');
  };
  fake.setResponses([step]);
  models.setProvider(fake.provider);
}

const signIns = new Map();
function signIn(provider) {
  if (!['openai', 'anthropic'].includes(provider)) throw new Error('provider must be openai or anthropic');
  // Starting again replaces an unfinished attempt, so a stale callback port is always released first.
  const previous = signIns.get(provider);
  if (previous?.job) { previous.cancelled = true; previous.abort.abort(); }
  const s = { state: 'pending', events: [], prompt: null, abort: new AbortController(), started: Date.now() };
  signIns.set(provider, s);
  const timer = setTimeout(() => s.abort.abort(), 15 * 60 * 1000);
  const job = (previous?.job ?? Promise.resolve()).catch(() => {}).then(() => models.login(provider, 'oauth', {
    signal: s.abort.signal,
    notify: e => { s.events.push(e); if (s.events.length > 12) s.events.shift(); broadcast({ type: 'auth', provider }); },
    prompt: p => {
      // Aegis runs on this Mac, so the browser can return to the local callback: no code to paste.
      if (p.type === 'select') return Promise.resolve(p.options?.find(o => o.id === 'browser')?.id ?? p.options?.[0]?.id);
      return new Promise((resolve, reject) => {
        s.prompt = { type: p.type, message: p.message, placeholder: p.placeholder };
        s.answer = v => { s.prompt = null; s.answer = null; resolve(v); };
        (p.signal ?? s.abort.signal).addEventListener('abort', () => reject(new Error('Sign-in closed')), { once: true });
        broadcast({ type: 'auth', provider });
      });
    },
  }, { getDeviceId: () => DEVICE, agentName: 'Aegis' }))
    .then(() => { s.state = 'connected'; s.error = null; })
    .catch(e => {
      s.state = s.abort.signal.aborted && s.cancelled ? 'idle' : 'failed';
      s.error = s.state === 'idle' ? null : friendlyAuthError(provider, e);
      if (s.state === 'failed') console.error(`[auth] ${provider} sign-in failed: ${e?.message || e}`);
    })
    .finally(() => { clearTimeout(timer); s.prompt = null; s.answer = null; if (s.job === job) s.job = null; broadcast({ type: 'auth', provider }); });
  s.job = job;
}
function cancelSignIn(provider) {
  const s = signIns.get(provider);
  if (s?.job) { s.cancelled = true; s.abort.abort(); }
}
function friendlyAuthError(provider, e) {
  const m = String(e?.message || e || '');
  if (/aborted|closed|cancel/i.test(m)) return 'Sign-in timed out. Try again.';
  if (/in use|EADDRINUSE/i.test(m)) return 'Another sign-in (Codex or Pi) is holding the login port. Finish or close it, then try again.';
  if (/state mismatch/i.test(m)) return 'That link belonged to an older attempt. Try again and use the newest browser tab.';
  if (/callback URL|redirect URL|authorization code/i.test(m)) return m;
  return `${provider === 'openai' ? 'ChatGPT' : 'Claude'} sign-in failed: ${m.slice(0, 200)}`;
}
async function authState() {
  const out = {};
  for (const p of ['openai', 'anthropic']) {
    const s = signIns.get(p);
    out[p] = { connected: !!(await credentials.read(p)), state: s?.state ?? 'idle', prompt: s?.prompt ?? null, error: s?.error ?? null,
      link: s?.events?.findLast?.(e => e.url)?.url ?? null, progress: s?.events?.findLast?.(e => e.type === 'progress')?.message ?? null, started: s?.started ?? null };
  }
  return out;
}
function modelList() {
  // Current families only, newest first: GPT-6.x and the latest Claude lines.
  const pick = (provider, re) => models.getModels(provider).filter(m => re.test(m.id)).map(m => ({ provider, modelId: m.id, name: m.name })).reverse();
  return [...(fake ? [{ provider: 'fake', modelId: 'fake', name: 'Fake' }] : []),
    ...pick('openai', /^gpt-6/), ...pick('anthropic', /^claude-(opus|sonnet|haiku)-5|^claude-fable-5/)];
}

// ---------- board tools for agents ----------
const run = new Map(); // conversation id -> { boardId, agentCard }
const boardOf = api => run.get(String(api.conversationId ?? api.conversation?.id))?.boardId;
const text = value => ({ output: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const Command = Type.Object({}, { additionalProperties: true, description: 'One board command, e.g. {"op":"create","type":"note","text":"..."}' });

const readBoard = defineTool({
  name: 'board_read',
  description: 'Read the current board: every card with id, type, position, size, text and links. Read before editing; ids are needed for update, move, delete, connect and layout.',
  parameters: Type.Object({}),
  replay: 'safe',
  execute: async (_args, api) => {
    const id = boardOf(api); const b = id && await loadBoard(id);
    return b ? text(describe(b)) : text('This conversation has no board.');
  },
});
const editBoard = defineTool({
  name: 'board_apply',
  description: [
    'Change the board with an ordered batch of commands, applied together or not at all (one undo step).',
    'Ops: create {type: note|title|todo|link|image|video|web, text, heading?, badge?, color?, x?, y?, w?, h?, items? (todo), url? (link/image/video/web; https: or asset:), group?, near? (card id), ref? (name to reuse as "$name" later in the batch)};',
    'update {id, set: {text|heading|badge|color|x|y|w|h|items|url|group}}; move {id, x, y}; delete {id | ids}; connect {a, b, label?};',
    'layout {ids, shape: grid|column|row, x?, y?, cols?}; order {ids, to: front|back|index} (stacking; cards are listed back to front); focus {ids} (show the user what you made; end every batch that adds things with focus).',
    'A note with a heading and a badge such as "read me first" explains how the board works.',
    'Colors: plain gray blue green yellow orange red purple. Omit x/y to let the board find free space. Titles label groups; put a title above each cluster.',
  ].join(' '),
  parameters: Type.Object({ commands: Type.Array(Command, { minItems: 1, maxItems: 500 }) }),
  execute: async (args, api) => {
    const id = boardOf(api); if (!id) return text('This conversation has no board.');
    const result = await commit(id, { commands: args.commands }, { kind: 'agent', conversationId: String(api.conversationId ?? '') });
    if (!result.ok) throw new Error(`Nothing changed. ${result.errors.map(e => `#${e.index}: ${e.reason}`).join('; ')}. ${result.errors[0]?.hint ?? ''}`);
    return text({ ok: true, rev: result.rev, created: result.created });
  },
});
const BoardExtension = defineExtension({
  name: 'aegis-board',
  tools: [readBoard, editBoard],
  sections: [section('aegis', () => [
    'You are an agent inside Aegis, a minimal infinite canvas. The user brain-dumps; you sort it into a clear layout.',
    'If the board has a note badged "read me first" (or similar), follow it: it is the user\'s instructions for this board.',
    'Work through board_read and board_apply. Group related ideas under a title card, pull tasks into todo cards, connect related cards, and finish with a focus command on what you made.',
    'Keep card text short and plain. Australian English. Reply in one or two sentences saying what you changed.',
  ].join('\n'), { tag: false })],
});

const registry = createRegistry();
registry.install(BoardExtension);
const storage = await openNodeSqliteStorage(join(DATA, 'agents.sqlite'));
const harness = await Harness.open(storage, {
  models, registry,
  settings: { toolExecution: 'parallel', retry: { maxRetries: 1 }, stream: { maxRetries: 0, timeoutMs: 180000 } },
}, context);
const runsPath = join(DATA, 'runs.json');
for (const [k, v] of Object.entries(await readJson(runsPath, {}))) run.set(k, v);
harness.resume();

// ---------- agent runs ----------
const watching = new Map();
async function watchRun(conversation) {
  const key = String(conversation.id); if (watching.has(key)) return;
  const view = await conversation.viewState(context);
  watching.set(key, view);
  let last = '';
  view.subscribe(value => {
    const s = summarise(key, value); const sig = JSON.stringify(s);
    if (sig !== last) { last = sig; broadcast({ type: 'agent', ...s }); }
  });
}
function summarise(id, value) {
  const live = value.docs?.['pi.live']; const meta = run.get(id) ?? {};
  const entries = value.entries ?? [];
  const lastAnswer = entries.findLast(e => e.kind === 'pi.assistant');
  const answer = lastAnswer?.model?.[0]?.content?.filter?.(c => c.type === 'text').map(c => c.text).join('') ?? '';
  const tools = Object.values(live?.tools ?? {}).map(t => t.name ?? t.call?.name).filter(Boolean);
  const partial = live?.run?.partial?.content?.filter?.(c => c.type === 'text').map(c => c.text).join('') ?? '';
  const failed = entries.findLast(e => e.kind === 'pi.error' || e.kind === 'pi.unanswered');
  return { id, boardId: meta.boardId, brief: meta.brief, model: meta.model, running: !!live?.run,
    step: tools.length ? `using ${tools.join(', ')}` : live?.run ? (partial ? 'writing' : 'thinking') : 'idle',
    text: (live?.run ? partial : answer).slice(-600), error: failed ? 'The run stopped. Check the model sign-in.' : null };
}
async function spawnAgent({ boardId, brief, model }) {
  if (!(await loadBoard(boardId))) throw new Error('no such board');
  const selection = model ?? modelList()[0];
  if (!selection) throw new Error('no models');
  const conversation = await harness.createConversation({ ownership: { kind: 'ownerless' }, agent: { model: { provider: selection.provider, modelId: selection.modelId } } }, context);
  const id = String(conversation.id);
  run.set(id, { boardId, brief: brief.slice(0, 2000), model: selection, created: Date.now() });
  await atomicJson(runsPath, Object.fromEntries(run));
  await watchRun(conversation);
  await conversation.submit({ type: 'input', content: brief, requestId: randomUUID() }, context);
  return { id };
}
async function message(id, content) {
  const conversation = await harness.conversation(Number.isNaN(Number(id)) ? id : Number(id), context);
  if (!conversation || !run.has(String(id))) throw new Error('no such agent');
  await watchRun(conversation);
  await conversation.submit({ type: 'input', content, requestId: randomUUID() }, context);
}
async function stop(id) {
  const conversation = await harness.conversation(Number.isNaN(Number(id)) ? id : Number(id), context);
  if (conversation) await conversation.abort(context);
}
async function agents(boardId) {
  const out = [];
  for (const [id, meta] of run) if (!boardId || meta.boardId === boardId) {
    const conversation = await harness.conversation(Number.isNaN(Number(id)) ? id : Number(id), context);
    if (!conversation) continue;
    const view = await conversation.viewState(context);
    try { out.push(summarise(id, view.value)); } finally { view.dispose(); }
  }
  return out;
}

// ---------- HTTP ----------
function authorised(req) {
  const got = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 5e6) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
const send = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const host = String(req.headers.host ?? '');
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return send(res, 403, { error: 'loopback only' });
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') return send(res, 200, { ok: true, runtime: 'Pi Durable 1.3.0' });
  const asset = url.pathname.match(/^\/assets\/([^/]+)$/);
  if (asset && (req.method === 'GET' || req.method === 'HEAD')) return sendAsset(req, res, asset[1]);
  const sseToken = url.searchParams.get('token');
  if (!authorised(req) && !(url.pathname === '/events' && sseToken && sseToken.length === TOKEN.length && timingSafeEqual(Buffer.from(sseToken), Buffer.from(TOKEN)))) return send(res, 401, { error: 'unauthorised' });
  try {
    const p = url.pathname, m = req.method;
    if (p === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': hi\n\n'); clients.add(res); const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); }); return;
    }
    if (p === '/boards' && m === 'GET') return send(res, 200, await listBoards());
    if (p === '/boards' && m === 'POST') {
      const { name, parent } = await body(req); const id = randomUUID().slice(0, 8);
      const b = emptyBoard(id, String(name || 'Untitled').slice(0, 120)); await atomicJson(boardPath(id), b);
      if (parent) await changeLibrary({ op: 'move', id, parent }).catch(async e => { await unlink(boardPath(id)); throw e; });
      return send(res, 200, b);
    }
    const bm = p.match(/^\/boards\/([a-zA-Z0-9-]+)(\/batch|\/view|\/name)?$/);
    if (bm && m === 'GET' && !bm[2]) { const b = await loadBoard(bm[1]); return b ? send(res, 200, b) : send(res, 404, { error: 'no board' }); }
    if (bm && m === 'POST' && bm[2] === '/batch') return send(res, 200, await commit(bm[1], await body(req), { kind: 'user' }));
    if (bm && m === 'POST' && bm[2] === '/view') {
      const { view } = await body(req);
      await withBoard(bm[1], async () => { const b = await loadBoard(bm[1]); if (b) { b.view = { x: +view.x || 0, y: +view.y || 0, z: Math.min(8, Math.max(0.05, +view.z || 1)) }; await atomicJson(boardPath(bm[1]), b); } });
      return send(res, 200, { ok: true });
    }
    if (bm && m === 'POST' && bm[2] === '/name') {
      const { name } = await body(req);
      await withBoard(bm[1], async () => { const b = await loadBoard(bm[1]); if (b) { b.name = String(name || 'Untitled').slice(0, 120); await atomicJson(boardPath(bm[1]), b); } });
      return send(res, 200, { ok: true });
    }
    if (p === '/library' && m === 'GET') return send(res, 200, await library());
    if (p === '/library' && m === 'POST') return send(res, 200, await changeLibrary(await body(req)));
    if (p === '/assets' && m === 'POST') return send(res, 200, await saveAsset(req));
    if (p === '/agents' && m === 'GET') return send(res, 200, await agents(url.searchParams.get('board')));
    if (p === '/agents' && m === 'POST') {
      const { boardId, brief, model, count } = await body(req);
      const n = Math.min(8, Math.max(1, Number(count) || 1)); const out = [];
      for (let i = 0; i < n; i++) out.push(await spawnAgent({ boardId, brief: String(brief ?? '').trim() || 'Sort this board.', model }));
      return send(res, 200, out);
    }
    const am = p.match(/^\/agents\/([a-zA-Z0-9-]+)\/(message|stop)$/);
    if (am && m === 'POST') { if (am[2] === 'stop') await stop(am[1]); else await message(am[1], String((await body(req)).content ?? '')); return send(res, 200, { ok: true }); }
    if (p === '/models') return send(res, 200, modelList());
    if (p === '/auth' && m === 'GET') return send(res, 200, await authState());
    if (p === '/auth/start' && m === 'POST') { signIn((await body(req)).provider); return send(res, 200, await authState()); }
    if (p === '/auth/cancel' && m === 'POST') { cancelSignIn((await body(req)).provider); return send(res, 200, await authState()); }
    if (p === '/auth/answer' && m === 'POST') {
      const { provider, answer } = await body(req); const s = signIns.get(provider);
      if (!s?.answer || typeof answer !== 'string' || !answer.trim()) throw new Error('no sign-in is waiting for an answer');
      s.answer(answer.trim()); return send(res, 200, { ok: true });
    }
    if (p === '/auth/logout' && m === 'POST') { await credentials.delete((await body(req)).provider); return send(res, 200, await authState()); }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, e.status ?? 400, { error: e.message }); }
});
server.listen(PORT, '127.0.0.1', () => {
  // The shell reads this line to learn the port and token.
  console.log(JSON.stringify({ aegis: 'ready', port: server.address().port, token: process.env.AEGIS_PRINT_TOKEN ? TOKEN : undefined }));
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { server.close(); await harness.close(context).catch(() => {}); process.exit(0); });
export { fake };
