import { z } from 'zod/v4';
import type { LegacyBoard, LegacyCard } from '@aegis/domain/schema';
import { BoardIdSchema, CardIdSchema, LinkIdSchema, LegacyCardSchema, RevisionSchema } from '@aegis/domain/schema';
import type { StoredLibrary } from '@aegis/protocol/storage';

const parent = z.string().nullable().optional();
export const LibraryOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), kind: z.string(), name: z.unknown().optional(), parent }),
  z.object({ op: z.literal('rename'), id: z.string(), name: z.unknown().optional() }),
  z.object({ op: z.literal('cover'), id: z.string(), cover: z.unknown().optional() }),
  z.object({ op: z.literal('move'), id: z.string(), parent, boardParent: parent, at: z.object({ x: z.number(), y: z.number() }).optional() }),
  z.object({ op: z.literal('delete'), id: z.string(), recursive: z.boolean().optional() }),
]);
export type LibraryOperation = z.output<typeof LibraryOperationSchema>;
type LibraryResult = { ok: true; library: StoredLibrary; created?: string } | { ok: false; error: string };
interface LibraryChange { library: StoredLibrary; boards: LegacyBoard[]; created?: string | undefined; removed?: string[] }
type BoardPlacement = { id: string; parent?: string | null | undefined; boardParent?: string | null | undefined; at?: { x: number; y: number } | undefined };
type NewBoard = { name?: unknown; parent?: string | null | undefined; boardParent?: string | null | undefined; at?: { x: number; y: number } | undefined };
export interface LibraryIO {
  listBoards(): Promise<{ id: string }[]>;
  loadBoard(id: string): Promise<LegacyBoard | null>;
  withBoard<T>(id: string, task: () => Promise<T>): Promise<T>;
  newBoard(id: string, name: string): LegacyBoard;
  makeId(): string;
  readLibrary(): Promise<StoredLibrary>;
  writeLibrary(library: StoredLibrary): Promise<void>;
  writeBoard(board: LegacyBoard): Promise<void>;
  removeBoard(id: string): Promise<void>;
  changed(): void;
}
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// The Library: projects and folders that hold boards. Pure rules over plain data, so they are easy to check.
// Shape: { nodes: [{ id, kind: 'project' | 'folder', name, parent }], boards: { [boardId]: parentNodeId } }
// Projects sit at the top. Folders sit in a project or another folder. Boards sit anywhere, or loose (no entry).

export const emptyLibrary = (): StoredLibrary => ({ nodes: [], boards: {} });

const name = (v: unknown) => String(v ?? '').trim().slice(0, 120);
function uniqueName(base: string, items: readonly { name: string }[]) {
  let value = base, suffix = 2;
  while (items.some(item => item.name === value)) value = `${base} ${suffix++}`;
  return value;
}
function newId(lib: StoredLibrary) {
  let id = '';
  do id = 'n' + Math.random().toString(36).slice(2, 10); while (lib.nodes.some(n => n.id === id));
  return id;
}
// Is `id` the node `root` or somewhere below it?
function within(lib: StoredLibrary, id: string | null, root: string) {
  for (let cur = id, hops = 0; cur && hops < 1000; hops++) {
    if (cur === root) return true;
    cur = lib.nodes.find(n => n.id === cur)?.parent ?? null;
  }
  return false;
}

