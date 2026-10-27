// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { z } from 'zod/v4';
import { BoardIdSchema, CardIdSchema, CardSchema, CommandSchema, LinkIdSchema, LinkSchema } from '@aegis/domain';
import type { Board, Card, CardId, Command } from '@aegis/domain';
export interface Point { readonly x: number; readonly y: number }
export function bounds(cards: readonly Card[]) {
  return cards.length ? { x: Math.min(...cards.map(card => card.x)), y: Math.min(...cards.map(card => card.y)), right: Math.max(...cards.map(card => card.x + card.w)), bottom: Math.max(...cards.map(card => card.y + card.h)) } : { x: 0, y: 0, right: 0, bottom: 0 };
}
export function descendants(board: Board, ids: readonly CardId[]): Card[] {
  const children = new Map<CardId, Set<CardId>>();
  function add(parent: CardId, child: CardId) { let entries = children.get(parent); if (!entries) { entries = new Set(); children.set(parent, entries); } entries.add(child); }
  for (const card of board.cards) { if (card.parent) add(card.parent, card.id); for (const id of card.props?.kids ?? []) add(card.id, id); }
  const selected = new Set(ids), queue = [...ids];
  for (const parent of queue) for (const child of children.get(parent) ?? []) if (!selected.has(child)) { selected.add(child); queue.push(child); }
  return board.cards.filter(card => selected.has(card.id));
}
export function effectiveFlag(board: Board, card: Card, flag: 'hidden' | 'locked'): boolean {
  const byId = new Map(board.cards.map(entry => [entry.id, entry])), seen = new Set<CardId>(), queue = [card];
  const owners = new Map<CardId, Card[]>();
  for (const parent of board.cards) for (const kid of parent.props?.kids ?? []) { const entries = owners.get(kid) ?? []; entries.push(parent); owners.set(kid, entries); }
  for (const entry of queue) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (entry.props?.[flag] === true) return true;
    const parent = entry.parent ? byId.get(entry.parent) : undefined;
    if (parent) queue.push(parent);
    queue.push(...owners.get(entry.id) ?? []);
  }
  return false;
}
export const ClipSchema = z.object({ from: BoardIdSchema, cards: z.array(CardSchema), links: z.array(LinkSchema), text: z.string() });
export type Clip = z.output<typeof ClipSchema>;
export function makeClip(board: Board, ids: readonly CardId[]): Clip {
  const selected = new Set(ids), groups = new Set(board.cards.filter(card => selected.has(card.id)).flatMap(card => card.group ? [card.group] : []));
  const cards = descendants(board, [...ids, ...board.cards.filter(card => card.group && groups.has(card.group)).map(card => card.id)]), keep = new Set(cards.map(card => card.id));
  return structuredClone({ from: board.id, cards, links: board.links.filter(link => keep.has(link.a) && keep.has(link.b)), text: cards.map(card => [card.heading, card.text, ...(card.items ?? []).map(item => `${item.done ? '[x]' : '[ ]'} ${item.text}`), card.url].filter(Boolean).join('\n')).join('\n\n') });
}
export function cloneCommands(clip: Clip, board: Board, centre: Point, offset = 30): { readonly commands: Command[]; readonly ids: CardId[] } {
  const idMap = new Map(clip.cards.map(card => [card.id, CardIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 12))])), groups = new Map<string, string>();
  const box = bounds(clip.cards), same = clip.from === board.id, dx = same ? offset : centre.x - (box.x + box.right) / 2, dy = same ? offset : centre.y - (box.y + box.bottom) / 2;
  const commands: Command[] = [];
  for (const card of clip.cards) {
    const { id, parent, group, props, ...content } = structuredClone(card), newId = idMap.get(id);
    if (!newId) continue;
    if (group && !groups.has(group)) groups.set(group, crypto.randomUUID());
    const nextProps = props ? { ...props, ...(props.kids ? { kids: props.kids.flatMap(kid => { const next = idMap.get(kid); return next ? [next] : []; }) } : {}), ...(props.colOf ? { colOf: Object.fromEntries(Object.entries(props.colOf).flatMap(([kid, col]) => { const next = idMap.get(CardIdSchema.parse(kid)); return next ? [[next, col]] : []; })) } : {}) } : undefined;
    commands.push(CommandSchema.parse({ ...content, op: 'create', newId, x: card.x + dx, y: card.y + dy, ...(parent && idMap.has(parent) ? { parent: idMap.get(parent) } : {}), ...(group ? { group: groups.get(group) } : {}), ...(nextProps ? { props: nextProps } : {}) }));
  }
  for (const link of clip.links) {
    const a = idMap.get(link.a), b = idMap.get(link.b);
    if (!a || !b) continue;
    const id = LinkIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 12)), { id: oldId, a: oldA, b: oldB, label, ...style } = link;
    void oldId; void oldA; void oldB;
    commands.push({ op: 'connect', a, b, newId: id, ...(label === undefined ? {} : { label }) });
    if (Object.keys(style).length) commands.push(CommandSchema.parse({ op: 'link_update', id, set: style }));
  }
  return { commands, ids: [...idMap.values()] };
}
export type Arrange = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-x' | 'distribute-y';
export function arrange(board: Board, ids: readonly CardId[], how: Arrange): Command[] {
  const selected = new Set(ids), cards = board.cards.filter(card => selected.has(card.id) && !effectiveFlag(board, card, 'locked')), groups = new Map<string, Card[]>();
  for (const card of cards) { const key = card.group || card.id, entries = groups.get(key) ?? []; entries.push(card); groups.set(key, entries); }
  const units = [...groups.values()].map(entries => ({ cards: entries, ...bounds(entries) })), distributed = how === 'distribute-x' || how === 'distribute-y';
  if (units.length < 2 || distributed && units.length < 3) return [];
  const box = bounds(cards), horizontal = how === 'distribute-x', axis = horizontal ? 'x' : 'y', edge = horizontal ? 'right' : 'bottom';
  let at = box[axis];
  const ordered = [...units].sort((a, b) => a[axis] - b[axis]), gap = (box[edge] - box[axis] - units.reduce((sum, unit) => sum + unit[edge] - unit[axis], 0)) / (units.length - 1);
  return (distributed ? ordered : units).flatMap(unit => {
    let dx = 0, dy = 0;
    switch (how) {
      case 'left': dx = box.x - unit.x; break;
      case 'centre': dx = (box.x + box.right - unit.x - unit.right) / 2; break;
      case 'right': dx = box.right - unit.right; break;
      case 'top': dy = box.y - unit.y; break;
      case 'middle': dy = (box.y + box.bottom - unit.y - unit.bottom) / 2; break;
      case 'bottom': dy = box.bottom - unit.bottom; break;
      case 'distribute-x': dx = at - unit.x; at += unit.right - unit.x + gap; break;
      case 'distribute-y': dy = at - unit.y; at += unit.bottom - unit.y + gap; break;
      default: { const exhaustive: never = how; return exhaustive; }
    }
    return unit.cards.map(card => ({ op: 'move', id: card.id, x: Math.round(card.x + dx), y: Math.round(card.y + dy) } satisfies Command));
  });
}
export function stackCommands(board: Board, ids: readonly CardId[], direction: 'front' | 'back' | 'forward' | 'backward'): Command[] {
  const selected = new Set(ids), moving = board.cards.filter(card => selected.has(card.id));
  if (!moving.length) return [];
  if (direction === 'front' || direction === 'back') return [{ op: 'order', ids: moving.map(card => card.id), to: direction }];
  const ordered = [...board.cards], forward = direction === 'forward';
  for (const card of forward ? [...moving].reverse() : moving) {
    const i = ordered.indexOf(card), j = i + (forward ? 1 : -1), adjacent = ordered[j];
    if (adjacent && !selected.has(adjacent.id)) { ordered[i] = adjacent; ordered[j] = card; }
  }
  return ordered.map((card, to) => ({ op: 'order', ids: [card.id], to }));
}
export function lineHeightDefault(type: Card['type']): number { switch (type) { case 'note': return 1.45; case 'title': return 1; case 'todo': return 1.35; case 'shape': return 1.3; case 'coll': return 1.2; default: return 1.4; } }
export function snapRotation(degrees: number, shift = false, single = false): number {
  const angle = ((degrees % 360) + 540) % 360 - 180, near = Math.round(angle / 15) * 15;
  return shift || Math.abs(angle - near) < (single ? 4 : 2) ? near || 0 : angle;
}
export function toolbarOrder(defaults: readonly string[], saved: readonly string[] = []): string[] {
  const order = [...new Set(saved.filter(id => defaults.includes(id)))];
  defaults.forEach((id, index) => { if (!order.includes(id)) order.splice(Math.min(index, order.length), 0, id); }); return order;
}
