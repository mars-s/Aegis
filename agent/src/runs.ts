import { z } from 'zod/v4';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as context, withAbortSignal } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import type { TSchema, Model } from '@earendil-works/pi-ai';
import { Harness, createRegistry, defineExtension, defineTool, section } from '@earendil-works/pi-durable';
import type { Conversation, ConversationId, Cursor, EntryRecord, ToolExecutionApi, ToolExecutionResult, ToolRegistration } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import type { Board } from '@aegis/domain/schema';
import { JsonRecordSchema } from '@aegis/domain/schema';
import { cardTypeGuide, findSpace } from '@aegis/domain/commands';
import { DATASET_LIMITS, MEASURES, BUCKETS, FILTER_OPS, parseCsv, profileDataset, queryDataset } from '@aegis/domain/dataset';
import { OBJECT_KINDS, OBJECT_GUIDE, OBJECT_SIZE, objectSchemas } from '@aegis/domain/objects';
import type { createBoards, CommitChange } from './boards.js';
import type { createProviders } from './providers.js';
import { PROFILE_GUIDANCE } from '@aegis/domain/profile';
import type { ProfileStore } from './profile.js';
import { ModelChoiceSchema } from './providers.js';
import { atomicJson, readJson, errorMessage } from './files.js';
import type { HostLifetime } from './lifetime.js';
import { ViewSchema, displayBrief, conversationFromView } from './transcript.js';
import { HistoryEntrySchema } from './history-schema.js';
import type { HistoryEntry } from './history-schema.js';
import { activityFromView, createStatusTracker, fallbackStatus, summariseStatus, createAgentRevisions, draftsFromView } from './status.js';
import type { Activity } from './status.js';
import { historyFromView, requestUndoCommands } from './history.js';

const RunMetaSchema = z.object({ boardId: z.string(), brief: z.string(), model: ModelChoiceSchema, statusModel: ModelChoiceSchema.optional(), created: z.number(), parent: z.string().optional(), title: z.string().optional(), parentRequestId: z.string().optional(), stopped: z.boolean().optional(), placed: z.string().optional(), digest: z.string().optional(), summary: z.string().optional(), found: z.boolean().optional() });
type RunMeta = z.output<typeof RunMetaSchema>;
export const SpawnSchema = RunMetaSchema.pick({ boardId: true, brief: true, model: true, statusModel: true, parent: true, title: true }).partial({ model: true }).extend({ selectedIds: z.array(z.string()).optional() });
type SpawnInput = z.output<typeof SpawnSchema>;
type MountedView = Awaited<ReturnType<Conversation['viewState']>>;
// Pi's passive ledger has a strict JSON boundary. Omit absent optional fields exactly as disk and SSE do.
function durableRecord(value: unknown) { const json: unknown = JSON.parse(JSON.stringify(value)); return JsonRecordSchema.parse(json); }
type LedgerEntry = HistoryEntry & { id: number };
const LedgerEntrySchema = HistoryEntrySchema.and(z.object({ id: z.number() }));
const ProfileSchema = z.object({ columns: z.array(z.object({ name: z.string(), kind: z.string(), empty: z.number() })) });


type AgentSnapshot = { id: string; boardId: string; brief: string; model: RunMeta['model']; statusModel: RunMeta['statusModel']; created: number; status: string; running: boolean; parent: string | null; title: string | null; summary: string | null; drafts: ReturnType<typeof draftsFromView>; step: string; turns: ReturnType<typeof conversationFromView>['turns']; text: string; partial: string; history: ReturnType<typeof historyFromView>; error: string | null; revision?: number };

