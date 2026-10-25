// Aegis agent host: Pi Durable on 127.0.0.1, driving boards through the board commands.
// The canvas talks to it over HTTP with a bearer token; it pushes changes as server-sent events.
import http from 'node:http';
import { activityFromView, createStatusTracker, fallbackStatus, summariseStatus } from './status.mjs';
import { linkPreview } from '../app/src/features/media/link-preview.mjs';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink, chmod, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, dirname, normalize } from 'node:path';
import { homedir } from 'node:os';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { Harness, createRegistry, defineExtension, defineTool, section, AgentDoc, LiveDoc } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { applyBatch, cardTypeGuide, describe, emptyBoard, findSpace } from '../app/src/lib/board/commands.js';
import { OBJECT_KINDS, OBJECT_GUIDE, OBJECT_SIZE, objectSchemas } from '../app/src/lib/board/objects.js';
import '../app/src/lib/board/types/index.js';
import { createLibraryActions, emptyLibrary, tidyLibrary } from './library.mjs';
import { createUiUpdater } from './ui-update.mjs';

const DATA = process.env.AEGIS_DATA || join(homedir(), 'Library', 'Application Support', 'Aegis');
const BOARDS = join(DATA, 'boards');
const ASSETS = join(DATA, 'assets');
// The UI the window loads: AEGIS_UI (a built app folder), else DATA/ui/current once an update has installed one.
const UI_DIRS = [process.env.AEGIS_UI, join(DATA, 'ui', 'current')].filter(Boolean);
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
    const b = await readJson(join(BOARDS, f), null); if (b) out.push({ id: b.id, name: b.name, cards: b.cards.length, rev: b.rev, boardParent: b.parent ?? null });
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
async function library() {
  const boards = await listBoards();
  const lib = tidyLibrary(await readJson(libraryPath, emptyLibrary()), boards.map(b => b.id));
  return { nodes: lib.nodes, boards: boards.map(b => ({ ...b, parent: lib.boards[b.id] ?? null })) };
}
const libraryAction = createLibraryActions({
  listBoards, loadBoard, withBoard, newBoard: emptyBoard, makeId: () => randomBytes(8).toString('hex'),
  readLibrary: () => readJson(libraryPath, emptyLibrary()), writeLibrary: lib => atomicJson(libraryPath, lib),
  writeBoard: b => atomicJson(boardPath(b.id), b), removeBoard: id => unlink(boardPath(id)),
  changed: () => broadcast({ type: 'library' }),
});
const changeLibrary = op => libraryAction(op.op === 'delete' && op.recursive === true ? 'delete' : 'change', op);

// ---------- assets: images and video, stored by random name ----------
// Reading needs no token (img and video tags can't send one); the 128-bit name is the capability.
const MEDIA = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', apng: 'image/apng',
  weba: 'audio/webm', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
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

