// Board commands: the one way anything changes a board, for people and agents alike.
// Pure functions over plain data, no DOM, so the canvas, the agent host and the checks share them.
import { checkObject, OBJECT_KINDS, OBJECT_SIZE } from './objects.js';
import { collectionLayout } from './collection.js';
import { normaliseDocument } from './document.js';

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
  const created = {}; const errors = []; const touched = new Set(); const notes = [];
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
          // Models often name an object kind as the card type, or nest kind and data in props. Both mean one thing.
          let input = withRefs(cmd), type = cmd.type ?? 'note';
          if (!CARD_TYPES.includes(type) && OBJECT_KINDS.includes(type)) { input = { ...input, kind: input.kind ?? type, data: input.data ?? input.props }; delete input.props; type = 'object'; notes.push(`create #${index}: type "${cmd.type}" read as type "object", kind "${cmd.type}"`); }
          if (type === 'object' && input.kind === undefined && OBJECT_KINDS.includes(input.props?.kind)) { const { kind, data, ...rest } = input.props; input = { ...input, kind, data: data ?? rest }; delete input.props; }
          const card = cleanCard(type, input, board, anchor ? { x: anchor.x + anchor.w + GAP, y: anchor.y } : null);
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
            else if (k === 'props') {
              const next = { ...(c.props ?? {}) };
              for (const [pk, pv] of Object.entries(v ?? {})) { if (pv === null) delete next[pk]; else next[pk] = pv; }
              if (c.type === 'doc' && v && Object.hasOwn(v, 'body') && !Object.hasOwn(v, 'doc')) {
                delete next.doc; delete next.docTitleMigrated;
              }
              c.props = cleanProps(next, 'props');
            }
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
          const options = { ...cmd, spans: Array.isArray(cmd.spans) ? [...cmd.spans] : cmd.spans, columns: Array.isArray(cmd.columns) ? [...cmd.columns] : cmd.columns, x: num(cmd.x, cards[0]?.x ?? 0), y: num(cmd.y, cards[0]?.y ?? 0), cols: clamp(num(cmd.cols, cmd.spans ? 12 : 3), 1, 20) };
          for (const w of layout(cards, cmd.shape ?? 'grid', options) ?? []) notes.push(`layout #${index}: widened ${w.id} from ${w.from} to ${w.to} columns to fit its content`);
          // Round 2 demo: keep the grid with the content so measured heights can repack it.
          for (const c of board.cards) if (c.props?.contentLayout?.ids.some(id => ids.includes(id))) { delete c.props.contentLayout; touched.add(c.id); }
          if (cmd.fit && cmd.spans && cards.length) {
            for (const c of cards) c.props = { ...c.props, contentFit: true, ...(['note', 'todo'].includes(c.type) ? { autoHeightMin: 80 } : {}) };
            cards[0].props.contentLayout = { ids, x: options.x, y: options.y, cols: options.cols, spans: options.spans, columns: options.columns, columnWidth: cmd.columnWidth ?? 84, gap: cmd.gap ?? GAP, pack: cmd.pack ?? 'rows' };
          }
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
  for (const card of board.cards) if (touched.has(card.id)) normaliseDocument(card);
  // Round 2 demo: only height changes repack a composition. Manual positioning releases it.
  const compositions = board.cards.filter(c => c.props?.contentLayout);
  const before = compositions.length ? new Map(input.cards.map(c => [c.id, c])) : new Map();
  for (const leader of compositions) {
    const plan = leader.props.contentLayout;
    const released = commands.some(cmd => (cmd.op === 'move' || cmd.op === 'update' && (['x', 'y', 'w'].some(k => k in (cmd.set ?? {})) || cmd.set?.props?.fixedHeight)) && plan.ids.includes(ref(cmd.id)));
    const members = plan.ids.map(id => board.cards.find(c => c.id === id));
    if (released || members.some(c => !c)) { delete leader.props.contentLayout; touched.add(leader.id); continue; }
    if (!members.some(c => touched.has(c.id) && before.has(c.id) && before.get(c.id).h !== c.h)) continue;
    layout(members, 'grid', { ...plan, fit: false });
    members.forEach(c => touched.add(c.id));
  }
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
  return { ok: true, board, created, touched: [...touched], errors: [], ...(notes.length ? { notes } : {}) };
}