export async function createRuns({ data: DATA, assets: ASSETS, agentRoot, boards, providers, profile, broadcast, timing, lifetime }: {
  data: string; assets: string; agentRoot: string; boards: ReturnType<typeof createBoards>;
  providers: Awaited<ReturnType<typeof createProviders>>; profile: ProfileStore; broadcast(event: unknown): void; timing(value: object): void; lifetime: HostLifetime;
}) {
  const { loadBoard, commit, historyBoards } = boards;
  const { credentials, models, fake, modelList } = providers;
  const ids = new Map<string, ConversationId>();
  async function conversationOf(id: string) { const known = ids.get(id); return known === undefined ? undefined : harness.conversation(known, context); }
  function boardTool<T extends TSchema>(definition: ToolRegistration<T>) {
    return defineTool({ ...definition, execute: async (args, api, invocation) => {
      const startedAt = Date.now(), started = performance.now();
      try {
        const result = await definition.execute(args, api, invocation);
        if (process.env.AEGIS_PROFILE_TOOLS) timing({ kind: 'tool', name: definition.name, conversationId: String(api.conversationId ?? ''), startedAt, durationMs: performance.now() - started, outputBytes: Buffer.byteLength(JSON.stringify(result)) });
        return result;
      } catch (error) { timing({ kind: 'tool', name: definition.name, startedAt, durationMs: performance.now() - started, failed: true }); throw error; }
    } });
  }
const run = new Map<string, RunMeta>(); // conversation id -> { boardId, agentCard }
const boardOf = (api: ToolExecutionApi) => run.get(String(api.conversationId))?.boardId;
const text = (value: unknown): ToolExecutionResult => ({ output: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const Command = Type.Object({}, { additionalProperties: true, description: 'One board command, e.g. {"op":"create","type":"note","text":"..."}' });

// item 10: layout context omits document bodies, drawing paths and object datasets.
function compactBoard(board: Board, { ids, offset = 0, limit = 100, detail = false }: { ids?: readonly string[]; offset?: number; limit?: number; detail?: boolean } = {}) {
  const chosen = ids?.length ? board.cards.filter(c => ids.includes(c.id)) : board.cards;
  const cards = chosen.slice(offset, offset + limit);
  if (detail) return { id: board.id, name: board.name, rev: board.rev, cards, links: board.links, total: chosen.length, truncated: offset + cards.length < chosen.length };
  return { id: board.id, name: board.name, rev: board.rev, total: chosen.length, offset,
    cards: cards.map(c => ({ id: c.id, type: c.type, x: Math.round(c.x), y: Math.round(c.y), w: c.w, h: c.h,
      text: c.text.slice(0, /read me first/i.test(c.badge ?? '') ? 2000 : 120),
      ...(c.kind ? { kind: c.kind } : {}), ...(c.heading ? { heading: c.heading } : {}), ...(c.badge ? { badge: c.badge } : {}),
      ...(c.parent ? { parent: c.parent } : {}), ...(c.items ? { items: c.items.length } : {}),
      // A dataset carries its shape so the agent can plan queries without reading rows.
      ...(c.type === 'dataset' ? { dataset: { rows: c.props?.rows, columns: (ProfileSchema.safeParse(c.props?.profile).data?.columns ?? []).map(col => `${col.name}:${col.kind}${col.empty ? ` (${col.empty} blank)` : ''}`) } } : {}),
    })), links: board.links.map(({ a, b, label }) => ({ a, b, ...(label ? { label: label.slice(0, 80) } : {}) })),
    truncated: offset + cards.length < chosen.length,
  };
}
function boardInput(brief: string, board: Board, selectedIds: readonly string[] = []) {
  const summary = JSON.stringify(compactBoard(board));
  timing({ kind: 'context', summaryBytes: Buffer.byteLength(summary), cards: board.cards.length });
  // fix1: only the first content part is chat. Selection and board data stay model context.
  const selected = Array.isArray(selectedIds) ? board.cards.filter(c => selectedIds.includes(c.id)).map(c => c.id) : [];
  return [{ type: 'text' as const, text: brief },
    ...(selected.length ? [{ type: 'text' as const, text: `Work on the selected cards: ${selected.join(', ')}.` }] : []),
    { type: 'text' as const, text: 'Current board summary (use these ids directly; board_read is only needed for details or later changes):\n' + summary }];
  // end fix1
}
const layoutWork = (brief: string) => /\b(sort|tidy|organis[ez]|arrange|align|layout|lay out|clean up)\b/i.test(brief) && !/\b(research|analyse|analyze|investigate)\b/i.test(brief);
const layoutThinking = (brief: string, target: Model<string>) => layoutWork(brief) && target.reasoning && target.thinkingLevelMap?.low !== null ? 'low' as const : null;
// end item 10

// item 10: compact reads and immediate, atomic batches share the timing wrapper.
const readBoard = boardTool({
  name: 'board_read',
  description: 'Read a compact board summary: ids, types, positions, sizes and short text. The current summary is already in your first message, so use those ids without a read round trip. Use detail:true with ids to read full card content before changing it; offset and limit page through large boards.',
  parameters: Type.Object({ detail: Type.Optional(Type.Boolean()), ids: Type.Optional(Type.Array(Type.String(), { maxItems: 100 })), offset: Type.Optional(Type.Integer({ minimum: 0 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 400 })) }),
  replay: 'safe',
  execute: async (args, api) => {
    const id = boardOf(api); const b = id && await loadBoard(id);
    return b ? text(compactBoard(b, args)) : text('This conversation has no board.');
  },
});
const editBoard = boardTool({
  name: 'board_apply',
  description: [
    'Change the board with an ordered batch of commands, applied together or not at all (one undo step).',
    // item 10: one model round trip per meaningful step, including every move in that step.
    'Send ONE large batch per step, up to 500 commands. Put all moves, edits, creates, layout and focus in it. Independent tool calls in the same turn run in parallel; dependent creates use ref and "$name" in the same batch. Each successful batch is saved and sent to the canvas immediately.',
    'Ops: create {type, text, heading?, badge?, color?, x?, y?, w?, h?, rot?, items? (todo), url? (link/image/video/web; https: or asset:), group?, parent? (card id), props? (type-specific, listed below), near? (card id), ref? (name to reuse as "$name" later in the batch)};',
    'update {id, set: {text|heading|badge|color|x|y|w|h|rot|items|url|group|parent|props}} (props merges; a null value removes that key); move {id, x, y}; delete {id | ids}; connect {a, b, label?};',
    // item 11: spans share one grid and content fitting, rather than hand-picked window positions.
    'layout {ids, shape: grid|column|row, x?, y?, cols?, spans?, columns?, columnWidth?, gap?, fit?, pack?: rows|compact}. For a composed demo use shape:"grid", cols:12, a leading document spanning 6 columns, supports spanning 3 or 6, columnWidth:104, gap:24, fit:true, pack:"compact". Compact packing fills the highest free span, from the left. Optional columns gives one zero-based starting column per window, preserving focal and support columns. Rendered content heights repack the group. Content fitting refuses columns too narrow for their contents. order {ids, to: front|back|index} changes stacking; focus {ids} shows the result.',
    'A note with a heading and a badge such as "read me first" explains how the board works.',
    'Colors: plain gray blue green yellow orange red purple, or "#rrggbb". Omit x/y to let the board find free space. Titles label groups; put a title above each cluster.',
    'Basic types: note, title, todo, link, image, video, web. More types:\n' + cardTypeGuide(),
  ].join(' '),
  parameters: Type.Object({ commands: Type.Array(Command, { minItems: 1, maxItems: 500 }) }),
  execute: async (args, api) => {
    const id = boardOf(api); if (!id) return text('This conversation has no board.');
    const result = await commit(id, { commands: args.commands }, { kind: 'agent', conversationId: String(api.conversationId ?? '') });
    if (!result.ok) throw new Error(`Nothing changed. ${result.errors.map(e => `#${e.index}: ${e.reason}`).join('; ')}. ${result.errors[0]?.hint ?? ''}`);
    return text({ ok: true, rev: result.rev, created: result.created, ...(result.notes?.length ? { notes: result.notes } : {}) });
  },
});
// end item 10
// ---------- objects: Zephium-style typed results (create, revise) ----------
const SCHEMAS = objectSchemas();
// item 9: object guidance must never turn conversational replies into board content.
const REPLY_GUIDANCE = 'Chat lives in the island conversation, not on the board. Only create cards or objects when the person asked for content to keep on the board, such as a chart, document, plan or saved note. For "clean up this board", "tidy this board" or "what is on this board", edit or read the existing cards and answer in your final assistant text. Create zero new reply or note cards for those requests. A reply object is only for an explicit request to save an answer as a card. Never add a reply object as a preamble to other objects. Your final assistant text is the conversation reply.';
const conversationObjectGuide = OBJECT_GUIDE.split('\n').filter(line => !line.startsWith('- reply:')).join('\n') + '\n' + REPLY_GUIDANCE;
// item 9 end
const createObject = defineTool({
  name: 'create',
  // item 9
  description: `Places requested content on the board and returns its id: a chart, sheet, diagram, plan, list or code. The app draws and lays them out.\n${conversationObjectGuide}\nWhen it returns a fault, correct the named field and call it again.`,
  // item 9 end
  parameters: Type.Object({
    kind: Type.Union(OBJECT_KINDS.map(k => Type.Literal(k))),
    title: Type.String({ maxLength: 60, description: 'What the object is, in a few words: Weekly activity, Idea to outcome. Not used for reply.' }),
    data: Type.Object({}, { additionalProperties: true, description: 'The object data, following the schema whose title is the kind. Schemas: ' + JSON.stringify(SCHEMAS) }),
    near: Type.Optional(Type.String({ description: 'An existing card or object id to place it beside.' })),
    // item 9
    below: Type.Optional(Type.String({ description: 'An existing card or object id to place the requested content under.' })),
    // item 9 end
  }),
  execute: async (args, api) => {
    const id = boardOf(api); if (!id) return text('This conversation has no board.');
    const board = await loadBoard(id);
    const kind = z.enum(OBJECT_KINDS).parse(args.kind);
    const [w, h] = OBJECT_SIZE[kind];
    const anchor = board?.cards.find(c => c.id === (args.below ?? args.near));
    const pos = anchor ? findSpace(board ?? (() => { throw new Error('no such board'); })(), w, h, args.below ? { x: anchor.x, y: anchor.y + anchor.h + 32 } : { x: anchor.x + anchor.w + 32, y: anchor.y }) : null;
    const result = await commit(id, { commands: [{ op: 'create', type: 'object', kind: args.kind, text: args.title ?? '', data: args.data, ref: 'o', ...(pos ?? {}) }, { op: 'focus', ids: ['$o'] }] }, { kind: 'agent', conversationId: String(api.conversationId ?? '') });
    if (!result.ok) throw new Error(`Nothing was placed. ${result.errors.map(e => e.reason).join('; ')}`);
    const meta = run.get(String(api.conversationId ?? '')); if (meta?.parent) { meta.placed = result.created.o; await atomicJson(runsPath, Object.fromEntries(run)); }
    return text({ ok: true, id: result.created.o });
  },
});
// Datasets: the whole file is parsed once per asset and kept in memory, so every query is exact and fast.
const datasets = new Map<string, ReturnType<typeof parseCsv>>();
async function datasetOf(boardId: string, cardId: string) {
  const board = await loadBoard(boardId), card = board?.cards.find(c => c.id === cardId);
  if (!card || card.type !== 'dataset') throw new Error(`no dataset ${cardId}. Dataset windows on this board: ${board?.cards.filter(c => c.type === 'dataset').map(c => `${c.id} (${c.text})`).join(', ') || 'none'}`);
  const source = card.props?.src;
  const m = /^asset:([a-f0-9]{32}\.(?:csv|tsv))$/.exec(typeof source === 'string' ? source : '');
  const filename = m?.[1]; if (!filename) throw new Error('this dataset has no stored file');
  if (!datasets.has(filename)) {
    datasets.set(filename, parseCsv(await readFile(join(ASSETS, filename), 'utf8')));
    const oldest = datasets.keys().next().value; if (datasets.size > 8 && oldest !== undefined) datasets.delete(oldest);
  }
  const data = datasets.get(filename); if (!data) throw new Error('Dataset cache was not populated'); return { card, data };
}
const Filter = Type.Object({ column: Type.String(), op: Type.Union(FILTER_OPS.map(o => Type.Literal(o))), value: Type.Optional(Type.Any()) });
const dataQuery = boardTool({
  name: 'data_query',
  description: [
    'Runs an exact aggregate over EVERY row of a dataset window (an imported CSV) and returns the result rows. Use it for any figure you report or chart from a dataset; never estimate from the preview.',
    'profile:true returns each column\'s kind (number, date, text), gaps, range and top values; start with it. Otherwise: groupBy (one to three columns), bucket (day, week, month, quarter or year) to group the first groupBy date column by time,',
    `measures [{op: ${MEASURES.join('|')}, column, as?}] (count needs no column), filter [{column, op: ${FILTER_OPS.join('|')}, value}], sort {by, dir: asc|desc}, limit up to ${DATASET_LIMITS.resultRows}.`,
    'Several independent queries in one turn run in parallel. Results say how many rows matched and whether groups were cut off.',
  ].join(' '),
  parameters: Type.Object({
    dataset: Type.String({ description: 'The dataset window id.' }),
    profile: Type.Optional(Type.Boolean()),
    groupBy: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String(), { maxItems: 3 })])),
    bucket: Type.Optional(Type.Union(BUCKETS.map(b => Type.Literal(b)))),
    measures: Type.Optional(Type.Array(Type.Object({ op: Type.Union(MEASURES.map(m => Type.Literal(m))), column: Type.Optional(Type.String()), as: Type.Optional(Type.String({ maxLength: 40 })) }), { maxItems: 8 })),
    filter: Type.Optional(Type.Array(Filter, { maxItems: 10 })),
    sort: Type.Optional(Type.Object({ by: Type.String(), dir: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])) })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: DATASET_LIMITS.resultRows })),
  }),
  replay: 'safe',
  execute: async (args, api) => {
    const id = boardOf(api); if (!id) return text('This conversation has no board.');
    const { card, data } = await datasetOf(id, args.dataset);
    if (args.profile) return text({ dataset: card.text, ...profileDataset(data) });
    return text({ dataset: card.text, ...queryDataset(data, args) });
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
const SKILL_DIRS = [join(DATA, 'skills'), join(agentRoot, 'skills')];
async function skills() {
  const out = new Map<string, { name: string; description: string; body: string }>();
  for (const root of [...SKILL_DIRS].reverse()) for (const name of await readdir(root).catch(() => [])) {
    const raw = await readFile(join(root, name, 'SKILL.md'), 'utf8').catch(() => null); if (!raw) continue;
    const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw); if (!fm) continue;
    const field = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm[1] ?? '')?.[1]?.trim();
    const skillName = field('name'), description = field('description'); if (!skillName || !description) continue;
    out.set(skillName, { name: skillName, description: description.slice(0, 200), body: (fm[2] ?? '').slice(0, 16000) });
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
let partsRunning = 0; const partQueue: (() => void)[] = [];
const partSlot = (signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  if (partsRunning < MAX_PARTS_AT_ONCE) { partsRunning++; resolve(); return; }
  const grant = () => { signal?.removeEventListener('abort', aborted); resolve(); };
  const aborted = () => { const index = partQueue.indexOf(grant); if (index >= 0) partQueue.splice(index, 1); reject(signal?.reason ?? new Error('Part cancelled')); };
  partQueue.push(grant); signal?.addEventListener('abort', aborted, { once: true });
});
const freeSlot = () => { const next = partQueue.shift(); if (next) next(); else partsRunning--; };
function waitForIdle(id: string, signal?: AbortSignal, ms = 15 * 60 * 1000): Promise<ReturnType<typeof summarise>> {
  return lifetime.run(hostSignal => new Promise((resolve, reject) => {
    const view = watching.get(id); if (!view) { reject(new Error('part is not running')); return; }
    const cancellation = signal ? AbortSignal.any([hostSignal, signal]) : hostSignal;
    let seenRun = false, settled = false, unsubscribe = () => {};
    const finish = (result: { kind: 'done' } | { kind: 'error'; error: unknown }) => {
      if (settled) return; settled = true;
      clearTimeout(timer); unsubscribe(); cancellation.removeEventListener('abort', aborted);
      if (result.kind === 'error') reject(result.error); else resolve(summarise(id));
    };
    const aborted = () => finish({ kind: 'error', error: cancellation.reason ?? new Error('Part cancelled') });
    const timer = setTimeout(() => finish({ kind: 'error', error: new Error('part took too long') }), ms);
    const check = () => {
      const value = view.value, live = ViewSchema.parse(value).docs?.['pi.live'];
      if (live?.run) { seenRun = true; return; }
      if (!seenRun && !value.entries.some(entry => entry.kind === 'pi.assistant' || entry.kind === 'pi.error')) return;
      finish({ kind: 'done' });
    };
    cancellation.addEventListener('abort', aborted, { once: true });
    unsubscribe = view.subscribe(check);
    if (settled) unsubscribe();
    if (cancellation.aborted) aborted(); else check();
  }));
}
const startPart = defineTool({
  name: 'start_part',
  description: 'Starts a part: a helper agent that does one purpose of the job on its own (Research, Numbers, Copy, Images) and returns a digest of what it found or made, and the id of at most one object it placed. Start several in one turn to run them in parallel; at most four run at once and the rest wait. Build the result from the digests. A small question needs no parts.',
  parameters: Type.Object({
    title: Type.String({ maxLength: 24, description: 'The part\'s short name: Research, Numbers, Flow.' }),
    goal: Type.String({ maxLength: 200, description: 'What the part finds or does, shown to the person.' }),
    brief: Type.String({ maxLength: 2000, description: 'Every fact the helper needs and what to return.' }),
    model: Type.Optional(Type.String({ description: 'A model id for the helper, such as gpt-6.1-sol or sonnet. Default: the lead\'s own model.' })),
  }),
  execute: async (args, api, invocation) => {
    const leadId = String(api.conversationId ?? ''); const lead = run.get(leadId);
    if (!lead) return text('This conversation has no board.');
    if (lead.parent) throw new Error('A part cannot start parts. Do the work yourself and call finish.');
    const pick = args.model ? modelList().find(m => m.modelId === args.model) : null;
    if (args.model && !pick) throw new Error(`no model ${args.model}. Use one of: ${modelList().map(m => m.modelId).join(', ')}`);
    await partSlot(invocation.abortSignal);
    let partId: string | undefined;
    try {
      const brief = `Part "${args.title}" of a bigger job. Goal: ${args.goal}\n\n${args.brief}`;
      const { id } = await spawnAgent({ boardId: lead.boardId, brief, model: pick ?? lead.model, statusModel: lead.statusModel, parent: leadId, title: args.title });
      partId = id;
      const done = await waitForIdle(id, invocation.abortSignal);
      const meta = run.get(id);
      return text({ part: args.title, id, digest: meta?.digest ?? done.text ?? '', object: meta?.placed ?? null, found: meta?.found ?? !!(done.text), error: done.error });
    } catch (error) { if (partId) await stop(partId).catch(() => {}); throw error; }
    finally { freeSlot(); }
  },
});
const finishPart = defineTool({
  name: 'finish',
  description: 'Ends your part and hands your digest to the lead. digest: the facts, numbers and findings the lead needs, at most 14 short lines, no prose. found: false only when you found nothing usable.',
  parameters: Type.Object({ summary: Type.String({ maxLength: 60 }), digest: Type.String({ maxLength: 3000 }), found: Type.Boolean() }),
  execute: async (args, api) => {
    const id = String(api.conversationId ?? ''); const meta = run.get(id);
    // item 9
    if (!meta?.parent) throw new Error('Only a part calls finish. Answer the person in your final assistant text.');
    // item 9 end
    Object.assign(meta, { digest: args.digest, summary: args.summary, found: args.found });
    await atomicJson(runsPath, Object.fromEntries(run));
    return text('Handed to the lead. Stop now.');
  },
});