// ---------- the UI, served from a folder so it can be replaced without rebuilding the app ----------
const UI_TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', apng: 'image/apng', png: 'image/png', json: 'application/json', map: 'application/json', woff2: 'font/woff2' };
async function uiRoot() {
  for (const dir of UI_DIRS) { try { if ((await stat(join(dir, 'index.html'))).isFile()) return dir; } catch {} }
  return null;
}
async function sendUi(req, res, rel) {
  const root = await uiRoot(); if (!root) return send(res, 404, { error: 'no ui installed' });
  const clean = normalize('/' + decodeURIComponent(rel || 'index.html')).replace(/^\/+/, '');
  if (clean.includes('..')) return send(res, 404, { error: 'not found' });
  const path = join(root, clean || 'index.html');
  if (!path.startsWith(root)) return send(res, 404, { error: 'not found' });
  let info; try { info = await stat(path); } catch { return send(res, 404, { error: 'not found' }); }
  if (!info.isFile()) return send(res, 404, { error: 'not found' });
  const ext = path.split('.').pop();
  res.writeHead(200, { 'content-type': UI_TYPES[ext] ?? 'application/octet-stream', 'cache-control': clean === 'index.html' ? 'no-store' : 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
  return pipeline(createReadStream(path), res).catch(() => {});
}

const APP_DIR = process.env.AEGIS_APP_SRC || join(dirname(new URL(import.meta.url).pathname), '..', 'app');
const ui = createUiUpdater({ data: DATA, appDir: APP_DIR, onChange: () => broadcast({ type: 'ui' }) });

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
  const step = async (ctx) => {
    fake.appendResponses([step]);
    if (process.env.AEGIS_FAKE_DELAY_MS) await new Promise(resolve => setTimeout(resolve, Math.min(5000, Number(process.env.AEGIS_FAKE_DELAY_MS) || 0)));
    const msgs = ctx.messages;
    const brief = msgs.find(m => m.role === 'user'); const briefText = typeof brief?.content === 'string' ? brief.content : brief?.content?.find?.(c => c.type === 'text')?.text ?? '';
    const results = msgs.filter(m => m.role === 'toolResult').length;
    // FAKETOOLS [[name, args], ...]: call these tools in order (one per turn; a nested list runs together), then stop.
    const script = /FAKETOOLS (\[[\s\S]+\])$/.exec(briefText)?.[1];
    if (script) {
      const turns = JSON.parse(script); const turn = msgs.filter(m => m.role === 'assistant').length;
      if (turn >= turns.length) return fauxAssistantMessage('Done.');
      const calls = Array.isArray(turns[turn][0]) ? turns[turn] : [turns[turn]];
      return fauxAssistantMessage(calls.map(([name, args]) => fauxToolCall(name, args)), { stopReason: 'toolUse' });
    }
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

// ---------- one-shot text rewrite for the document editor (no board access, no tools) ----------
async function rewriteText({ text: input, how, title, around, model }) {
  if (typeof input !== 'string' || !input.trim()) throw Object.assign(new Error('nothing to rewrite'), { status: 400 });
  if (input.length > 12000) throw Object.assign(new Error('select fewer than 12,000 characters'), { status: 400 });
  const list = modelList();
  const ready = [];
  for (const m of list) if (m.provider === 'fake' || (await credentials.read(m.provider))) ready.push(m);
  const choice = (model && ready.find(m => m.provider === model.provider && m.modelId === model.modelId)) || ready[0];
  if (!choice) throw Object.assign(new Error('Sign in to ChatGPT or Claude in Settings first'), { status: 400 });
  if (choice.provider === 'fake') return { text: `${input} (rewritten)` };
  const target = models.getModel(choice.provider, choice.modelId);
  const reply = await models.completeSimple(target, {
    systemPrompt: 'You rewrite a passage from the person\'s document. Return only the rewritten passage: no preamble, no quotes, no notes. Keep the meaning and the language. Australian English unless the passage is in another language. Never use em dashes.',
    messages: [{ role: 'user', timestamp: Date.now(), content: `Document: ${String(title || 'Untitled').slice(0, 200)}\nInstruction: ${String(how || 'Improve the writing').slice(0, 500)}\n\nText around it (context only, do not return it):\n${String(around || '').slice(0, 3000)}\n\nPassage to rewrite:\n${input}` }],
  });
  const out = (reply.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  if (!out) throw new Error(reply.errorMessage || 'the model returned nothing');
  return { text: out, model: choice.modelId };
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
    'Ops: create {type, text, heading?, badge?, color?, x?, y?, w?, h?, rot?, items? (todo), url? (link/image/video/web; https: or asset:), group?, parent? (card id), props? (type-specific, listed below), near? (card id), ref? (name to reuse as "$name" later in the batch)};',
    'update {id, set: {text|heading|badge|color|x|y|w|h|rot|items|url|group|parent|props}} (props merges; a null value removes that key); move {id, x, y}; delete {id | ids}; connect {a, b, label?};',
    'layout {ids, shape: grid|column|row, x?, y?, cols?}; order {ids, to: front|back|index} (stacking; cards are listed back to front); focus {ids} (show the user what you made; end every batch that adds things with focus).',
    'A note with a heading and a badge such as "read me first" explains how the board works.',
    'Colors: plain gray blue green yellow orange red purple, or "#rrggbb". Omit x/y to let the board find free space. Titles label groups; put a title above each cluster.',
    'Basic types: note, title, todo, link, image, video, web. More types:\n' + cardTypeGuide(),
  ].join(' '),
  parameters: Type.Object({ commands: Type.Array(Command, { minItems: 1, maxItems: 500 }) }),
  execute: async (args, api) => {
    const id = boardOf(api); if (!id) return text('This conversation has no board.');
    const result = await commit(id, { commands: args.commands }, { kind: 'agent', conversationId: String(api.conversationId ?? '') });
    if (!result.ok) throw new Error(`Nothing changed. ${result.errors.map(e => `#${e.index}: ${e.reason}`).join('; ')}. ${result.errors[0]?.hint ?? ''}`);
    return text({ ok: true, rev: result.rev, created: result.created });
  },
});
// ---------- objects: Zephium-style typed results (create, revise) ----------
const SCHEMAS = objectSchemas();
const createObject = defineTool({
  name: 'create',
  description: `Places one object on the board and returns its id. Objects are the result the person came for: a reply, a chart, a sheet, a diagram, a plan, a list or code. The app draws and lays them out.\n${OBJECT_GUIDE}\nWhen it returns a fault, correct the named field and call it again.`,
  parameters: Type.Object({
    kind: Type.Union(OBJECT_KINDS.map(k => Type.Literal(k))),
    title: Type.String({ maxLength: 60, description: 'What the object is, in a few words: Weekly activity, Idea to outcome. Not used for reply.' }),
    data: Type.Object({}, { additionalProperties: true, description: 'The object data, following the schema whose title is the kind. Schemas: ' + JSON.stringify(SCHEMAS) }),
    near: Type.Optional(Type.String({ description: 'An existing card or object id to place it beside.' })),
    below: Type.Optional(Type.String({ description: 'An existing card or object id to place it under, e.g. the reply.' })),
  }),
  execute: async (args, api) => {
    const id = boardOf(api); if (!id) return text('This conversation has no board.');
    const board = await loadBoard(id);
    const [w, h] = OBJECT_SIZE[args.kind] ?? [520, 360];
    const anchor = board?.cards.find(c => c.id === (args.below ?? args.near));
    const pos = anchor ? findSpace(board, w, h, args.below ? { x: anchor.x, y: anchor.y + anchor.h + 32 } : { x: anchor.x + anchor.w + 32, y: anchor.y }) : null;
    const result = await commit(id, { commands: [{ op: 'create', type: 'object', kind: args.kind, text: args.title ?? '', data: args.data, ref: 'o', ...(pos ?? {}) }, { op: 'focus', ids: ['$o'] }] }, { kind: 'agent', conversationId: String(api.conversationId ?? '') });
    if (!result.ok) throw new Error(`Nothing was placed. ${result.errors.map(e => e.reason).join('; ')}`);
    const meta = run.get(String(api.conversationId ?? '')); if (meta?.parent) { meta.placed = result.created.o; await atomicJson(runsPath, Object.fromEntries(run)); }
    return text({ ok: true, id: result.created.o });
  },
});
const reviseObject = defineTool({
  name: 'revise',
  description: 'Replaces an object with a newer version that stands where it stood; the person sees it was updated. data is the complete new data of the same kind. Use it for follow-ups that change something already made (a step added to the plan, a series added to the chart). Read the board first.',
  parameters: Type.Object({
    id: Type.String(),
    data: Type.Object({}, { additionalProperties: true }),
    title: Type.Optional(Type.String({ maxLength: 60 })),
  }),
  execute: async (args, api) => {
    const id = boardOf(api); if (!id) return text('This conversation has no board.');
    const result = await commit(id, { commands: [{ op: 'revise', id: args.id, data: args.data, ...(args.title ? { text: args.title } : {}) }, { op: 'focus', ids: [args.id] }] }, { kind: 'agent', conversationId: String(api.conversationId ?? '') });
    if (!result.ok) throw new Error(`Nothing changed. ${result.errors.map(e => e.reason).join('; ')}`);
    return text({ ok: true, id: args.id });
  },
});

// ---------- skills: how to do a kind of job, loaded on demand (names in the prompt, bodies by load_skill) ----------
// Built-ins ship with the app; the person's own in DATA/skills/<name>/SKILL.md override one of the same name.
const SKILL_DIRS = [join(DATA, 'skills'), join(dirname(new URL(import.meta.url).pathname), 'skills')];
async function skills() {
  const out = new Map();
  for (const root of [...SKILL_DIRS].reverse()) for (const name of await readdir(root).catch(() => [])) {
    const raw = await readFile(join(root, name, 'SKILL.md'), 'utf8').catch(() => null); if (!raw) continue;
    const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw); if (!fm) continue;
    const field = k => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm[1])?.[1]?.trim();
    if (!field('name') || !field('description')) continue;
    out.set(field('name'), { name: field('name'), description: field('description').slice(0, 200), body: fm[2].slice(0, 16000) });
  }
  return out;
}
const loadSkill = defineTool({
  name: 'load_skill',
  description: 'Loads a skill: how to do one kind of job well. Load the matching skill before you start that kind of job.',
  parameters: Type.Object({ name: Type.String() }),
  replay: 'safe',
  execute: async ({ name }) => {
    const all = await skills(); const sk = all.get(name);
    if (!sk) throw new Error(`no skill "${name}". Skills: ${[...all.keys()].join(', ')}`);
    return text(sk.body);
  },
});

// ---------- parts: a lead agent splits work into helpers, as Zephium's Work does ----------
// A part is a child conversation on the same board with one purpose. The lead's start_part waits for it to finish
// and gets back its digest. Several start_part calls in one turn run in parallel (tool execution is parallel).
const MAX_PARTS_AT_ONCE = 4;
let partsRunning = 0; const partQueue = [];
const partSlot = () => new Promise(r => { if (partsRunning < MAX_PARTS_AT_ONCE) { partsRunning++; r(); } else partQueue.push(r); });
const freeSlot = () => { const next = partQueue.shift(); if (next) next(); else partsRunning--; };
function waitForIdle(id, ms = 15 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const view = watching.get(id); if (!view) return reject(new Error('part is not running'));
    let seenRun = false;
    const timer = setTimeout(() => { off(); reject(new Error('part took too long')); }, ms);
    const check = () => {
      const v = view.value; const live = v?.docs?.['pi.live'];
      if (live?.run) { seenRun = true; return; }
      if (!seenRun && !(v?.entries ?? []).some(e => e.kind === 'pi.assistant' || e.kind === 'pi.error')) return;
      clearTimeout(timer); off(); resolve(summarise(id, v));
    };
    const off = view.subscribe(check); check();
  });
}
const startPart = defineTool({
  name: 'start_part',
  description: 'Starts a part: a helper agent that does one purpose of the job on its own (Research, Numbers, Copy, Images) and returns a digest of what it found or made, and the id of at most one object it placed. Start several in one turn to run them in parallel; at most four run at once and the rest wait. Build the result from the digests. A small question needs no parts.',
  parameters: Type.Object({
    title: Type.String({ maxLength: 24, description: 'The part\'s short name: Research, Numbers, Flow.' }),
    goal: Type.String({ maxLength: 200, description: 'What the part finds or does, shown to the person.' }),
    brief: Type.String({ maxLength: 2000, description: 'Every fact the helper needs and what to return.' }),
    model: Type.Optional(Type.String({ description: 'A model id for the helper, such as gpt-6.1-sol or claude-sonnet-5-5. Default: the lead\'s own model.' })),
  }),
  execute: async (args, api) => {
    const leadId = String(api.conversationId ?? ''); const lead = run.get(leadId);
    if (!lead) return text('This conversation has no board.');
    if (lead.parent) throw new Error('A part cannot start parts. Do the work yourself and call finish.');
    const pick = args.model ? modelList().find(m => m.modelId === args.model) : null;
    if (args.model && !pick) throw new Error(`no model ${args.model}. Use one of: ${modelList().map(m => m.modelId).join(', ')}`);
    await partSlot();
    try {
      const brief = `Part "${args.title}" of a bigger job. Goal: ${args.goal}\n\n${args.brief}`;
      const { id } = await spawnAgent({ boardId: lead.boardId, brief, model: pick ?? lead.model, statusModel: lead.statusModel, parent: leadId, title: args.title });
      const done = await waitForIdle(id);
      const meta = run.get(id) ?? {};
      return text({ part: args.title, id, digest: meta.digest ?? done.text ?? '', object: meta.placed ?? null, found: meta.found ?? !!(done.text), error: done.error });
    } finally { freeSlot(); }
  },
});
const finishPart = defineTool({
  name: 'finish',
  description: 'Ends your part and hands your digest to the lead. digest: the facts, numbers and findings the lead needs, at most 14 short lines, no prose. found: false only when you found nothing usable.',
  parameters: Type.Object({ summary: Type.String({ maxLength: 60 }), digest: Type.String({ maxLength: 3000 }), found: Type.Boolean() }),
  execute: async (args, api) => {
    const id = String(api.conversationId ?? ''); const meta = run.get(id);
    if (!meta?.parent) throw new Error('Only a part calls finish. Answer the person with objects instead.');
    Object.assign(meta, { digest: args.digest, summary: args.summary, found: args.found });
    await atomicJson(runsPath, Object.fromEntries(run));
    return text('Handed to the lead. Stop now.');
  },
});

