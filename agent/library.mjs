// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// The Library: projects and folders that hold boards. Pure rules over plain data, so they are easy to check.
// Shape: { nodes: [{ id, kind: 'project' | 'folder', name, parent }], boards: { [boardId]: parentNodeId } }
// Projects sit at the top. Folders sit in a project or another folder. Boards sit anywhere, or loose (no entry).

export const emptyLibrary = () => ({ nodes: [], boards: {} });

const name = v => String(v ?? '').trim().slice(0, 120);
function uniqueName(base, items) {
  let value = base, suffix = 2;
  while (items.some(item => item.name === value)) value = `${base} ${suffix++}`;
  return value;
}
function newId(lib) {
  let id;
  do id = 'n' + Math.random().toString(36).slice(2, 10); while (lib.nodes.some(n => n.id === id));
  return id;
}
// Is `id` the node `root` or somewhere below it?
function within(lib, id, root) {
  for (let cur = id, hops = 0; cur && hops < 1000; hops++) {
    if (cur === root) return true;
    cur = lib.nodes.find(n => n.id === cur)?.parent ?? null;
  }
  return false;
}

// Apply one operation. Returns { ok, library, created? } or { ok: false, error }. The input is never mutated.
export function applyLibraryOp(input, op, boardIds = []) {
  const lib = structuredClone(input ?? emptyLibrary());
  const node = id => lib.nodes.find(n => n.id === id);
  const fail = error => ({ ok: false, error });
  const checkParent = (kind, parent) => {
    if (kind === 'project') return parent ? 'projects live at the top level' : null;
    if (parent == null) return null;
    return node(parent) ? null : `no project or folder ${parent}`;
  };
  switch (op?.op) {
    case 'create': {
      if (!['project', 'folder'].includes(op.kind)) return fail('kind must be project or folder');
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
export function tidyLibrary(lib, boardIds) {
  const out = structuredClone(lib ?? emptyLibrary());
  for (const [b, parent] of Object.entries(out.boards)) if (!boardIds.includes(b) || !out.nodes.some(n => n.id === parent)) delete out.boards[b];
  return out;
}

// Include both library descendants and canvases nested beneath any selected board.
export function libraryContents(lib, boards, id) {
  const nodes = new Set(lib.nodes.filter(n => within(lib, n.id, id)).map(n => n.id));
  const ids = new Set(boards.filter(b => b.id === id || nodes.has(lib.boards[b.id])).map(b => b.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of boards) if (ids.has(b.parent) && !ids.has(b.id)) { ids.add(b.id); grew = true; }
  }
  return { nodes, boards: ids };
}

export function duplicateLibrary(input, boards, id, makeId) {
  const lib = structuredClone(input);
  const root = lib.nodes.find(n => n.id === id) ?? boards.find(b => b.id === id);
  if (!root) throw new Error('That library item no longer exists.');
  const contents = libraryContents(lib, boards, id);
  const remap = new Map([...contents.nodes, ...contents.boards].map(old => [old, makeId()]));
  const usedNames = [...lib.nodes, ...boards].map(n => n.name);
  let copyName = `${root.name} copy`, suffix = 2;
  while (usedNames.includes(copyName)) copyName = `${root.name} copy ${suffix++}`;
  for (const n of input.nodes.filter(n => contents.nodes.has(n.id))) {
    lib.nodes.push({ ...structuredClone(n), id: remap.get(n.id), name: n.id === id ? copyName : n.name, parent: remap.get(n.parent) ?? n.parent });
  }
  const copies = boards.filter(b => contents.boards.has(b.id)).map(b => {
    const copy = structuredClone(b), allCards = [...copy.cards, ...(copy.tray ?? [])];
    const cards = new Map(allCards.filter(c => c && typeof c === 'object').map(c => [c.id, makeId()]));
    const groups = new Map(allCards.filter(c => c?.group).map(c => [c.group, makeId()]));
    copy.id = remap.get(b.id); copy.rev = 0;
    if (b.id === id) copy.name = copyName;
    if (b.parent) copy.parent = remap.get(b.parent) ?? b.parent;
    // Duplicating one nested board creates a standalone sibling in its library folder.
    if (b.id === id) delete copy.parent;
    for (const c of allCards.filter(c => c && typeof c === 'object')) {
      if (c.group) c.group = groups.get(c.group);
      c.id = cards.get(c.id);
      if (c.parent) c.parent = cards.get(c.parent) ?? c.parent;
      if (c.props) {
        for (const key of ['parent', 'group', 'frame', 'colOf', 'onFrame']) if (cards.has(c.props[key])) c.props[key] = cards.get(c.props[key]);
        if (Array.isArray(c.props.kids)) c.props.kids = c.props.kids.map(k => cards.get(k) ?? k);
        if (c.type === 'canvas' && remap.has(c.props.board)) c.props.board = remap.get(c.props.board);
      }
    }
    copy.links = copy.links.map(l => ({ ...l, id: makeId(), a: cards.get(l.a) ?? l.a, b: cards.get(l.b) ?? l.b }));
    if (copy.focus) delete copy.focus;
    const parent = input.boards[b.id];
    if (parent) lib.boards[copy.id] = remap.get(parent) ?? parent;
    return copy;
  });
  return { library: lib, boards: [...boards, ...copies], created: remap.get(id) };
}

function unhook(boards, id) {
  return boards.map(b => {
    const gone = new Set(b.cards.filter(c => c.type === 'canvas' && c.props?.board === id).map(c => c.id));
    if (!gone.size) return b;
    return { ...b, rev: b.rev + 1, cards: b.cards.filter(c => !gone.has(c.id)), links: b.links.filter(l => !gone.has(l.a) && !gone.has(l.b)) };
  });
}

export function deleteLibrary(input, boards, id) {
  if (!input.nodes.some(n => n.id === id) && !boards.some(b => b.id === id)) throw new Error('That library item no longer exists.');
  const contents = libraryContents(input, boards, id);
  const lib = structuredClone(input);
  lib.nodes = lib.nodes.filter(n => !contents.nodes.has(n.id));
  for (const bid of contents.boards) delete lib.boards[bid];
  let remaining = boards.filter(b => !contents.boards.has(b.id));
  for (const bid of contents.boards) remaining = unhook(remaining, bid);
  return { library: lib, boards: remaining, removed: [...contents.boards] };
}

export function moveLibraryBoard(input, boards, { id, parent = null, boardParent = null, at }, makeId) {
  const board = boards.find(b => b.id === id);
  if (!board) throw new Error('That board no longer exists.');
  if (boardParent && libraryContents(input, boards, id).boards.has(boardParent)) throw new Error('A board cannot go inside itself or a child canvas.');
  const into = boardParent && boards.find(b => b.id === boardParent);
  if (boardParent && !into) throw new Error('The destination board no longer exists.');
  const lib = structuredClone(input);
  if (parent && !lib.nodes.some(n => n.id === parent)) throw new Error('The destination folder no longer exists.');
  let next = unhook(boards, id).map(b => b.id === id ? { ...b, parent: boardParent, rev: b.rev + 1 } : b);
  const scope = into ? lib.boards[into.id] : parent;
  for (const bid of libraryContents(lib, boards, id).boards) {
    if (scope) lib.boards[bid] = scope; else delete lib.boards[bid];
  }
  if (into) next = next.map(b => b.id !== into.id ? b : {
    ...b, rev: b.rev + 1,
    cards: [...b.cards, { id: makeId(), type: 'canvas', text: board.name, x: Number.isFinite(at?.x) ? at.x : b.cards.length ? Math.max(...b.cards.map(c => c.x + c.w)) + 60 : 0, y: Number.isFinite(at?.y) ? at.y : 0, w: 260, h: 180, color: 'plain', props: { board: id } }],
  });
  return { library: lib, boards: next };
}

// Serialise library changes and lock boards while reading and writing the operation's snapshot.
export function createLibraryActions(io) {
  let chain = Promise.resolve();
  return (action, payload) => {
    const task = chain.then(async () => {
      const listed = await io.listBoards();
      const locked = async i => {
        if (i < listed.length) return io.withBoard(listed[i].id, () => locked(i + 1));
        const boards = (await Promise.all(listed.map(b => io.loadBoard(b.id)))).filter(Boolean);
        const lib = tidyLibrary(await io.readLibrary(), boards.map(b => b.id));
        let result;
        if (action === 'duplicate') result = duplicateLibrary(lib, boards, payload.id, io.makeId);
        else if (action === 'delete') result = deleteLibrary(lib, boards, payload.id);
        else if (action === 'createBoard') {
          const siblings = boards.filter(b => (b.parent ?? null) === (payload.boardParent ?? null) && (lib.boards[b.id] ?? null) === (payload.parent ?? null));
          const b = io.newBoard(io.makeId(), uniqueName(name(payload.name) || 'Untitled', siblings));
          result = { library: lib, boards: [...boards, b], created: b.id };
          if (payload.boardParent || payload.parent) result = { ...moveLibraryBoard(lib, result.boards, { id: b.id, parent: payload.parent, boardParent: payload.boardParent, at: payload.at }, io.makeId), created: b.id };
        } else if (payload.op === 'move' && boards.some(b => b.id === payload.id)) result = moveLibraryBoard(lib, boards, payload, io.makeId);
        else {
          const r = applyLibraryOp(lib, payload, boards.map(b => b.id));
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
        return { ok: true, created: result.created ?? null, removed: result.removed ?? [], nextBoard: result.boards[0].id };
      };
      return locked(0);
    }).catch(e => { e.status ??= 400; throw e; });
    chain = task.catch(() => {});
    return task;
  };
}