const updateProfile = defineTool({ name: 'profile_update', description: 'Merge what the person has told you into their local profile. Save only supplied information.',
  parameters: Type.Object(Object.fromEntries(['name', 'role', 'workflow', 'goals', 'canvasHelp', 'notes'].map(key => [key, Type.Optional(Type.String())]))),
  execute: async args => text(await profile.update(args)),
});
const BoardExtension = defineExtension({
  name: 'aegis-board',
  tools: [updateProfile, readBoard, editBoard, createObject, reviseObject, dataQuery, startPart, finishPart, loadSkill],
  sections: [section('aegis-profile', async () => `${PROFILE_GUIDANCE}\nSaved profile: ${JSON.stringify(await profile.read())}`, { tag: false }), section('aegis-skills', async () => 'Skills (load the matching one with load_skill before that kind of job):\n' + [...(await skills()).values()].map(s => `- ${s.name}: ${s.description}`).join('\n'), { tag: false }), section('aegis', () => [
    'You are an agent inside Aegis, a minimal infinite canvas. The user brain-dumps; you sort it into a clear layout.',
    'If the board has a note badged "read me first" (or similar), follow it: it is the user\'s instructions for this board.',
    // item 9
    'Two ways to change the board. board_apply moves, groups and edits the person\'s own cards (notes, titles, todos, links) and makes requested board pieces: documents, shapes, swatches, collections and wireframe screens. create and revise place requested objects: charts, sheets, diagrams, plans, lists and code.',
    REPLY_GUIDANCE,
    // item 9 end
    'A wireframe is a frame card with box, text and icon cards inside it, each with parent set to the frame id and placed within its bounds. A long write-up goes in a doc card with Markdown in props.body.',
    // item 9
    'When the person asks to create content (a chart, comparison, flow, document or plan), make the requested objects, never imitate them with notes: no text bar charts, no boxes drawn from notes. Questions, explanations, status reports and confirmations belong in conversation. Arrange requested objects beside or below existing content without a reply card.',
    // item 9 end
    'One object per purpose. Keep text short and exact; cells hold values, not sentences. On a follow-up, revise the objects it changes instead of adding copies.',
    // item 9
    'Honest results: show only what you found or know. Never invent numbers, sources or links. When values are your own knowledge or made up for a demo, say so in basis (and knowledge true) or in your conversation reply.',
    // item 9 end
    'Sorting a brain dump: group related ideas under a title card, pull tasks into todo cards, connect related cards, and finish with a focus command on what you made.',
    'Big jobs: split independent work into parts with start_part, several in one turn so they run together; a part is one purpose, not one step. Build the result from their digests. A small question needs no parts.',
    'If you are a part (your first message says "Part"), work only toward its goal, place at most one object, then call finish with your digest. Never start parts.',
    // item 9
    'Australian English. Give a useful final assistant answer in conversation. After editing the board, briefly explain what changed. For a question, answer it directly. Never save chat to the board unless the person explicitly asks.',
    // item 9 end
  ].join('\n'), { tag: false }),
  // item 11: layout guidance is deliberately separate from conversational reply policy.
  section('aegis-layout', () => [
    'Compose demos as one tidy block on a 12-column grid with 24px gutters. Load show-what-you-can-do for a demo.',
    'Create the whole composition with board_apply, refs and a final grid layout in ONE batch. Use spans to give each window the columns it needs, fit:true to size its height to content, and focus on the result.',
    'Give the composition one focal document or dashboard on the left, with compact supporting windows on the right. Use pack:"compact" for a 12-column grid with consistent gutters and measured content heights. Load show-what-you-can-do for the curated set. Your answer goes in the island chat. Create zero reply or note cards for the demo. If a span is too narrow, widen it or shorten the content, then retry the batch.',
    'The board summary arrives with the request. Read only missing details. Independent tools may run together, but every dependent edit belongs in the same batch using refs.',
  ].join('\n'), { tag: false })],
  // end item 11
});