// item 11: spans opt into a fixed-column composition; existing layouts keep their sizes.
export function layout(cards, shape, { x, y, cols, spans, columns, columnWidth = 84, gap = GAP, fit = false, pack = 'rows' }) {
  const widened = [];
  if (shape === 'grid' && spans) {
    if (!Number.isInteger(cols) || !Array.isArray(spans) || spans.length !== cards.length || spans.some(s => !Number.isInteger(s) || s < 1 || s > cols)) throw new Error('grid needs one whole column span per card, between 1 and cols');
    if (!Number.isFinite(columnWidth) || columnWidth < 24 || columnWidth > 300 || !Number.isFinite(gap) || gap < 0 || gap > 120) throw new Error('grid columnWidth must be 24..300 and gap 0..120');
    if (!['rows', 'compact'].includes(pack)) throw new Error('grid pack must be rows or compact');
    if (columns && (pack !== 'compact' || columns.length !== cards.length || columns.some((at, i) => !Number.isInteger(at) || at < 0 || at + spans[i] > cols))) throw new Error('compact grid columns must fit each span within the grid');
    let column = 0, rowY = y, rowHeight = 0;
    const bottoms = Array(cols).fill(y), widths = s => s * columnWidth + (s - 1) * gap;
    cards.forEach((c, i) => {
      let span = spans[i], width = widths(span), size = fit ? objectContentSize(c, width) : { w: 40, h: c.h };
      // A window a little too narrow takes the next span that fits, so one width slip never discards a batch.
      while (fit && size.w > width && span < cols) { span++; width = widths(span); size = objectContentSize(c, width); }
      if (size.w > width) throw new Error(`${c.kind ?? c.type} needs at least ${size.w}px, wider than the whole grid; use wider columns or shorten its content`);
      if (span !== spans[i]) { widened.push({ id: c.id, from: spans[i], to: span }); spans[i] = span; }
      if (width > 4000) throw new Error('grid window exceeds 4000px; use narrower columns');
      if (column + span > cols) { rowY += rowHeight + gap; column = 0; rowHeight = 0; }
      if (size.h > 4000) throw new Error('content exceeds 4000px; split it into smaller objects');
      if (pack === 'compact') {
        // Place each window in the highest free span, breaking ties from the left.
        const candidates = Array.from({ length: cols - span + 1 }, (_, at) => ({ at, y: Math.max(...bottoms.slice(at, at + span)) }));
        const next = columns ? candidates[Math.min(columns[i], cols - span)] : candidates.reduce((best, candidate) => candidate.y < best.y ? candidate : best);
        if (columns && columns[i] !== next.at) columns[i] = next.at;
        column = next.at; rowY = next.y;
      }
      Object.assign(c, { x: x + column * (columnWidth + gap), y: rowY, w: width, h: Math.ceil(size.h), rot: 0 });
      bottoms.fill(c.y + c.h + gap, column, column + span);
      rowHeight = Math.max(rowHeight, c.h); column += span;
    });
    return widened;
  }
  if (shape === 'column') { let cy = y; for (const c of cards) { c.x = x; c.y = cy; cy += c.h + GAP; } return; }
  if (shape === 'row') { let cx = x; for (const c of cards) { c.x = cx; c.y = y; cx += c.w + GAP; } return; }
  // grid: equal cells sized to the largest card
  const cw = Math.max(...cards.map(c => c.w)) + GAP, ch = Math.max(...cards.map(c => c.h)) + GAP;
  cards.forEach((c, i) => { c.x = x + (i % cols) * cw; c.y = y + Math.floor(i / cols) * ch; });
}

