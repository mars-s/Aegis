// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import type { Board, Card, CardId, Command, JsonRecord } from '@aegis/domain/schema';
import { CardIdSchema, JsonRecordSchema } from '@aegis/domain/schema';
import { PIECES } from './pieces.js';
import type { PieceOptions, WireDefinition } from './types.js';
export { PIECES };
export const DEVICES = { iPhone: [393, 852, 44], Android: [412, 915, 28], iPad: [834, 1194, 20], Desktop: [1440, 1024, 10], Watch: [205, 251, 40] } as const;
export const TYPES = ['frame', 'box', 'text', 'icon', 'font', 'section'] as const;
export const uid = () => CardIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 16));
type Geometry = Pick<Card, 'x' | 'y' | 'w' | 'h'>;
type BoardCards = Pick<Board, 'cards'>;
type Modifiers = { readonly shiftKey?: boolean; readonly metaKey?: boolean; readonly ctrlKey?: boolean };
export const bounds = (cards: readonly Geometry[]) => ({ x: Math.min(...cards.map(c => c.x)), y: Math.min(...cards.map(c => c.y)), right: Math.max(...cards.map(c => c.x + c.w)), bottom: Math.max(...cards.map(c => c.y + c.h)) });
export const containsCentre = (frame: Geometry, card: Geometry) => card.x + card.w / 2 > frame.x && card.x + card.w / 2 < frame.x + frame.w && card.y + card.h / 2 > frame.y && card.y + card.h / 2 < frame.y + frame.h;
export function frameAt(cards: readonly Card[], card: Geometry & { readonly id?: CardId }) { return [...cards].reverse().find(f => f.type === 'frame' && f.id !== card.id && containsCentre(f, card)); }
export function sectionMembers(section: Card, cards: readonly Card[]) { return cards.filter(c => c.id !== section.id && !c.hidden && !c.props?.hidden && !cards.some(p => p.id === c.parent && p.type !== 'frame') && (c.type !== 'section' || c.w * c.h < section.w * section.h) && containsCentre(section, c)); }
export function selectForDrag(ids: readonly CardId[], hitId: CardId, board: BoardCards, event: Modifiers = {}): readonly CardId[] {
  const hit = board.cards.find(c => c.id === hitId); if (!hit?.group || event.shiftKey) return ids;
  if (event.metaKey || event.ctrlKey) return [hitId];
  return board.cards.filter(c => ids.includes(c.id) || c.group === hit.group).map(c => c.id);
}
export function expandDrag(cards: readonly Card[], board: BoardCards, event: Modifiers = {}): Card[] {
  const ids = new Set(cards.map(c => c.id)), groups = new Set(cards.map(c => c.group).filter(Boolean)); let changed = true;
  while (changed) {
    changed = false;
    for (const card of board.cards.filter(c => ids.has(c.id))) {
      const children = card.type === 'section' ? sectionMembers(card, board.cards) : card.type === 'frame' ? board.cards.filter(c => c.parent === card.id) : [];
      if (card.group && groups.has(card.group) && !event.metaKey && !event.ctrlKey) children.push(...board.cards.filter(c => c.group === card.group));
      for (const child of children) if (!ids.has(child.id)) { ids.add(child.id); changed = true; }
    }
  }
  return board.cards.filter(c => ids.has(c.id));
}
export interface Guide { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
export function snapDrag(start: readonly { readonly c: Card; readonly x: number; readonly y: number }[], dx: number, dy: number, board: BoardCards, view: { readonly z: number }, { grid = false, disabled = false } = {}): { dx: number; dy: number; guides: Guide[] } {
  const moving = new Set(start.map(s => s.c.id)), mine = start.filter(s => s.c.type !== 'ink'); if (!mine.length || disabled) return { dx, dy, guides: [] };
  const box = bounds(mine.map(s => ({ ...s.c, x: s.x, y: s.y })));
  if (grid) { dx = Math.round((box.x + dx) / 26) * 26 - box.x; dy = Math.round((box.y + dy) / 26) * 26 - box.y; }
  const x0 = box.x + dx, x1 = box.right + dx, y0 = box.y + dy, y1 = box.bottom + dy;
  let bx: { d: number; at: number; o: Card } | undefined, by: typeof bx;
  for (const other of board.cards) {
    if (moving.has(other.id) || other.type === 'ink' || other.hidden || other.props?.hidden || Math.abs(other.x - x0) > 1600 / view.z || Math.abs(other.y - y0) > 1600 / view.z) continue;
    for (const a of [x0, (x0 + x1) / 2, x1]) for (const at of [other.x, other.x + other.w / 2, other.x + other.w]) { const d = at - a; if (Math.abs(d) <= 6 / view.z && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, at, o: other }; }
    for (const a of [y0, (y0 + y1) / 2, y1]) for (const at of [other.y, other.y + other.h / 2, other.y + other.h]) { const d = at - a; if (Math.abs(d) <= 6 / view.z && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, at, o: other }; }
  }
  const guides: Guide[] = [];
  if (bx) { dx += bx.d; guides.push({ x1: bx.at, y1: Math.min(y0, bx.o.y) - 10, x2: bx.at, y2: Math.max(y1, bx.o.y + bx.o.h) + 10 }); }
  if (by) { dy += by.d; guides.push({ x1: Math.min(x0, by.o.x) - 10, y1: by.at, x2: Math.max(x1, by.o.x + by.o.w) + 10, y2: by.at }); }
  return { dx, dy, guides };
}
export function dropCommands(cards: readonly Card[], board: BoardCards, kind: 'move' | 'resize' = 'move'): Command[] {
  if (kind === 'resize') return cards.filter(c => c.type === 'frame').map(c => ({ op: 'update', id: c.id, set: { props: { device: 'Custom' } } }));
  const commands: Command[] = [];
  for (const card of cards) {
    if (card.type === 'frame' || card.type === 'section') continue;
    const parent = board.cards.find(f => f.id === card.parent); if (parent && (parent.type !== 'frame' || cards.some(c => c.id === parent.id))) continue;
    const frame = frameAt(board.cards, card);
    if ((card.parent || '') !== (frame?.id || '')) commands.push({ op: 'update', id: card.id, set: { parent: frame?.id || '' } });
    if (frame && board.cards.indexOf(card) < board.cards.indexOf(frame)) commands.push({ op: 'order', id: card.id, to: 'front' });
  }
  return commands;
}
type WireRaw = Omit<WireDefinition, 'x' | 'y' | 'w' | 'h'> & Partial<Geometry>;
export function wireCard(raw: WireRaw, x = 0, y = 0, parent?: CardId, group?: string) {
  const { type, text = '', color = 'plain', x: rx = 0, y: ry = 0, w = 160, h = 100, ...style } = raw;
  const boundary: unknown = Object.fromEntries(Object.entries(style).filter(([, value]: [string, unknown]) => value !== undefined));
  const props: JsonRecord = JsonRecordSchema.parse(boundary);
  if (w < 40) props.visualW = w; if (h < 24) props.visualH = h;
  if (type === 'text' || type === 'icon') props.ink = color === 'plain' ? '#27272a' : color;
  return { op: 'create', newId: uid(), type, text, color: /^#[0-9a-f]{6}$/i.test(color) ? color : 'plain', x: x + rx, y: y + ry, w, h, rot: 0, props, ...(parent ? { parent } : {}), ...(group ? { group } : {}) } satisfies Command;
}
export function screenCommand(device: string, at: { x: number; y: number }) { const [w, h, radius] = new Map(Object.entries(DEVICES)).get(device) ?? DEVICES.iPhone; return wireCard({ type: 'frame', text: device + ' screen', w, h, device, radius, fill: '#ffffff' }, at.x, at.y); }
export function pieceCommands(name: string, at: { x: number; y: number }, cards: readonly Card[], options: PieceOptions = {}): Command[] {
  const piece = PIECES[name]; if (!piece) return [];
  let frame: (Geometry & { id: CardId }) | undefined = frameAt(cards, { x: at.x, y: at.y, w: 0, h: 0 });
  const commands: Command[] = [], group = uid(); let newFrame: ReturnType<typeof wireCard> | undefined;
  if (piece.web && !frame) { newFrame = wireCard({ type: 'frame', text: name + ' template', w: 1200, h: 600, device: 'Custom', radius: 10, fill: '#ffffff' }, at.x, at.y); commands.push(newFrame); frame = { ...newFrame, id: newFrame.newId }; }
  const width = (piece.bar || piece.web) && frame ? frame.w : piece.web ? 1200 : piece.w || 360, sourceWidth = piece.web ? Math.max(1200, width) : width, scale = width / sourceWidth;
  const items = piece.make(sourceWidth, options).map(item => ({ ...item, x: item.x * scale, y: item.y * scale, w: item.w * scale, h: item.h * scale, ...(item.size ? { size: item.size * scale } : {}), ...(item.radius ? { radius: item.radius * scale } : {}) }));
  const x = (piece.bar || piece.web) && frame ? frame.x : at.x, y = piece.bar === 'bottom' && frame ? Math.max(frame.y, frame.y + frame.h - 64) : at.y;
  for (const item of items) commands.push(wireCard(item, x, y, frame?.id, group));
  const bottom = y + Math.max(...items.map(item => item.y + item.h));
  if (frame && bottom > frame.y + frame.h) commands.push({ op: 'update', id: frame.id, set: { h: Math.min(4000, bottom - frame.y + 24) } });
  if (newFrame && frame) newFrame.h = Math.max(200, bottom - frame.y);
  return commands;
}
export function sectionCommands(cards: readonly Card[]): Command[] {
  if (!cards.length) return []; const box = bounds(cards), command = wireCard({ type: 'section', text: 'Section', w: box.right - box.x + 72, h: box.bottom - box.y + 94, fill: '#cbd5e1', radius: 24 }, box.x - 36, box.y - 58);
  return [command, { op: 'order', id: command.newId, to: 'back' }];
}
export type Alignment = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom' | 'across' | 'down';
export function alignmentCommands(cards: readonly Card[], all: Card[], direction: Alignment): Command[] {
  const first = cards[0]; if (!first) return []; const frame = cards.length === 1 ? all.find(c => c.id === first.parent && c.type === 'frame') : undefined; if (cards.length === 1 && !frame) return [];
  const box = bounds(frame ? [frame] : cards), shifts = new Map<CardId, { x: number; y: number }>();
  if (direction === 'across' || direction === 'down') {
    if (cards.length < 3) return []; const horizontal = direction === 'across', axis = horizontal ? 'x' : 'y', dimension = horizontal ? 'w' : 'h', sorted = [...cards].sort((a, b) => a[axis] - b[axis]), start = sorted[0], end = sorted.at(-1); if (!start || !end) return [];
    const gap = (end[axis] + end[dimension] - start[axis] - sorted.reduce((sum, card) => sum + card[dimension], 0)) / (cards.length - 1); let at = start[axis];
    for (const card of sorted) { shifts.set(card.id, { x: horizontal ? at - card.x : 0, y: horizontal ? 0 : at - card.y }); at += card[dimension] + gap; }
  } else for (const card of cards) shifts.set(card.id, { x: direction === 'left' ? box.x - card.x : direction === 'centre' ? (box.x + box.right - card.w) / 2 - card.x : direction === 'right' ? box.right - card.w - card.x : 0, y: direction === 'top' ? box.y - card.y : direction === 'middle' ? (box.y + box.bottom - card.h) / 2 - card.y : direction === 'bottom' ? box.bottom - card.h - card.y : 0 });
  const moves = new Map<CardId, Command>();
  for (const card of cards) { const shift = shifts.get(card.id); if (!shift) continue; for (const child of expandDrag([card], { cards: all }, { metaKey: true })) if (!moves.has(child.id)) moves.set(child.id, { op: 'move', id: child.id, x: child.x + shift.x, y: child.y + shift.y }); }
  return [...moves.values()];
}