const BoardExtension = defineExtension({
  name: 'aegis-board',
  tools: [readBoard, editBoard, createObject, reviseObject, startPart, finishPart, loadSkill],
  sections: [section('aegis-skills', async () => 'Skills (load the matching one with load_skill before that kind of job):\n' + [...(await skills()).values()].map(s => `- ${s.name}: ${s.description}`).join('\n'), { tag: false }), section('aegis', () => [
    'You are an agent inside Aegis, a minimal infinite canvas. The user brain-dumps; you sort it into a clear layout.',
    'If the board has a note badged "read me first" (or similar), follow it: it is the user\'s instructions for this board.',
    'Two ways to change the board. board_apply moves, groups and edits the person\'s own cards (notes, titles, todos, links) and makes board pieces: documents, shapes, swatches, collections and wireframe screens (its description lists each type and its props). create and revise place objects: typed results the app draws well (charts, sheets, diagrams, plans, lists, code, and a reply on top).',
    'A wireframe is a frame card with box, text and icon cards inside it, each with parent set to the frame id and placed within its bounds. A long write-up goes in a doc card with Markdown in props.body.',
    'When the person asks for a result (an answer, an analysis, a comparison, a chart, a flow, a plan), make objects, never imitate them with notes: no text bar charts, no boxes drawn from notes.',
    'What you make: the one result the person came for, plus a reply on top: a headline and one to three sentences that answer the request. The reply never restates an object beside it. Place the reply first, then each object below or beside it (below: the reply id).',
    'One object per purpose. Keep text short and exact; cells hold values, not sentences. On a follow-up, revise the objects it changes instead of adding copies.',
    'Honest results: show only what you found or know. Never invent numbers, sources or links. When values are your own knowledge or made up for a demo, say so in basis (and knowledge true) or in the reply.',
    'Sorting a brain dump: group related ideas under a title card, pull tasks into todo cards, connect related cards, and finish with a focus command on what you made.',
    'Big jobs: split independent work into parts with start_part, several in one turn so they run together; a part is one purpose, not one step. Build the result from their digests. A small question needs no parts.',
    'If you are a part (your first message says "Part"), work only toward its goal, place at most one object, then call finish with your digest. Never start parts.',
    'Australian English. Text outside tool calls is only a short status line; the person reads the board, so every answer goes into objects or cards.',
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
const statuses = new Map();
function activityOf(id, value) { return activityFromView(run.get(id), value); }
async function statusFor(id, activity) {
  const meta = run.get(id);
  return summariseStatus(activity, { fake: !!fake && meta?.model?.provider === 'fake', complete: async (systemPrompt, content) => {
    const ready = [];
    for (const m of modelList()) if (m.provider !== 'fake' && await credentials.read(m.provider)) ready.push(m);
    const choice = ready.find(m => m.provider === meta?.statusModel?.provider && m.modelId === meta?.statusModel?.modelId)
      ?? ready.find(m => /luna|haiku/.test(m.modelId));
    if (!choice) throw new Error('No status model available');
    const reply = await models.completeSimple(models.getModel(choice.provider, choice.modelId), {
      systemPrompt, messages: [{ role: 'user', timestamp: Date.now(), content }],
    }, { signal: AbortSignal.timeout(12000), maxTokens: 40 });
    return (reply.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('');
  } });
}
async function watchRun(conversation) {
  const key = String(conversation.id); if (watching.has(key)) return;
  const view = await conversation.viewState(context);
  watching.set(key, view);
  let last = '';
  const tracker = createStatusTracker({ summarise: activity => statusFor(key, activity), publish: status => {
    statuses.set(key, status); broadcast({ type: 'agent', ...summarise(key, view.value) });
  } });
  view.subscribe(value => {
    if (value.docs?.['pi.live']?.run) tracker.update(activityOf(key, value));
    else tracker.stop();
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
  const partial = live?.generation?.message?.content?.filter?.(c => c.type === 'text').map(c => c.text).join('') ?? '';
  const failed = entries.findLast(e => e.kind === 'pi.error' || e.kind === 'pi.unanswered');
  return { id, boardId: meta.boardId, brief: meta.brief, model: meta.model, statusModel: meta.statusModel, created: meta.created, status: live?.run ? statuses.get(id) ?? fallbackStatus(activityOf(id, value)) : meta.stopped ? 'Stopped' : 'Ready for your next request', running: !!live?.run, parent: meta.parent ?? null, title: meta.title ?? null, summary: meta.summary ?? null,
    step: tools.length ? `using ${tools.join(', ')}` : live?.run ? (partial ? 'writing' : 'thinking') : 'idle',
    text: (partial || answer).slice(-600), error: failed && !meta.stopped ? 'The run stopped. Check the model sign-in.' : null };
}
async function spawnAgent({ boardId, brief, model, statusModel, parent, title }) {
  if (!(await loadBoard(boardId))) throw new Error('no such board');
  const selection = model ?? modelList()[0];
  if (!selection) throw new Error('no models');
  const conversation = await harness.createConversation({ ownership: { kind: 'ownerless' }, agent: { model: { provider: selection.provider, modelId: selection.modelId } } }, context);
  const id = String(conversation.id);
  run.set(id, { boardId, brief: brief.slice(0, 2000), model: selection, statusModel, created: Date.now(), ...(parent ? { parent, title } : {}) });
  await atomicJson(runsPath, Object.fromEntries(run));
  await watchRun(conversation);
  await conversation.submit({ type: 'input', content: brief, requestId: randomUUID() }, context);
  return { id };
}
async function message(id, content) {
  const conversation = await harness.conversation(Number.isNaN(Number(id)) ? id : Number(id), context);
  if (!conversation || !run.has(String(id))) throw new Error('no such agent');
  const meta = run.get(String(id)); meta.brief = content.slice(0, 2000); meta.stopped = false; statuses.delete(String(id));
  await atomicJson(runsPath, Object.fromEntries(run));
  await watchRun(conversation);
  await conversation.submit({ type: 'input', content, requestId: randomUUID() }, context);
}
async function stop(id) {
  const conversation = await harness.conversation(Number.isNaN(Number(id)) ? id : Number(id), context);
  if (conversation) {
    const meta = run.get(String(id)); if (meta) meta.stopped = true;
    await conversation.abort(context);
    await atomicJson(runsPath, Object.fromEntries(run));
    const view = watching.get(String(id)); if (view) broadcast({ type: 'agent', ...summarise(String(id), view.value) });
  }
}
async function agents(boardId) {
  const out = [];
  for (const [id, meta] of run) if (!boardId || meta.boardId === boardId) {
    const conversation = await harness.conversation(Number.isNaN(Number(id)) ? id : Number(id), context);
    if (!conversation) continue;
    await watchRun(conversation);
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
  if (url.pathname === '/health') return send(res, 200, { ok: true, runtime: 'Pi Durable 1.3.0', ui: !!(await uiRoot()) });
  // The UI is public static files; data still needs the token, which the shell passes in the address.
  const uiPath = url.pathname.match(/^\/ui\/(.*)$/);
  if (uiPath && req.method === 'GET') return sendUi(req, res, uiPath[1]);
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
      const r = await libraryAction('createBoard', await body(req));
      return send(res, 200, await loadBoard(r.created));
    }
    if (p === '/library/duplicate' && m === 'POST') return send(res, 200, await libraryAction('duplicate', await body(req)));
    const deleting = p.match(/^\/boards\/([a-zA-Z0-9-]+)\/delete$/);
    if (deleting && m === 'POST') return send(res, 200, await libraryAction('delete', { id: deleting[1] }));
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
    if (p === '/link-preview' && m === 'GET') return send(res, 200, await linkPreview(url.searchParams.get('url')));
    if (p === '/assets' && m === 'POST') return send(res, 200, await saveAsset(req));
    if (p === '/ui-update' && m === 'GET') return send(res, 200, await ui.status());
    if (p === '/ui-update' && m === 'POST') { const b = await body(req); return send(res, 200, await ui.install(b.from ? { from: String(b.from) } : {})); }
    if (p === '/ui-update/rollback' && m === 'POST') return send(res, 200, await ui.rollback());
    if (p === '/agents' && m === 'GET') return send(res, 200, await agents(url.searchParams.get('board')));
    if (p === '/agents' && m === 'POST') {
      const { boardId, brief, model, statusModel, count } = await body(req);
      const n = Math.min(8, Math.max(1, Number(count) || 1)); const out = [];
      for (let i = 0; i < n; i++) out.push(await spawnAgent({ boardId, brief: String(brief ?? '').trim() || 'Sort this board.', model, statusModel }));
      return send(res, 200, out);
    }
    const am = p.match(/^\/agents\/([a-zA-Z0-9-]+)\/(message|stop)$/);
    if (am && m === 'POST') { if (am[2] === 'stop') await stop(am[1]); else await message(am[1], String((await body(req)).content ?? '')); return send(res, 200, { ok: true }); }
    if (p === '/models') return send(res, 200, modelList());
    if (p === '/rewrite' && m === 'POST') return send(res, 200, await rewriteText(await body(req)));
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
server.listen(PORT, '127.0.0.1', async () => {
  // The shell reads this line to learn the port, and whether an installed UI should replace the bundled one.
  console.log(JSON.stringify({ aegis: 'ready', port: server.address().port, ui: !!(await uiRoot()), token: process.env.AEGIS_PRINT_TOKEN ? TOKEN : undefined }));
});
async function shutdown() { server.close(); await harness.close(context).catch(() => {}); process.exit(0); }
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
// The app holds our stdin open. When the app dies, even by force, stdin closes and the host follows it.
if (process.env.AEGIS_PARENT_PIPE) { process.stdin.on('end', shutdown); process.stdin.on('error', shutdown); process.stdin.resume(); }
export { fake };