// Content metrics include the 36px strip, padding and borders. Text estimates are conservative;
// the browser check also measures the rendered content rather than trusting these estimates.
export function objectContentSize(card, width = card.w) {
  const d = card.data, inner = Math.max(80, width - 42), chrome = 70;
  const lines = (text, available, char = 8) => String(text ?? '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length * char / Math.max(40, available))), 0);
  if (card.type === 'doc') return { w: 480, h: Math.max(200, 100 + lines(card.props?.body, width - 124, 10) * 30) };
  if (card.type === 'deck') return { w: 660, h: Math.max(340, 70 + (width - 172) * 9 / 16) };
  if (['note', 'todo'].includes(card.type)) return { w: 160, h: Math.max(80, 42 + lines(card.text, width - 40) * 24 + (card.heading ? 36 : 0) + (card.items?.length ?? 0) * 30) };
  if (card.type !== 'object') return { w: 40, h: card.h };
  switch (card.kind) {
    case 'diagram': {
      // Renderer node metrics: 28px horizontal padding, 18px title lines, 16px note lines.
      const boxes = d.nodes.map(n => {
        const w = Math.max(120, Math.min(220, Math.ceil(Math.max(n.name.length, Math.min(n.note?.length ?? 0, 34)) * 7.2 + 28)));
        const perLine = Math.floor((w - 28) / 7.2);
        return { w, h: 22 + Math.min(2, Math.ceil(n.name.length / perLine)) * 18 + (n.note ? Math.min(3, Math.ceil(n.note.length / perLine)) * 16 : 0) };
      });
      const incoming = new Map(d.nodes.map(n => [n.id, 0])), outgoing = new Map(incoming);
      for (const e of d.edges) { incoming.set(e.to, incoming.get(e.to) + 1); outgoing.set(e.from, outgoing.get(e.from) + 1); }
      const roots = d.nodes.filter(n => !incoming.get(n.id));
      const chain = d.edges.length === d.nodes.length - 1 && roots.length === 1 && [...incoming.values(), ...outgoing.values()].every(n => n <= 1);
      const across = d.direction === 'right';
      const width = chain ? across ? boxes.reduce((n, b) => n + b.w, 0) + 56 * (boxes.length - 1) + 12 : Math.max(...boxes.map(b => b.w)) + 12 : Math.max(...boxes.map(b => b.w));
      const height = chain && across ? Math.max(...boxes.map(b => b.h)) + 12 : boxes.reduce((n, b) => n + b.h, 0) + (chain ? 56 : 72) * (boxes.length - 1) + 12;
      // Layer bands can extend 24px above and 12px below their nodes.
      return { w: 200, h: chrome + Math.ceil(height * (chain ? Math.min(1, inner / width) : 1)) + (d.layers?.length ? 48 : 0) };
    }
    case 'reply': {
      const reading = Math.min(inner, 520); // the renderer caps the reading column at 64ch
      const figures = d.figures?.length ? 20 + Math.ceil(d.figures.length / Math.max(1, Math.floor(reading / 170))) * 78 : 0;
      return { w: 280, h: chrome + lines(d.headline, reading, 13) * 31 + 14 + lines(d.text, reading) * 24 + figures + (d.points?.length ? 16 + d.points.reduce((n, p) => n + lines(p, reading - 18) * 22 + 8, 0) : 0) };
    }
    case 'sheet': {
      const w = 48 + d.columns.reduce((sum, col, i) => sum + Math.max(106, Math.ceil(Math.max(col.label.length + (col.unit?.length ?? 0) + 3, ...d.rows.map(r => String(r.cells[i] ?? '').length)) * 7 + 22)), 0);
      return { w, h: 38 + (d.rows.length + 2) * 30 + (d.note ? 20 + lines(d.note, width - 24, 6) * 18 : 0) };
    }
    case 'plan': return { w: 340, h: chrome + d.steps.reduce((n, s) => n + lines(s.title, inner - 114) * 18 + (s.detail ? 3 + lines(s.detail, inner - 114) * 20 : 0) + (s.place || s.cost ? 22 : 0) + 14, 0) + (d.total ? 40 : 0) };
    case 'list': return { w: 280, h: chrome + d.items.reduce((n, s) => n + lines(s.title, inner - 80) * 18 + (s.detail ? 3 + lines(s.detail, inner - 80) * 20 : 0) + 17, 0) };
    case 'code': return { w: Math.max(280, 90 + Math.max(...d.text.split('\n').map(s => s.length)) * 7.5), h: chrome + d.text.split('\n').length * 20 + (d.notes ?? []).reduce((n, s) => n + lines(s.text, inner - 50, 7) * 20 + 16, 0) };
    case 'plot': return { w: 420, h: chrome + (d.style === 'radar' ? 280 : ['donut', 'radial'].includes(d.style) ? 188 : d.style === 'bar_horizontal' ? Math.max(140, d.series[0].points.length * 28) : 220) + (d.headline ? 66 : 0) + 40 + lines(d.basis, inner, 6) * 18 + (d.series.length > 1 ? Math.ceil(d.series.length / 3) * 28 : 0) };
    case 'stats': return { w: 280, h: chrome + Math.ceil(d.tiles.length / Math.max(1, Math.floor(inner / 160))) * 130 + (d.note ? 40 : 0) };
    case 'progress': return { w: 300, h: chrome + d.goals.length * 74 };
    case 'callout': return { w: 260, h: chrome + 28 + lines(d.text, inner) * 25 + (d.attribution ? 34 : 0) };
    case 'html': return { w: 260, h: chrome + (d.height ?? 240) };
    default: return { w: OBJECT_SIZE[card.kind]?.[0] ?? 520, h: OBJECT_SIZE[card.kind]?.[1] ?? 360 };
  }
}
// end item 11

// A compact view of a board for a model: ids, types, positions, text. Cards are listed back to front.
export function describe(board, limit = 400) {
  return {
    id: board.id, name: board.name, rev: board.rev,
    cards: board.cards.slice(0, limit).map(c => ({ id: c.id, type: c.type, x: Math.round(c.x), y: Math.round(c.y), w: c.w, h: c.h, text: c.text.slice(0, 600), ...(c.heading ? { heading: c.heading } : {}), ...(c.badge ? { badge: c.badge } : {}), color: c.color, ...(c.items ? { items: c.items } : {}), ...(c.url ? { url: c.url } : {}), ...(c.group ? { group: c.group } : {}), ...(c.type === 'object' ? { kind: c.kind, data: c.data, ver: c.ver } : {}), ...(c.rot ? { rot: c.rot } : {}), ...(c.parent ? { parent: c.parent } : {}), ...(c.props ? { props: JSON.stringify(c.props).length > 4000 ? { summary: 'large; ask for this card', ...(typeof c.props.body === 'string' ? { body: c.props.body } : {}) } : c.props } : {}) })),
    links: board.links.map(l => ({ ...l })),
    truncated: board.cards.length > limit,
  };
}