// Apply one operation. Returns { ok, library, created? } or { ok: false, error }. The input is never mutated.
export function applyLibraryOp(input: StoredLibrary | null, op: LibraryOperation, boardIds: string[] = []): LibraryResult {
  const lib = structuredClone(input ?? emptyLibrary());
  const node = (id: string) => lib.nodes.find(n => n.id === id);
  const fail = (error: string): LibraryResult => ({ ok: false, error });
  const checkParent = (kind: string, parent: string | null) => {
    if (kind === 'project') return parent ? 'projects live at the top level' : null;
    if (parent == null) return null;
    return node(parent) ? null : `no project or folder ${parent}`;
  };
  switch (op?.op) {
    case 'create': {
      if (op.kind !== 'project' && op.kind !== 'folder') return fail('kind must be project or folder');
      const parent = op.kind === 'project' ? null : op.parent ?? null;
      const bad = checkParent(op.kind, parent); if (bad) return fail(bad);
      const id = newId(lib);
      const base = name(op.name) || (op.kind === 'project' ? 'New project' : 'New folder');
      lib.nodes.push({ id, kind: op.kind, name: uniqueName(base, lib.nodes.filter(n => n.parent === parent)), parent });
      return { ok: true, library: lib, created: id };
    }
    case 'rename': {
      const n = node(op.id); if (!n) return fail(`no project or folder ${op.id}`);
      if (!name(op.name)) return fail('a name is needed');
      n.name = name(op.name); return { ok: true, library: lib };
    }
    case 'cover': {
      const n = node(op.id); if (!n || n.kind !== 'project') return fail('covers belong to projects');
      if (op.cover == null) delete n.cover;
      else {
        if (typeof op.cover !== 'string' || op.cover.length > 8 * 1024 * 1024 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(op.cover)) return fail('choose a JPEG project cover');
        n.cover = op.cover;
      }
      return { ok: true, library: lib };
    }
    case 'move': {
      const parent = op.parent ?? null;
      if (boardIds.includes(op.id)) {
        if (parent != null && !node(parent)) return fail(`no project or folder ${parent}`);
        if (parent == null) delete lib.boards[op.id]; else lib.boards[op.id] = parent;
        return { ok: true, library: lib };
      }
      const n = node(op.id); if (!n) return fail(`nothing called ${op.id}`);
      const bad = checkParent(n.kind, parent); if (bad) return fail(bad);
      if (parent && within(lib, parent, n.id)) return fail('a folder cannot go inside itself');
      n.parent = parent; return { ok: true, library: lib };
    }
    case 'delete': {
      const n = node(op.id); if (!n) return fail(`no project or folder ${op.id}`);
      const busy = lib.nodes.some(x => x.parent === n.id) || Object.values(lib.boards).includes(n.id);
      if (busy) return fail(`${n.name} is not empty. Move or delete what is inside first.`);
      lib.nodes = lib.nodes.filter(x => x.id !== n.id); return { ok: true, library: lib };
    }
    default: return fail('op must be create, rename, cover, move or delete');
  }
}

// Drop placements for boards that no longer exist or point at missing nodes.
export function tidyLibrary(lib: StoredLibrary | null, boardIds: readonly string[]): StoredLibrary {
  const out = structuredClone(lib ?? emptyLibrary());
  for (const [b, parent] of Object.entries(out.boards)) if (!boardIds.includes(b) || !out.nodes.some(n => n.id === parent)) delete out.boards[b];
  return out;
}

// Include both library descendants and canvases nested beneath any selected board.
export function libraryContents(lib: StoredLibrary, boards: readonly LegacyBoard[], id: string) {
  const nodes = new Set(lib.nodes.filter(n => within(lib, n.id, id)).map(n => n.id));
  const ids = new Set<string>(boards.filter(b => b.id === id || nodes.has(lib.boards[b.id] ?? '')).map(b => b.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of boards) if (ids.has(b.parent ?? '') && !ids.has(b.id)) { ids.add(b.id); grew = true; }
  }
  return { nodes, boards: ids };
}

