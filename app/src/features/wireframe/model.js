// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { PIECES } from './pieces.js';
export { PIECES };
export const DEVICES = { iPhone: [393, 852, 44], Android: [412, 915, 28], iPad: [834, 1194, 20], Desktop: [1440, 1024, 10], Watch: [205, 251, 40] };
export const TYPES = ['frame', 'box', 'text', 'icon', 'font', 'section'];
export const uid = () => Math.random().toString(36).slice(2, 12).padEnd(8, '0');
export const bounds = cards => ({ x: Math.min(...cards.map(c => c.x)), y: Math.min(...cards.map(c => c.y)), right: Math.max(...cards.map(c => c.x + c.w)), bottom: Math.max(...cards.map(c => c.y + c.h)) });
export const containsCentre = (f, c) => c.x + c.w / 2 > f.x && c.x + c.w / 2 < f.x + f.w && c.y + c.h / 2 > f.y && c.y + c.h / 2 < f.y + f.h;
export function frameAt(cards, card) { return [...cards].reverse().find(f => f.type === 'frame' && f.id !== card.id && containsCentre(f, card)); }
export function sectionMembers(section, cards) {
  return cards.filter(c => c.id !== section.id && !c.hidden && !c.props?.hidden && !cards.some(p => p.id === c.parent && p.type !== 'frame') && (c.type !== 'section' || c.w * c.h < section.w * section.h) && containsCentre(section, c));
}
export function selectForDrag(ids, hitId, board, event = {}) {
  const hit = board.cards.find(c => c.id === hitId);
  if (!hit?.group || event.shiftKey) return ids;
  if (event.metaKey || event.ctrlKey) return [hitId];
  return board.cards.filter(c => ids.includes(c.id) || c.group === hit.group).map(c => c.id);
}
export function expandDrag(cards, board, event = {}) {
  const ids = new Set(cards.map(c => c.id)), groups = new Set(cards.map(c => c.group).filter(Boolean));
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of board.cards.filter(c => ids.has(c.id))) {
      const children = c.type === 'section' ? sectionMembers(c, board.cards) : c.type === 'frame' ? board.cards.filter(k => k.parent === c.id) : [];
      if (c.group && groups.has(c.group) && !event.metaKey && !event.ctrlKey) children.push(...board.cards.filter(k => k.group === c.group));
      for (const k of children) if (!ids.has(k.id)) { ids.add(k.id); changed = true; }
    }
  }
  return board.cards.filter(c => ids.has(c.id));
}
export function snapDrag(start, dx, dy, board, view, { grid = false, disabled = false } = {}) {
  const moving = new Set(start.map(s => s.c.id)), mine = start.filter(s => s.c.type !== 'ink');
  if (!mine.length || disabled) return { dx, dy, guides: [] };
  const b = bounds(mine.map(s => ({ ...s.c, x: s.x, y: s.y })));
  if (grid) { dx = Math.round((b.x + dx) / 26) * 26 - b.x; dy = Math.round((b.y + dy) / 26) * 26 - b.y; }
  const x0 = b.x + dx, x1 = b.right + dx, y0 = b.y + dy, y1 = b.bottom + dy;
  let bx, by;
  for (const o of board.cards) {
    if (moving.has(o.id) || o.type === 'ink' || o.hidden || o.props?.hidden || Math.abs(o.x - x0) > 1600 / view.z || Math.abs(o.y - y0) > 1600 / view.z) continue;
    for (const a of [x0, (x0 + x1) / 2, x1]) for (const at of [o.x, o.x + o.w / 2, o.x + o.w]) {
      const d = at - a; if (Math.abs(d) <= 6 / view.z && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, at, o };
    }
    for (const a of [y0, (y0 + y1) / 2, y1]) for (const at of [o.y, o.y + o.h / 2, o.y + o.h]) {
      const d = at - a; if (Math.abs(d) <= 6 / view.z && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, at, o };
    }
  }
  const guides = [];
  if (bx) { dx += bx.d; guides.push({ x1: bx.at, y1: Math.min(y0, bx.o.y) - 10, x2: bx.at, y2: Math.max(y1, bx.o.y + bx.o.h) + 10 }); }
  if (by) { dy += by.d; guides.push({ x1: Math.min(x0, by.o.x) - 10, y1: by.at, x2: Math.max(x1, by.o.x + by.o.w) + 10, y2: by.at }); }
  return { dx, dy, guides };
}
export function dropCommands(cards, board, kind = 'move') {
  if (kind === 'resize') return cards.filter(c => c.type === 'frame').map(c => ({ op: 'update', id: c.id, set: { props: { device: 'Custom' } } }));
  const commands = [];
  for (const c of cards) {
    if (c.type === 'frame' || c.type === 'section') continue;
    const oldParent = board.cards.find(f => f.id === c.parent);
    if (oldParent && (oldParent.type !== 'frame' || cards.some(k => k.id === oldParent.id))) continue;
    const f = frameAt(board.cards, c);
    if ((c.parent || '') !== (f?.id || '')) commands.push({ op: 'update', id: c.id, set: { parent: f?.id || '' } });
    if (f && board.cards.indexOf(c) < board.cards.indexOf(f)) commands.push({ op: 'order', id: c.id, to: 'front' });
  }
  return commands;
}
// Keep the source's thin rules and small icons visible despite the board's minimum hit area.
export function wireCard(raw, x = 0, y = 0, parent, group) {
  const { type, text = '', color = 'plain', x: rx = 0, y: ry = 0, w = 160, h = 100, ...props } = raw;
  if (w < 40) props.visualW = w;
  if (h < 24) props.visualH = h;
  if (type === 'text' || type === 'icon') props.ink = color === 'plain' ? '#27272a' : color;
  return { op: 'create', newId: uid(), type, text, color: /^#[0-9a-f]{6}$/i.test(color) ? color : 'plain', x: x + rx, y: y + ry, w, h, rot: 0, props, ...(parent ? { parent } : {}), ...(group ? { group } : {}) };
}
export function screenCommand(device, at) {
  const [w, h, radius] = DEVICES[device] || DEVICES.iPhone;
  return wireCard({ type: 'frame', text: device + ' screen', w, h, device, radius, fill: '#ffffff' }, at.x, at.y);
}
export function pieceCommands(name, at, cards, options = {}) {
  const p = PIECES[name]; if (!p) return [];
  let f = frameAt(cards, { x: at.x, y: at.y, w: 0, h: 0 });
  const commands = [], group = uid();
  if (p.web && !f) {
    const frame = wireCard({ type: 'frame', text: name + ' template', w: 1200, h: 600, device: 'Custom', radius: 10, fill: '#ffffff' }, at.x, at.y);
    commands.push(frame); f = { ...frame, id: frame.newId };
  }
  const width = (p.bar || p.web) && f ? f.w : p.web ? 1200 : p.w || 360;
  // Website layouts scale to narrow screens without negative column widths.
  const sourceWidth = p.web ? Math.max(1200, width) : width, scale = width / sourceWidth;
  const items = p.make(sourceWidth, options).map(it => ({ ...it, x: it.x * scale, y: it.y * scale, w: it.w * scale, h: it.h * scale, ...(it.size ? { size: it.size * scale } : {}), ...(it.radius ? { radius: it.radius * scale } : {}) }));
  const x = (p.bar || p.web) && f ? f.x : at.x;
  const y = p.bar === 'bottom' && f ? Math.max(f.y, f.y + f.h - 64) : at.y;
  for (const it of items) commands.push(wireCard(it, x, y, f?.id, group));
  const bottom = y + Math.max(...items.map(it => it.y + it.h));
  if (f && bottom > f.y + f.h) commands.push({ op: 'update', id: f.id, set: { h: Math.min(4000, bottom - f.y + 24) } });
  if (commands[0]?.type === 'frame') commands[0].h = Math.max(200, bottom - f.y);
  return commands;
}
export function sectionCommands(cards) {
  if (!cards.length) return [];
  const b = bounds(cards), command = wireCard({ type: 'section', text: 'Section', w: b.right - b.x + 72, h: b.bottom - b.y + 94, fill: '#cbd5e1', radius: 24 }, b.x - 36, b.y - 58);
  return [command, { op: 'order', id: command.newId, to: 'back' }];
}
export function alignmentCommands(cards, all, direction) {
  if (!cards.length) return [];
  const frame = cards.length === 1 && all.find(c => c.id === cards[0].parent && c.type === 'frame');
  if (cards.length === 1 && !frame) return [];
  const b = bounds(frame ? [frame] : cards), shifts = new Map();
  if (direction === 'across' || direction === 'down') {
    if (cards.length < 3) return [];
    const horizontal = direction === 'across', axis = horizontal ? 'x' : 'y', dimension = horizontal ? 'w' : 'h';
    const sorted = [...cards].sort((a, b) => a[axis] - b[axis]);
    const gap = (sorted.at(-1)[axis] + sorted.at(-1)[dimension] - sorted[0][axis] - sorted.reduce((sum, c) => sum + c[dimension], 0)) / (cards.length - 1);
    let at = sorted[0][axis];
    for (const c of sorted) { shifts.set(c.id, { x: horizontal ? at - c.x : 0, y: horizontal ? 0 : at - c.y }); at += c[dimension] + gap; }
  } else {
    for (const c of cards) shifts.set(c.id, { x: direction === 'left' ? b.x - c.x : direction === 'centre' ? (b.x + b.right - c.w) / 2 - c.x : direction === 'right' ? b.right - c.w - c.x : 0, y: direction === 'top' ? b.y - c.y : direction === 'middle' ? (b.y + b.bottom - c.h) / 2 - c.y : direction === 'bottom' ? b.bottom - c.h - c.y : 0 });
  }
  const moves = new Map();
  for (const c of cards) for (const child of expandDrag([c], { cards: all }, { metaKey: true })) if (!moves.has(child.id)) { const d = shifts.get(c.id); moves.set(child.id, { op: 'move', id: child.id, x: child.x + d.x, y: child.y + d.y }); }
  return [...moves.values()];
}
