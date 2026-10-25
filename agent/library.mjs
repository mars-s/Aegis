// The Library: projects and folders that hold boards. Pure rules over plain data, so they are easy to check.
// Shape: { nodes: [{ id, kind: 'project' | 'folder', name, parent }], boards: { [boardId]: parentNodeId } }
// Projects sit at the top. Folders sit in a project or another folder. Boards sit anywhere, or loose (no entry).

export const emptyLibrary = () => ({ nodes: [], boards: {} });

const name = v => String(v ?? '').trim().slice(0, 120);
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
    if (parent == null) return kind === 'folder' ? 'a folder needs a project or folder to live in' : null;
    return node(parent) ? null : `no project or folder ${parent}`;
  };
  switch (op?.op) {
    case 'create': {
      if (!['project', 'folder'].includes(op.kind)) return fail('kind must be project or folder');
      const parent = op.kind === 'project' ? null : op.parent ?? null;
      const bad = checkParent(op.kind, parent); if (bad) return fail(bad);
      const id = newId(lib);
      lib.nodes.push({ id, kind: op.kind, name: name(op.name) || (op.kind === 'project' ? 'New project' : 'New folder'), parent });
      return { ok: true, library: lib, created: id };
    }
    case 'rename': {
      const n = node(op.id); if (!n) return fail(`no project or folder ${op.id}`);
      if (!name(op.name)) return fail('a name is needed');
      n.name = name(op.name); return { ok: true, library: lib };
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
    default: return fail('op must be create, rename, move or delete');
  }
}

// Drop placements for boards that no longer exist or point at missing nodes.
export function tidyLibrary(lib, boardIds) {
  const out = structuredClone(lib ?? emptyLibrary());
  for (const [b, parent] of Object.entries(out.boards)) if (!boardIds.includes(b) || !out.nodes.some(n => n.id === parent)) delete out.boards[b];
  return out;
}