export function duplicateLibrary(input: StoredLibrary, boards: readonly LegacyBoard[], id: string, makeId: () => string): LibraryChange {
  const lib = structuredClone(input);
  const root = lib.nodes.find(n => n.id === id) ?? boards.find(b => b.id === id);
  if (!root) throw new Error('That library item no longer exists.');
  const contents = libraryContents(lib, boards, id);
  const remap = new Map([...contents.nodes, ...contents.boards].map(old => [old, makeId()]));
  const usedNames = [...lib.nodes, ...boards].map(n => n.name);
  let copyName = `${root.name} copy`, suffix = 2;
  while (usedNames.includes(copyName)) copyName = `${root.name} copy ${suffix++}`;
  for (const n of input.nodes.filter(n => contents.nodes.has(n.id))) {
    const copied = structuredClone(n); copied.id = remap.get(n.id) ?? n.id; copied.name = n.id === id ? copyName : n.name; copied.parent = remap.get(n.parent ?? '') ?? n.parent; lib.nodes.push(copied);
  }
  const copies = boards.filter(b => contents.boards.has(b.id)).map(b => {
    const copy = structuredClone(b), allCards = [...copy.cards, ...(copy.tray ?? []).flatMap(value => { const result = LegacyCardSchema.safeParse(value); return result.success ? [result.data] : []; })];
    if (copy.tray) { const trayIds = new Set(allCards.slice(copy.cards.length).map(c => c.id)); copy.tray = copy.tray.map(value => { const parsed = LegacyCardSchema.safeParse(value); return parsed.success && trayIds.has(parsed.data.id) ? allCards.find(c => c.id === parsed.data.id) ?? value : value; }); }
    const cards = new Map(allCards.filter(c => c && typeof c === 'object').map(c => [c.id, makeId()]));
    const groups = new Map(allCards.filter(c => c?.group).map(c => [c.group, makeId()]));
    copy.id = BoardIdSchema.parse(remap.get(b.id) ?? b.id); copy.rev = RevisionSchema.parse(0);
    if (b.id === id) copy.name = copyName;
    if (b.parent) copy.parent = BoardIdSchema.parse(remap.get(b.parent) ?? b.parent);
    // Duplicating one nested board creates a standalone sibling in its library folder.
    if (b.id === id) delete copy.parent;
    for (const c of allCards.filter(c => c && typeof c === 'object')) {
      if (c.group) c.group = groups.get(c.group) ?? c.group;
      c.id = CardIdSchema.parse(cards.get(c.id) ?? c.id);
      if (c.parent) c.parent = CardIdSchema.parse(cards.get(c.parent) ?? c.parent);
      if (c.props) {
        for (const key of ['parent', 'group', 'frame', 'colOf', 'onFrame']) { const value = c.props[key]; if (typeof value === 'string' && cards.has(CardIdSchema.parse(value))) c.props[key] = cards.get(CardIdSchema.parse(value)) ?? value; }
        if (Array.isArray(c.props.kids)) c.props.kids = c.props.kids.map(k => CardIdSchema.parse(cards.get(k) ?? k));
        if (c.type === 'canvas' && typeof c.props.board === 'string' && remap.has(c.props.board)) c.props.board = remap.get(c.props.board) ?? c.props.board;
      }
    }
    for (const link of copy.links) { link.id = LinkIdSchema.parse(makeId()); link.a = CardIdSchema.parse(cards.get(link.a) ?? link.a); link.b = CardIdSchema.parse(cards.get(link.b) ?? link.b); }
    if (copy.focus) delete copy.focus;
    const parent = input.boards[b.id];
    if (parent) lib.boards[copy.id] = remap.get(parent) ?? parent;
    return copy;
  });
  return { library: lib, boards: [...boards, ...copies], created: remap.get(id) };
}

function unhook(boards: readonly LegacyBoard[], id: string) {
  return boards.map(b => {
    const gone = new Set(b.cards.filter(c => c.type === 'canvas' && c.props?.board === id).map(c => c.id));
    if (!gone.size) return b;
    const next = structuredClone(b); next.rev = RevisionSchema.parse(b.rev + 1); next.cards = b.cards.filter(c => !gone.has(c.id)); next.links = b.links.filter(l => !gone.has(l.a) && !gone.has(l.b)); return next;
  });
}

export function deleteLibrary(input: StoredLibrary, boards: readonly LegacyBoard[], id: string): LibraryChange {
  if (!input.nodes.some(n => n.id === id) && !boards.some(b => b.id === id)) throw new Error('That library item no longer exists.');
  const contents = libraryContents(input, boards, id);
  const lib = structuredClone(input);
  lib.nodes = lib.nodes.filter(n => !contents.nodes.has(n.id));
  for (const bid of contents.boards) delete lib.boards[bid];
  let remaining = boards.filter(b => !contents.boards.has(b.id));
  for (const bid of contents.boards) remaining = unhook(remaining, bid);
  return { library: lib, boards: remaining, removed: [...contents.boards] };
}