const registry = createRegistry();
registry.install(BoardExtension);
const storage = await openNodeSqliteStorage(join(DATA, 'agents.sqlite'));
const harness = await Harness.open(storage, {
  models, registry,
  settings: { toolExecution: 'parallel', retry: { maxRetries: 1 }, stream: { maxRetries: 0, timeoutMs: 180000 } },
}, context);
lifetime.add(() => harness.close(context));
let cursor: Cursor | undefined;
do { const page = await harness.commit(tx => tx.scanConversations({}, 256, cursor), context); for (const record of page.items) ids.set(String(record.id), record.id); cursor = page.next; } while (cursor);
const runsPath = join(DATA, 'runs.json');
for (const [k, v] of Object.entries(z.record(z.string(), RunMetaSchema).parse(await readJson(runsPath, {})))) run.set(k, v);
// PM6 finding 1: reserve a range before resuming, so revisions survive a host restart.
const revisionPath = join(DATA, 'agent-revisions.json');
const revisionEpoch = z.number().int().nonnegative().parse(await readJson(revisionPath, 0)) + 1;
await atomicJson(revisionPath, revisionEpoch);
const agentRevisions = createAgentRevisions<AgentSnapshot>({ base: revisionEpoch * 2 ** 32 });
harness.resume();

// ---------- agent runs ----------
const watching = new Map<string, MountedView>();
const statuses = new Map<string, string>();
const watchRequests = new Map<string, Promise<void>>();
// Round 2 history: compaction trims the live view, so retain the full passive ledger.
const requestEntries = new Map<string, Map<number, LedgerEntry>>();
function historyEntriesOf(id: string, value: { entries?: readonly EntryRecord[] } = {}): LedgerEntry[] {
  if (!requestEntries.has(id)) requestEntries.set(id, new Map());
  const ledger = requestEntries.get(id) ?? new Map<number, LedgerEntry>();
  for (const entry of value.entries ?? []) if (entry.kind.startsWith('aegis.')) ledger.set(entry.id, LedgerEntrySchema.parse(entry));
  return [...ledger.values()].sort((a, b) => a.id - b.id);
}
// Round 2 history: reacquire pending receipts after a restart, using idempotent completion writes.
const endingRequests = new Set<string>();
function trackRequestEnds(conversation: Conversation, value: { entries: LedgerEntry[] }) {
  for (const entry of value.entries ?? []) {
    if (entry.kind !== 'aegis.request' || endingRequests.has(entry.data.requestId)) continue;
    const { requestId } = entry.data; endingRequests.add(requestId);
    if (value.entries.some(e => e.kind === 'aegis.request.end' && e.data.requestId === requestId)) continue;
    void lifetime.run(async signal => {
      const invocation = withAbortSignal(signal, context);
      const record = await conversation.commit(tx => tx.submissionByRequest(conversation.id, requestId), context);
      if (!record) return;
      const submission = await harness.submission(record.id, context);
      if (!submission) return; await submission.wait(invocation);
      await conversation.submit({ type: 'write', requestId: `history:end:${requestId}`, entry: { kind: 'aegis.request.end', data: { requestId, finished: Date.now() } } }, context);
    }).catch((error: unknown) => { endingRequests.delete(requestId); process.stderr.write(JSON.stringify({ aegis: 'history-error', requestId, message: errorMessage(error) }) + '\n'); });
  }
}
function activityOf(id: string, value: unknown) { return activityFromView(run.get(id), value); }
async function statusFor(id: string, activity: Activity) {
  const meta = run.get(id);
  return summariseStatus(activity, { fake: !!fake && meta?.model?.provider === 'fake', complete: async (systemPrompt, content) => {
    const ready = [];
    for (const m of modelList()) if (m.provider !== 'fake' && await credentials.read(m.provider)) ready.push(m);
    const choice = ready.find(m => m.provider === meta?.statusModel?.provider && m.modelId === meta?.statusModel?.modelId)
      ?? ready.find(m => /luna|haiku/.test(m.modelId));
    if (!choice) throw new Error('No status model available');
    const target = models.getModel(choice.provider, choice.modelId); if (!target) throw new Error('The status model is no longer available');
    const reply = await models.completeSimple(target, {
      systemPrompt, messages: [{ role: 'user', timestamp: Date.now(), content }],
    }, { signal: AbortSignal.timeout(12000), maxTokens: 40 });
    return (reply.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('');
  } });
}
async function watchRun(conversation: Conversation) {
  const key = String(conversation.id); if (watching.has(key)) return;
  if (!watchRequests.has(key)) watchRequests.set(key, attachRun(conversation).finally(() => watchRequests.delete(key)));
  await watchRequests.get(key);
}
async function attachRun(conversation: Conversation) {
  const key = String(conversation.id);
  const view = await conversation.viewState(context);
  let cursor: Cursor | undefined;
  do {
    const page = await conversation.entries({ order: 'ascending' }, 256, cursor, context);
    historyEntriesOf(key, { entries: page.items }); cursor = page.next;
  } while (cursor);
  watching.set(key, view); lifetime.add(() => { view.dispose(); watching.delete(key); });
  let last = 0;
  const tracker = createStatusTracker({ summarise: activity => statusFor(key, activity), publish: status => {
    statuses.set(key, status); broadcast({ type: 'agent', ...summarise(key) });
  } });
  const unsubscribe = view.subscribe(value => {
    trackRequestEnds(conversation, { entries: historyEntriesOf(key, value) });
    if (ViewSchema.parse(value).docs?.['pi.live']?.run) tracker.update(activityOf(key, value));
    else tracker.stop();
    const s = summarise(key);
    if (s.revision !== last) { last = s.revision; broadcast({ type: 'agent', ...s }); }
  });
  lifetime.add(() => { unsubscribe(); tracker.stop(); });
  trackRequestEnds(conversation, { entries: historyEntriesOf(key, view.value) });
}
function summarise(id: string): AgentSnapshot & { revision: number } {
  const value = watching.get(id)?.value;
  const live = ViewSchema.parse(value ?? {}).docs?.['pi.live']; const meta = run.get(id);
  if (!meta) throw new Error('No such agent');
  const entries = value?.entries ?? [];
  // item 9: retain complete final answers and chat history, not a truncated status excerpt.
  const conversation = conversationFromView(value ?? {});
  // item 9 end
  const tools = (live?.tools ?? []).map(t => t.name);
  const streaming = live?.generation?.message?.content;
  const partial = Array.isArray(streaming) ? streaming.filter(c => c.type === 'text').map(c => c.text).join('') : '';
  const failed = entries.findLast(e => e.kind === 'pi.error' || e.kind === 'pi.unanswered');
  // fix1: clean legacy briefs before every chat, title and activity display.
  return agentRevisions.snapshot(id, { id, boardId: meta.boardId, brief: displayBrief(meta.brief), model: meta.model, statusModel: meta.statusModel, created: meta.created, status: live?.run ? (Array.isArray(streaming) && streaming.some(c => c.type === 'toolCall' && c.name === 'board_apply') ? fallbackStatus(activityOf(id, value)) : statuses.get(id) ?? fallbackStatus(activityOf(id, value))) : meta.stopped ? 'Stopped' : 'Ready for your next request', running: !!live?.run, parent: meta.parent ?? null, title: meta.title ? displayBrief(meta.title) : null, summary: meta.summary ?? null,
    ...(() => { const drafts = live?.run ? draftsFromView(value) : [];
      return { drafts, step: tools.length ? `using ${tools.join(', ')}` : live?.run ? (drafts.length ? 'drafting' : partial ? 'writing' : 'thinking') : 'idle' }; })(),
    // item 9
    ...conversation, history: historyFromView({ entries: historyEntriesOf(id, value) }, historyBoards.get(meta.boardId)), error: failed && !meta.stopped ? 'The run stopped. Check the model sign-in.' : null });
    // item 9 end
}
async function spawnAgent({ boardId, brief, selectedIds, model, statusModel, parent, title }: SpawnInput) {
  // item 10: include compact context immediately and use low effort for mechanical layout work.
  const board = await loadBoard(boardId); if (!board) throw new Error('no such board');
  const choices = modelList();
  const ready = [];
  for (const choice of choices) if (await providers.isReady(choice.provider)) ready.push(choice);
  const selection = model ?? (layoutWork(brief) ? ready[0] : ready.find(m => /6\.1-sol|opus/.test(m.modelId)) ?? ready[0]) ?? choices[0];
  if (!selection) throw new Error('no models');
  const target = models.getModel(selection.provider, selection.modelId); if (!target) throw new Error('The selected model is no longer available');
  const level = layoutThinking(brief, target), thinking = level ? { thinkingLevel: level } : {};
  timing({ kind: 'policy', model: selection.modelId, thinkingLevel: level });
  const conversation = await harness.createConversation({ ownership: { kind: 'ownerless' }, agent: { model: { provider: selection.provider, modelId: selection.modelId }, ...thinking } }, context);
  const id = String(conversation.id); ids.set(id, conversation.id);
  run.set(id, { boardId, brief: brief.slice(0, 2000), model: selection, statusModel, created: Date.now(), ...(parent ? { parent, title,
    parentRequestId: historyEntriesOf(parent, watching.get(parent)?.value).findLast(e => e.kind === 'aegis.request')?.data.requestId } : {}) });
  await atomicJson(runsPath, Object.fromEntries(run));
  await watchRun(conversation);
  const requestId = randomUUID();
  await conversation.submit({ type: 'input', content: boardInput(brief, board, selectedIds), requestId,
    entry: { kind: 'aegis.request', data: { requestId, brief, started: Date.now() } } }, context);
  // end item 10
  return { id };
}
async function message(id: string, content: string, selectedIds?: readonly string[]) {
  const conversation = await conversationOf(id);
  if (!conversation || !run.has(String(id))) throw new Error('no such agent');
  const meta = run.get(String(id)); if (!meta) throw new Error('no such agent'); meta.brief = content.slice(0, 2000); meta.stopped = false; statuses.delete(String(id));
  await atomicJson(runsPath, Object.fromEntries(run));
  await watchRun(conversation);
  // item 10: follow-ups also receive the latest revision, so they need no speculative board_read.
  const board = await loadBoard(meta.boardId);
  const target = models.getModel(meta.model.provider, meta.model.modelId); if (!target) throw new Error('The selected model is no longer available');
  await conversation.configure({ thinkingLevel: layoutThinking(content, target) }, context);
  const requestId = randomUUID();
  await conversation.submit({ type: 'input', content: board ? boardInput(content, board, selectedIds) : content, requestId,
    entry: { kind: 'aegis.request', data: { requestId, brief: content, started: Date.now() } } }, context);
  // end item 10
}
async function stop(id: string) {
  const conversation = await conversationOf(id);
  if (conversation) {
    const meta = run.get(String(id)); if (meta) meta.stopped = true;
    await conversation.abort(context);
    await atomicJson(runsPath, Object.fromEntries(run));
    if (watching.has(String(id))) broadcast({ type: 'agent', ...summarise(String(id)) });
  }
}
async function agents(boardId: string | null) {
  const out = [];
  // Round 3 Undo: refresh saved field values after a host restart too.
  for (const id of new Set([...run.values()].filter(meta => !boardId || meta.boardId === boardId).map(meta => meta.boardId))) await loadBoard(id);
  for (const [id, meta] of run) if (!boardId || meta.boardId === boardId) {
    const conversation = await conversationOf(id);
    if (!conversation) continue;
    await watchRun(conversation);
    // PM6 finding 1: a second view may lag behind completion already seen by the watcher.
    out.push(summarise(id));
  }
  return out;
}

// Round 2 history: one host commit, also observed by the UI's normal undo history.
async function undoRequest(id: string, requestId: string) {
  const conversation = await conversationOf(id), meta = run.get(id);
  if (!conversation || !meta) throw new Error('No such agent');
  const value = watching.get(id)?.value;
  const entries = historyEntriesOf(id, value);
  const entry = historyFromView({ entries }).find(e => e.id === requestId);
  if (!entry?.canUndo) throw new Error('This request has no changes to undo');
  if (ViewSchema.parse(value).docs?.['pi.live']?.run) throw new Error('Wait for this agent to finish before undoing its changes');
  const board = await loadBoard(meta.boardId);
  if (!board) throw new Error('no such board');
  const commands = requestUndoCommands(board, entries, requestId);
  const result = await commit(meta.boardId, { commands }, { kind: 'agent', conversationId: id, undoRequest: requestId }, board.rev);
  if (!result.ok) throw new Error(result.errors[0]?.reason ?? 'Nothing changed');
  await conversation.submit({ type: 'write', requestId: `history:undo:${requestId}`, entry: { kind: 'aegis.request.undo', data: { requestId, at: Date.now() } } }, context);
  return result;
}


  async function record({ boardId, board, next, patch, author, batch }: CommitChange): Promise<void> {
    const before = new Map(board.cards.map(card => [card.id, card]));
    if (author.kind === 'agent' && !author.undoRequest) {
      const conversation = await conversationOf(String(author.conversationId));
      const request = historyEntriesOf(String(author.conversationId), watching.get(String(author.conversationId))?.value).findLast(e => e.kind === 'aegis.request');
      if (conversation && request) {
        const changed = new Set([...patch.cards.map(c => c.id), ...patch.removed]);
        const data = {
          before: { cards: board.cards.filter(c => changed.has(c.id)), removed: patch.cards.filter(c => !before.has(c.id)).map(c => c.id),
            ...(patch.links ? { links: board.links } : {}), ...(patch.order ? { order: board.cards.map(c => c.id) } : {}),
            fields: Object.fromEntries(Object.keys(patch.fields).map(k => [k, board[k] ?? null])) }, after: patch,
        };
        const targets: [Conversation, string][] = [[conversation, request.data.requestId]], meta = run.get(String(author.conversationId));
        // A delegated change also belongs to the person's original request.
        if (meta?.parentRequestId && meta.parent) {
          const parent = await conversationOf(meta.parent);
          if (parent) targets.push([parent, meta.parentRequestId]);
        }
        for (const [target, requestId] of targets) await target.submit({ type: 'write', requestId: `history:batch:${boardId}:${next.rev}`,
          entry: { kind: 'aegis.change', data: durableRecord({ requestId, ...data }) } }, context);
      }
    } else if (batch.commands.every(cmd => ['measure', 'initialise_html'].includes(cmd.op)) && patch.cards.length) {
      // Save automatic geometry and initial widget defaults in the request after-state.
      // Keep only derived fields in this passive ledger, never later user content.
      const canonical = ({ id, x, y, h, kind, data }: Board['cards'][number]) => ({ id, x, y, h, ...(kind === 'html' ? { data: data.state === undefined ? {} : { state: data.state } } : {}) });
      const data = { before: { cards: board.cards.filter(c => patch.cards.some(card => card.id === c.id)).map(canonical) }, after: { cards: patch.cards.map(canonical) } };
      for (const [id, meta] of run) if (meta.boardId === boardId) {
        const conversation = await conversationOf(id);
        if (conversation) await conversation.submit({ type: 'write', requestId: `history:normalise:${boardId}:${next.rev}`,
          entry: { kind: 'aegis.normalise', data: durableRecord(data) } }, context);
      }
    }

  }
  return { spawnAgent, message, stop, agents, undoRequest, record,
    refreshAgents(boardId: string): void { for (const id of watching.keys()) if (run.get(id)?.boardId === boardId) broadcast({ type: 'agent', ...summarise(id) }); },
  };
}
