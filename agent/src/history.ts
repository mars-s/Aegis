import { z } from 'zod/v4';
import type { LegacyCard, JsonValue, JsonRecord, Link } from '@aegis/domain/schema';
import { JsonRecordSchema, LegacyCardSchema, preserve } from '@aegis/domain/schema';
import { HistoryBoardSchema, historyEntries } from './history-schema.js';
import type { HistoryBoard } from './history-schema.js';
import { displayBrief } from './transcript.js';
interface FieldChange { path: string[]; before: JsonValue | undefined; after: JsonValue | undefined }
interface CardChange { before: LegacyCard | null; after: LegacyCard | null; fields: Map<string, FieldChange> }
interface Pair<T> { before: T; after: T }
interface RequestDiff { cards: Map<string, CardChange>; fields: Map<string, Pair<JsonValue | undefined>>; links: Pair<Link[] | undefined> | undefined; order: Pair<string[] | undefined> | undefined }
const record = (value: JsonValue | undefined): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);
// Round 2 history: display records and inverse patches share the durable request IDs.
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function sameWindow(actual: LegacyCard | undefined | null, expected: LegacyCard | null) {
  if (same(actual, expected)) return true;
  // Mounting a long note grows it automatically. A manual resize sets fixedHeight.
  if (!actual || !expected || !['note', 'todo'].includes(actual.type) || actual.props?.fixedHeight || (actual.h ?? 0) < (expected.h ?? 0) || actual.props?.autoHeightMin !== (expected.props?.autoHeightMin ?? expected.h)) return false;
  const normalised = structuredClone(actual); if (expected.h === undefined) delete normalised.h; else normalised.h = expected.h; normalised.props = { ...actual.props };
  if (expected.props?.autoHeightMin === undefined) delete normalised.props.autoHeightMin;
  if (!expected.props && !Object.keys(normalised.props).length) delete normalised.props;
  return same(normalised, expected);
}
const titleOf = (card: LegacyCard | null | undefined): string => card?.heading || card?.text?.split('\n')[0] || (card?.data && 'title' in card.data && typeof card.data.title === 'string' ? card.data.title : '') || card?.kind || card?.type || 'Untitled window';
// Round 3 Undo: objects have independent fields; ordered content arrays remain one field.
function changedFields(before: JsonValue | undefined, after: JsonValue | undefined, path: string[] = []): FieldChange[] {
  if (same(before, after)) return [];
  if ((record(before) || before === undefined) && (record(after) || after === undefined)) {
    const keys = new Set([...Object.keys(record(before) ? before : {}), ...Object.keys(record(after) ? after : {})]);
    if (keys.size) return [...keys].flatMap(key => changedFields(record(before) ? before[key] : undefined, record(after) ? after[key] : undefined, [...path, key]));
  }
  return [{ path, before, after }];
}
const fieldAt = (value: JsonValue | undefined, path: readonly string[]): JsonValue | undefined => path.reduce<JsonValue | undefined>((v, key) => record(v) ? v[key] : undefined, value);
function restoreField(card: JsonRecord, { path, before }: Pick<FieldChange, 'path' | 'before'>): void {
  let target = card;
  for (const key of path.slice(0, -1)) {
    const value = target[key];
    if (record(value)) target = value;
    else { const child: JsonRecord = {}; target[key] = child; target = child; }
  }
  const last = path.at(-1); if (last === undefined) return;
  if (before === undefined) delete target[last]; else target[last] = structuredClone(before);
}
function undoConflict(board: HistoryBoard, diff: RequestDiff) {
  const current = new Map<string, LegacyCard>(board.cards.map(c => [c.id, c]));
  for (const [id, change] of diff.cards) {
    const actual = current.get(id);
    if (!change.before || !change.after) {
      if (!sameWindow(actual, change.after)) return `${titleOf(change.after ?? change.before)} was edited again since this request`;
    } else {
      if (!actual) return `${titleOf(change.after)} was deleted since this request`;
      for (const field of change.fields.values()) if (!same(fieldAt(actual, field.path), field.after)) {
        const label = new Map([['x', 'Position'], ['y', 'Position'], ['w', 'Size'], ['h', 'Size'], ['text', 'Text'], ['heading', 'Title'], ['props', 'Settings'], ['data', 'Content'], ['rotation', 'Rotation']]).get(field.path[0] ?? '') ?? 'Content';
        return `${label} of ${titleOf(change.after)} changed since this request`;
      }
    }
  }
  const created = new Set([...diff.cards].filter(([, c]) => !c.before && c.after).map(([id]) => id));
  if (board.links.some(link => (created.has(link.a) || created.has(link.b)) && !diff.links?.after?.some(l => same(l, link)))) return 'A new connection uses a created window. Use normal Undo to review the later changes first.';
  if (diff.links && !same(board.links, diff.links.after)) return 'Connections changed again. Use normal Undo to review the later changes first.';
  if (diff.order) {
    const common = new Set((diff.order.after ?? []).filter(id => current.has(id)));
    if (!same(board.cards.filter(c => common.has(c.id)).map(c => c.id), (diff.order.after ?? []).filter(id => common.has(id)))) return 'Window order changed again. Use normal Undo to review the later changes first.';
  }
  for (const [key, value] of diff.fields) if (!same(board[key], value.after)) return 'The board changed again. Use normal Undo to review the later changes first.';
  return null;
}
export function requestChanges(input: unknown, id: string): RequestDiff {
  const entries = historyEntries(input);
  const cards = new Map<string, CardChange>(), fields = new Map<string, Pair<JsonValue | undefined>>(); let links: RequestDiff['links'], order: RequestDiff['order'];
  for (const entry of entries) {
    if (entry.kind === 'aegis.normalise') {
      const before = new Map(entry.data.before.cards.map(c => [c.id, c]));
      for (const measured of entry.data.after.cards) {
        const change = cards.get(measured.id), previous = before.get(measured.id);
        if (!change?.after || !previous) continue;
        const after = JsonRecordSchema.parse(change.after);
        // Advance only derived fields whose previous value is still the recorded value.
        // A later content edit, move or manual resize must keep its own conflict.
        for (const path of [['x'], ['y'], ['h'], ['data', 'state']]) {
          const oldValue = fieldAt(previous, path), nextValue = fieldAt(measured, path);
          if (path[0] === 'data' && oldValue !== undefined) continue;
          if (same(oldValue, nextValue) || !same(fieldAt(after, path), oldValue)) continue;
          if (change.before) {
            const fieldKey = JSON.stringify(path), first = change.fields.get(fieldKey);
            const field = { path, before: first ? first.before : fieldAt(after, path), after: nextValue };
            if (same(field.before, field.after)) change.fields.delete(fieldKey); else change.fields.set(fieldKey, field);
          }
          restoreField(after, { path, before: nextValue });
        }
        cards.set(measured.id, { ...change, after: preserve(LegacyCardSchema, after) });
      }
      continue;
    }
    if (entry.kind !== 'aegis.change' || entry.data.requestId !== id) continue;
    const { before, after } = entry.data;
    const old = new Map<string, LegacyCard>(before.cards.map(c => [c.id, c])), next = new Map<string, LegacyCard>(after.cards.map(c => [c.id, c]));
    for (const key of new Set([...old.keys(), ...next.keys(), ...after.removed])) {
      const previous = cards.get(key);
      const before = old.get(key) ?? null, afterCard = next.get(key) ?? null, changed = previous?.fields ?? new Map();
      if (before && afterCard) for (const field of changedFields(before, afterCard)) {
        const key = JSON.stringify(field.path), first = changed.get(key);
        changed.set(key, { ...field, before: first ? first.before : field.before });
      }
      for (const [key, field] of changed) if (same(field.before, field.after)) changed.delete(key);
      cards.set(key, { before: previous ? previous.before : before, after: afterCard, fields: changed });
    }
    for (const [key, value] of Object.entries(after.fields)) fields.set(key, { before: fields.has(key) ? fields.get(key)?.before : before.fields[key], after: value });
    if (after.links) links = { before: links ? links.before : before.links, after: after.links };
    if (after.order) order = { before: order ? order.before : before.order, after: after.order };
  }
  return { cards: new Map([...cards].filter(([, c]) => c.before && c.after ? c.fields.size : !same(c.before, c.after))), fields, links, order };
}
export function historyFromView(input: unknown, boardInput?: unknown) {
  const value = z.object({ entries: z.array(z.unknown()).default([]) }).parse(input);
  const entries = historyEntries(value.entries);
  const board = boardInput === undefined ? undefined : HistoryBoardSchema.parse(boardInput);
  return entries.filter(e => e.kind === 'aegis.request').map(e => {
    const { requestId: id, brief, started } = e.data;
    const ending = entries.findLast(e => e.kind === 'aegis.request.end' && e.data.requestId === id);
    const end = ending?.kind === 'aegis.request.end' ? ending.data : undefined;
    const undone = entries.some(e => e.kind === 'aegis.request.undo' && e.data.requestId === id);
    const diff = requestChanges(entries, id);
    const changes = [...diff.cards].map(([id, { before, after, fields }]) => {
      const actions = [];
      if (!before) actions.push('Created');
      else if (!after) actions.push('Deleted');
      else {
        if ([...fields.values()].some(f => ['x', 'y'].includes(f.path[0] ?? ''))) actions.push('Moved');
        if ([...fields.values()].some(f => !['x', 'y'].includes(f.path[0] ?? ''))) actions.push('Edited');
      }
      return { id, title: titleOf(after ?? before), previousTitle: before && after && titleOf(before) !== titleOf(after) ? titleOf(before) : null, actions };
    });
    const counts = ['Created', 'Moved', 'Edited', 'Deleted'].flatMap(action => {
      const n = changes.filter(c => c.actions.includes(action)).length;
      return n ? [`${action.toLowerCase()} ${n} window${n === 1 ? '' : 's'}`] : [];
    });
    if (diff.links || diff.fields.size || (diff.order && !changes.length)) counts.push('updated the board');
    const summary = counts.join(', ') || (end ? 'No board changes' : 'Working on your request');
    const undoBlockedReason = end && !undone && board ? undoConflict(board, diff) : null;
    return { id, brief: displayBrief(brief), started, finished: end?.finished ?? null, elapsedMs: end ? Math.max(0, end.finished - started) : null,
      summary: (summary[0] ?? '').toUpperCase() + summary.slice(1), changes, undone, undoBlockedReason, canUndo: !!end && !undone && !undoBlockedReason && !!(changes.length || counts.length) };
  });
}
export function requestUndoCommands(boardInput: unknown, entries: unknown, id: string): [{ op: 'restore'; cards: LegacyCard[]; links: Link[] }, { op: 'board_set'; set: Record<string, JsonValue | undefined> }] {
  const board = HistoryBoardSchema.parse(boardInput);
  const diff = requestChanges(entries, id), current = new Map<string, LegacyCard>(board.cards.map(c => [c.id, c]));
  const conflict = undoConflict(board, diff); if (conflict) throw new Error(conflict);
  for (const [key, change] of diff.cards) {
    if (!change.before) current.delete(key);
    else if (!change.after) current.set(key, change.before);
    else {
      const card = JsonRecordSchema.parse(current.get(key));
      for (const field of change.fields.values()) restoreField(card, field);
      // Remove containers introduced by this request only when no later fields remain in them.
      for (const field of change.fields.values()) for (let depth = field.path.length - 1; depth > 0; depth--) {
        const path = field.path.slice(0, depth), value = fieldAt(card, path);
        if (fieldAt(change.before, path) === undefined && value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) restoreField(card, { path, before: undefined });
      }
      current.set(key, preserve(LegacyCardSchema, card));
    }
  }
  const order = diff.order?.before ?? board.cards.map(c => c.id);
  const cards = order.map(key => { const c = current.get(key); current.delete(key); return c; }).filter((card): card is LegacyCard => card !== undefined);
  cards.push(...current.values());
  return [{ op: 'restore', cards, links: diff.links?.before ?? board.links },
    { op: 'board_set', set: Object.fromEntries([...diff.fields].map(([key, value]) => [key, value.before])) }];
}