export function moveLibraryBoard(input: StoredLibrary, boards: readonly LegacyBoard[], { id, parent = null, boardParent = null, at }: BoardPlacement, makeId: () => string): LibraryChange {
  const board = boards.find(b => b.id === id);
  if (!board) throw new Error('That board no longer exists.');
  if (boardParent && libraryContents(input, boards, id).boards.has(boardParent)) throw new Error('A board cannot go inside itself or a child canvas.');
  const into = boardParent && boards.find(b => b.id === boardParent);
  if (boardParent && !into) throw new Error('The destination board no longer exists.');
  const lib = structuredClone(input);
  if (parent && !lib.nodes.some(n => n.id === parent)) throw new Error('The destination folder no longer exists.');
  let next = unhook(boards, id).map(b => { if (b.id !== id) return b; const changed = structuredClone(b); changed.parent = boardParent ? BoardIdSchema.parse(boardParent) : null; changed.rev = RevisionSchema.parse(b.rev + 1); return changed; });
  const scope = into ? lib.boards[into.id] : parent;
  for (const bid of libraryContents(lib, boards, id).boards) {
    if (scope) lib.boards[bid] = scope; else delete lib.boards[bid];
  }
  if (into) next = next.map(b => {
    if (b.id !== into.id) return b;
    const next = structuredClone(b); next.rev = RevisionSchema.parse(b.rev + 1);
    const card: LegacyCard = { id: CardIdSchema.parse(makeId()), type: 'canvas', text: board.name, x: at && Number.isFinite(at.x) ? at.x : b.cards.length ? Math.max(...b.cards.map(c => (c.x ?? 0) + (c.w ?? 0))) + 60 : 0, y: at && Number.isFinite(at.y) ? at.y : 0, w: 260, h: 180, color: 'plain', props: { board: id } };
    next.cards.push(card); return next;
  });
  return { library: lib, boards: next };
}

// Serialise library changes and lock boards while reading and writing the operation's snapshot.
export function createLibraryActions(io: LibraryIO) {
  let chain: Promise<unknown> = Promise.resolve();
  return (action: 'duplicate' | 'delete' | 'createBoard' | 'change', payload: LibraryOperation | NewBoard | { id: string }) => {
    const task = chain.then(async () => {
      const listed = (await io.listBoards()).sort((a, b) => a.id.localeCompare(b.id));
      const locked = async (i: number): Promise<{ ok: true; created: string | null; removed: string[]; nextBoard: string }> => {
        const item = listed[i]; if (item) return io.withBoard(item.id, () => locked(i + 1));
        const boards = (await Promise.all(listed.map(b => io.loadBoard(b.id)))).filter((board): board is LegacyBoard => board !== null);
        const lib = tidyLibrary(await io.readLibrary(), boards.map(b => b.id));
        let result: LibraryChange;
        if (action === 'duplicate') result = duplicateLibrary(lib, boards, z.object({ id: z.string() }).parse(payload).id, io.makeId);
        else if (action === 'delete') result = deleteLibrary(lib, boards, z.object({ id: z.string() }).parse(payload).id);
        else if (action === 'createBoard') {
          const creation = z.object({ name: z.unknown().optional(), parent, boardParent: parent, at: z.object({ x: z.number(), y: z.number() }).optional() }).parse(payload);
          const siblings = boards.filter(b => (b.parent ?? null) === (creation.boardParent ?? null) && (lib.boards[b.id] ?? null) === (creation.parent ?? null));
          const b = io.newBoard(io.makeId(), uniqueName(name(creation.name) || 'Untitled', siblings));
          result = { library: lib, boards: [...boards, b], created: b.id };
          if (creation.boardParent || creation.parent) result = { ...moveLibraryBoard(lib, result.boards, { id: b.id, parent: creation.parent, boardParent: creation.boardParent, at: creation.at }, io.makeId), created: b.id };
        } else if ('op' in payload && payload.op === 'move' && boards.some(b => b.id === payload.id)) result = moveLibraryBoard(lib, boards, payload, io.makeId);
        else {
          const r = applyLibraryOp(lib, LibraryOperationSchema.parse(payload), boards.map(b => b.id));
          if (!r.ok) throw new Error(r.error);
          result = { library: r.library, boards, created: r.created };
        }
        if (!result.boards.length) result.boards.push(io.newBoard(io.makeId(), 'First board'));
        for (const b of result.boards) {
          if (JSON.stringify(b) !== JSON.stringify(boards.find(old => old.id === b.id))) await io.writeBoard(b);
        }
        await io.writeLibrary(result.library);
        for (const b of boards) if (!result.boards.some(next => next.id === b.id)) await io.removeBoard(b.id);
        io.changed();
        return { ok: true, created: result.created ?? null, removed: result.removed ?? [], nextBoard: result.boards[0]?.id ?? '' };
      };
      return locked(0);
    }).catch((error: unknown) => { throw Object.assign(error instanceof Error ? error : new Error(String(error)), { status: 400 }); });
    chain = task.catch(() => {});
    return task;
  };
}
