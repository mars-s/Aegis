// Board commands: the one way anything changes a board, for people and agents alike.
// Pure functions over plain data, no DOM, so the canvas, the agent host and the checks share them.
import { checkObject, OBJECT_SIZE } from './objects.js';
import { collectionLayout } from './collection.js';

// Built-in card types. Feature modules add more with registerCardType (a doc, a swatch, a drawing...),
// so the host, the canvas and the checks all accept them. Type-specific data lives in card.props.
export const CARD_TYPES = ['note', 'title', 'todo', 'link', 'image', 'video', 'web', 'agent', 'object'];
const EXTRA = new Map(); // type -> { size: [w, h], guide }
// guide: one line for agents on what the type is for and which props it reads.
export function registerCardType(type, { size = [240, 160], guide = '' } = {}) {
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(type)) throw new Error(`bad card type name ${type}`);
  if (!CARD_TYPES.includes(type)) CARD_TYPES.push(type);
  EXTRA.set(type, { size, guide });
}
export function cardTypeGuide() {
  return [...EXTRA].filter(([, v]) => v.guide).map(([type, v]) => `- ${type}: ${v.guide}`).join('\n');
}
const MAX_PROPS = 1_000_000; // bytes of JSON in card.props
function cleanProps(v, at) {
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${at}: props must be an object`);
  const json = JSON.stringify(v);
  if (json.length > MAX_PROPS) throw new Error(`${at}: props is ${json.length} bytes; the limit is ${MAX_PROPS}. Store big files as assets`);
  return JSON.parse(json);
}
const COLORS = ['plain', 'gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple'];
const DEFAULT_SIZE = {
  note: [220, 96], title: [360, 56], todo: [260, 160], link: [260, 76],
  image: [320, 220], video: [480, 270], web: [480, 340], agent: [300, 160], object: [520, 360],
};
const GAP = 24;

export function emptyBoard(id, name = 'Untitled') {
  return { id, name, rev: 0, cards: [], links: [], view: { x: 0, y: 0, z: 1 } };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');

function newId(board) {
  let id;
  do id = Math.random().toString(36).slice(2, 10); while (board.cards.some(c => c.id === id));
  return id;
}

// Free space for a w×h card: scan right of the anchor (or the board's bounds) for a gap.
export function findSpace(board, w, h, near) {
  const hits = (x, y) => board.cards.some(c => x < c.x + c.w + GAP && x + w + GAP > c.x && y < c.y + c.h + GAP && y + h + GAP > c.y);
  let x0, y0;
  if (near) { x0 = near.x; y0 = near.y; }
  else if (board.cards.length) { x0 = Math.min(...board.cards.map(c => c.x)); y0 = Math.max(...board.cards.map(c => c.y + c.h)) + GAP * 2; }
  else { x0 = 0; y0 = 0; }
  for (let ring = 0; ring < 60; ring++) {
    for (let col = 0; col <= ring; col++) {
      const x = x0 + col * (w + GAP), y = y0 + (ring - col) * (h + GAP);
      if (!hits(x, y)) return { x, y };
    }
  }
  return { x: x0, y: y0 + 1e4 };
}

const ID_RE = /^[a-z0-9]{6,16}$/;
function cleanCard(type, o, board, anchor) {
  if (!CARD_TYPES.includes(type)) throw new Error(`unknown card type "${type}". Use one of: ${CARD_TYPES.join(', ')}`);
  // An object card holds typed data of one kind (a chart, a sheet...), checked against its shape.
  const object = type === 'object' ? { kind: o.kind, data: checkObject(o.kind, o.data) } : null;
  const [dw, dh] = object ? OBJECT_SIZE[object.kind] : DEFAULT_SIZE[type] ?? EXTRA.get(type)?.size ?? [240, 160];
  const w = clamp(num(o.w, dw), 40, 4000), h = clamp(num(o.h, dh), 24, 4000);
  const pos = (typeof o.x === 'number' && typeof o.y === 'number') ? { x: o.x, y: o.y } : findSpace(board, w, h, anchor);
  // A caller may choose the id (the canvas does, so its optimistic copy matches the saved board).
  const id = ID_RE.test(o.newId ?? '') && !board.cards.some(c => c.id === o.newId) ? o.newId : newId(board);
  const card = { id, type, x: pos.x, y: pos.y, w, h, text: str(o.text), color: COLORS.includes(o.color) || /^#[0-9a-f]{6}$/i.test(o.color ?? '') ? o.color : 'plain' };
  if (type === 'todo') card.items = Array.isArray(o.items) ? o.items.slice(0, 200).map(i => ({ text: str(i?.text ?? i, 500), done: !!i?.done })) : [];
  if (type === 'link' || type === 'web' || type === 'image' || type === 'video' || type === 'spotify') card.url = str(o.url, 4000);
  // Notes can carry a short heading and a badge (e.g. "read me first") above the body.
  if (str(o.heading)) card.heading = str(o.heading, 200);
  if (str(o.badge)) card.badge = str(o.badge, 40);
  if (type === 'agent') card.agent = str(o.agent, 100);
  if (object) { card.kind = object.kind; card.data = object.data; card.ver = 1; }
  if (o.group) card.group = str(o.group, 100);
  if (typeof o.rot === 'number' && Number.isFinite(o.rot)) card.rot = clamp(o.rot, -180, 180);
  if (typeof o.parent === 'string' && o.parent) card.parent = str(o.parent, 40);
  const props = cleanProps(o.props, 'props'); if (props) card.props = props;
  return card;
}

const EDITABLE = ['text', 'heading', 'badge', 'color', 'x', 'y', 'w', 'h', 'items', 'url', 'group', 'done', 'rot', 'parent', 'props'];
const LIMIT = { url: 4000, heading: 200, badge: 40 };

// Apply one batch atomically. Returns { ok, board, created, errors }. The input board is never mutated.
export function applyBatch(input, batch) {
  const board = structuredClone(input);
  const created = {}; const errors = []; const touched = new Set();
  const ref = id => (typeof id === 'string' && id.startsWith('$') ? created[id.slice(1)] : id);
  const byId = id => board.cards.find(c => c.id === ref(id));
  // Card ids also live in parent and props.kids (collections), so "$name" works there too.
  const withRefs = cmd => {
    const out = { ...cmd };
    if ('parent' in out) out.parent = ref(out.parent);
    if (Array.isArray(out.props?.kids)) out.props = { ...out.props, kids: out.props.kids.map(ref) };
    return out;
  };
  const commands = Array.isArray(batch?.commands) ? batch.commands : [];
  if (!commands.length) errors.push({ index: -1, reason: 'empty batch', hint: 'send at least one command' });
  if (typeof batch?.baseRev === 'number' && batch.baseRev !== board.rev) {
    // Concurrent authors: keep going, but refuse edits to cards someone else deleted (below).
  }
  commands.forEach((cmd, index) => {
    try {
      switch (cmd?.op) {
        case 'create': {
          const anchor = cmd.near ? byId(cmd.near) : null;
          const card = cleanCard(cmd.type ?? 'note', withRefs(cmd), board, anchor ? { x: anchor.x + anchor.w + GAP, y: anchor.y } : null);
          board.cards.push(card); touched.add(card.id);
          if (cmd.ref) created[cmd.ref] = card.id;
          break;
        }
        case 'update': {
          const c = byId(cmd.id); if (!c) throw new Error(`no card ${cmd.id}`);
          const set = withRefs(cmd.set ?? {});
          for (const k of EDITABLE) if (k in set) {
            const v = set[k];
            if (['x', 'y'].includes(k)) c[k] = num(v, c[k]);
            else if (['w', 'h'].includes(k)) c[k] = clamp(num(v, c[k]), 24, 4000);
            else if (k === 'color') { if (COLORS.includes(v) || /^#[0-9a-f]{6}$/i.test(v)) c.color = v; }
            else if (k === 'rot') c.rot = clamp(num(v, c.rot ?? 0), -180, 180);
            else if (k === 'parent') { if (v) c.parent = str(v, 40); else delete c.parent; }
            // props merge: set.props = { a: 1 } changes only a; a null value removes that key.
            else if (k === 'props') { const next = { ...(c.props ?? {}) }; for (const [pk, pv] of Object.entries(v ?? {})) { if (pv === null) delete next[pk]; else next[pk] = pv; } c.props = cleanProps(next, 'props'); }
            else if (k === 'items') c.items = Array.isArray(v) ? v.slice(0, 200).map(i => ({ text: str(i?.text ?? i, 500), done: !!i?.done })) : c.items;
            else if ((k === 'heading' || k === 'badge') && !str(v)) delete c[k];
            else c[k] = typeof v === 'boolean' ? v : str(v, LIMIT[k] ?? 20000);
          }
          touched.add(c.id); break;
        }
        case 'revise': {
          // A newer version of an object, standing where it stood. data is the complete new data of the same kind.
          const c = byId(cmd.id); if (!c) throw new Error(`no card ${cmd.id}`);
          if (c.type !== 'object') throw new Error(`card ${c.id} is a ${c.type}, not an object; use update`);
          c.data = checkObject(c.kind, cmd.data);
          if (typeof cmd.text === 'string') c.text = str(cmd.text, 200);
          c.ver = (c.ver ?? 1) + 1; c.updated = Date.now();
          touched.add(c.id); break;
        }
        case 'object_set': {
          // A person's in-place change to one field of an object (a ticked step, a sort). Path is a list of keys.
          const c = byId(cmd.id); if (!c || c.type !== 'object') throw new Error(`no object ${cmd.id}`);
          const path = Array.isArray(cmd.path) ? cmd.path : [];
          if (!path.length) throw new Error('object_set needs a path');
          const next = structuredClone(c.data); let at = next;
          for (const k of path.slice(0, -1)) { if (at?.[k] === undefined) throw new Error(`object_set: no ${path.join('.')}`); at = at[k]; }
          at[path.at(-1)] = cmd.value;
          c.data = checkObject(c.kind, next); touched.add(c.id); break;
        }
        case 'move': {
          const c = byId(cmd.id); if (!c) throw new Error(`no card ${cmd.id}`);
          c.x = num(cmd.x, c.x); c.y = num(cmd.y, c.y); touched.add(c.id); break;
        }
        case 'delete': {
          const ids = new Set((Array.isArray(cmd.ids) ? cmd.ids : [cmd.id]).map(ref));
          const missing = [...ids].filter(id => !board.cards.some(c => c.id === id));
          if (missing.length) throw new Error(`no card ${missing.join(', ')}`);
          board.cards = board.cards.filter(c => !ids.has(c.id));
          board.links = board.links.filter(l => !ids.has(l.a) && !ids.has(l.b));
          break;
        }
        case 'connect': {
          const a = byId(cmd.a), b = byId(cmd.b); if (!a || !b) throw new Error(`connect needs two existing cards (${cmd.a}, ${cmd.b})`);
          if (!board.links.some(l => l.a === a.id && l.b === b.id)) board.links.push({ id: ID_RE.test(cmd.newId ?? '') && ![...board.cards, ...board.links].some(x => x.id === cmd.newId) ? cmd.newId : newId(board), a: a.id, b: b.id, label: str(cmd.label, 200) });
          break;
        }
        case 'link_update': {
          const link = board.links.find(l => l.id === cmd.id);
          if (!link) throw new Error(`no link ${cmd.id}`);
          if (cmd.remove === true) { board.links = board.links.filter(l => l !== link); break; }
          const set = cmd.set ?? {};
          for (const k of ['a', 'b']) if (k in set) {
            const card = byId(set[k]); if (!card) throw new Error(`no card ${set[k]}`);
            link[k] = card.id;
          }
          if (link.a === link.b || board.links.some(l => l !== link && (l.a === link.a && l.b === link.b || l.a === link.b && l.b === link.a))) throw new Error('link needs a distinct, unconnected pair');
          for (const k of ['label', 'bend', 'dash', 'arrow', 'colour', 'pa', 'pb']) if (k in set) {
            const v = set[k];
            if (v === null) { delete link[k]; continue; }
            if (k === 'label') link[k] = str(v, 200);
            else if (k === 'bend' && typeof v === 'number' && Number.isFinite(v)) link[k] = clamp(v, -4000, 4000);
            else if (k === 'dash' && typeof v === 'boolean') link[k] = v;
            else if (k === 'arrow' && ['none', 'end', 'both'].includes(v)) link[k] = v;
            else if (k === 'colour' && /^#[0-9a-f]{6}$/i.test(v)) link[k] = v;
            else if (['pa', 'pb'].includes(k) && v && Number.isFinite(v.u) && Number.isFinite(v.v) && v.u >= 0 && v.u <= 1 && v.v >= 0 && v.v <= 1 && [v.u, v.v].some(n => n === 0 || n === 1)) link[k] = { u: v.u, v: v.v };
            else throw new Error(`invalid link ${k}`);
          }
          break;
        }
        case 'layout': {
          const ids = (Array.isArray(cmd.ids) ? cmd.ids : []).map(ref);
          const cards = ids.map(id => board.cards.find(c => c.id === id)).filter(Boolean);
          if (cards.length !== ids.length) throw new Error('layout lists a card that does not exist');
          layout(cards, cmd.shape ?? 'grid', { x: num(cmd.x, cards[0]?.x ?? 0), y: num(cmd.y, cards[0]?.y ?? 0), cols: clamp(num(cmd.cols, 3), 1, 20) });
          cards.forEach(c => touched.add(c.id)); break;
        }
        case 'order': {
          // Card list order is stacking order: later cards draw on top.
          const ids = (Array.isArray(cmd.ids) ? cmd.ids : [cmd.id]).map(ref);
          const moving = ids.map(id => board.cards.find(c => c.id === id));
          if (!ids.length || moving.some(c => !c)) throw new Error('order lists a card that does not exist');
          const rest = board.cards.filter(c => !ids.includes(c.id));
          const at = cmd.to === 'back' ? 0 : cmd.to === 'front' || typeof cmd.to !== 'number' ? rest.length : clamp(Math.round(cmd.to), 0, rest.length);
          rest.splice(at, 0, ...moving); board.cards = rest;
          moving.forEach(c => touched.add(c.id)); break;
        }
        case 'restore': {
          // Undo and redo: put back a whole earlier state of the cards and links (from the person's own history).
          if (!Array.isArray(cmd.cards) || !Array.isArray(cmd.links)) throw new Error('restore needs cards and links');
          board.cards = structuredClone(cmd.cards); board.links = structuredClone(cmd.links);
          if (Array.isArray(cmd.tray)) board.tray = structuredClone(cmd.tray);
          board.cards.forEach(c => touched.add(c.id)); break;
        }
        case 'board_set': {
          // Board-level fields features use: tray (Unsorted), palette, background.
          for (const k of ['tray', 'palette', 'bg']) if (k in (cmd.set ?? {})) {
            const v = cmd.set[k];
            if (v === null) delete board[k];
            else if (k === 'bg') board.bg = /^#[0-9a-f]{6}$/i.test(v) ? v : (() => { throw new Error('bg must be a #rrggbb colour'); })();
            else if (k === 'palette') {
              if (!Array.isArray(v) || v.length > 256) throw new Error('palette must contain at most 256 colours');
              board.palette = v.map(p => {
                if (!p || !/^#[0-9a-f]{6}$/i.test(p.hex) || typeof p.name !== 'string') throw new Error('palette needs hex colours and names');
                return { hex: p.hex.toLowerCase(), name: p.name.trim().slice(0, 100) || p.hex.toUpperCase() };
              });
            }
            else if (!Array.isArray(v)) throw new Error(`${k} must be a list`);
            else board[k] = cleanProps({ v }, k).v;
          }
          break;
        }
        case 'focus': {
          const ids = (Array.isArray(cmd.ids) ? cmd.ids : [cmd.id]).map(ref).filter(Boolean);
          board.focus = { ids, at: Date.now() }; break;
        }
        default: throw new Error(`unknown op "${cmd?.op}". Use create, update, revise, move, delete, connect, link_update, layout, order, focus, restore or board_set`);
      }
    } catch (e) {
      errors.push({ index, reason: e.message, hint: 'read the board again to get current card ids' });
    }
  });
  if (errors.length) return { ok: false, board: input, created: {}, errors };
  // Collection membership: a card listed in props.kids without the collection as its parent was just
  // added (an agent usually only fills kids), so all members get the app's column layout and the link.
  // Cards dropped from kids lose the link. Linked members keep their place, so paste and undo stay exact.
  const kidsBefore = new Map(input.cards.filter(c => c.type === 'coll').map(c => [c.id, c.props?.kids ?? []]));
  for (const coll of board.cards) {
    if (coll.type !== 'coll' || !touched.has(coll.id)) continue;
    const kids = coll.props?.kids ?? [];
    for (const id of kidsBefore.get(coll.id) ?? []) { const c = board.cards.find(k => k.id === id); if (c && !kids.includes(id) && c.parent === coll.id) { delete c.parent; touched.add(id); } }
    if (!kids.some(id => board.cards.find(k => k.id === id && k.parent !== coll.id))) continue;
    // Cards are listed back to front: the collection goes just behind its first member.
    const first = Math.min(...kids.map(id => board.cards.findIndex(k => k.id === id)).filter(i => i >= 0));
    const at = board.cards.indexOf(coll);
    if (at > first) { board.cards.splice(at, 1); board.cards.splice(first, 0, coll); }
    for (const { op, id, set } of collectionLayout(board, coll)) {
      if (op !== 'update') continue; // the stacking move is done above
      const c = board.cards.find(k => k.id === id);
      Object.assign(c, { ...set, props: set.props ? { ...c.props, ...set.props } : c.props }); touched.add(id);
    }
  }
  board.rev = input.rev + 1;
  return { ok: true, board, created, touched: [...touched], errors: [] };
}

export function layout(cards, shape, { x, y, cols }) {
  if (shape === 'column') { let cy = y; for (const c of cards) { c.x = x; c.y = cy; cy += c.h + GAP; } return; }
  if (shape === 'row') { let cx = x; for (const c of cards) { c.x = cx; c.y = y; cx += c.w + GAP; } return; }
  // grid: equal cells sized to the largest card
  const cw = Math.max(...cards.map(c => c.w)) + GAP, ch = Math.max(...cards.map(c => c.h)) + GAP;
  cards.forEach((c, i) => { c.x = x + (i % cols) * cw; c.y = y + Math.floor(i / cols) * ch; });
}

// A compact view of a board for a model: ids, types, positions, text. Cards are listed back to front.
export function describe(board, limit = 400) {
  return {
    id: board.id, name: board.name, rev: board.rev,
    cards: board.cards.slice(0, limit).map(c => ({ id: c.id, type: c.type, x: Math.round(c.x), y: Math.round(c.y), w: c.w, h: c.h, text: c.text.slice(0, 600), ...(c.heading ? { heading: c.heading } : {}), ...(c.badge ? { badge: c.badge } : {}), color: c.color, ...(c.items ? { items: c.items } : {}), ...(c.url ? { url: c.url } : {}), ...(c.group ? { group: c.group } : {}), ...(c.type === 'object' ? { kind: c.kind, data: c.data, ver: c.ver } : {}), ...(c.rot ? { rot: c.rot } : {}), ...(c.parent ? { parent: c.parent } : {}), ...(c.props ? { props: JSON.stringify(c.props).length > 4000 ? { summary: 'large; ask for this card', ...(typeof c.props.body === 'string' ? { body: c.props.body } : {}) } : c.props } : {}) })),
    links: board.links.map(l => ({ ...l })),
    truncated: board.cards.length > limit,
  };
}
