import type { CardId } from '@aegis/domain';
import type { FeatureContext, FeatureWorkspace } from '../../composition.js';
import type { Sheet } from '../../cards/data/sheet-model.js';
export interface Cell { readonly r: number; readonly c: number }
export type Edit = { readonly kind: 'idle' } | { readonly kind: 'editing'; readonly input: 'cell' | 'bar'; readonly cell: Cell; readonly base: string; readonly text: string };
export interface SheetSession {
  readonly selected: Cell;
  readonly anchor: Cell | null;
  readonly edit: Edit;
  readonly error: string;
  readonly scroll: { readonly top: number; readonly left: number };
}
const sessions = new WeakMap<FeatureWorkspace, Map<CardId, ReturnType<typeof createSession>>>();
export function rawCell(data: Sheet, cell: Cell): string { return cell.r ? data.rows[cell.r - 1]?.cells[cell.c] ?? '' : data.columns[cell.c]?.label ?? ''; }
export function rangeOf({ selected, anchor }: Pick<SheetSession, 'selected' | 'anchor'>) {
  const start = anchor ?? selected;
  return { r0: Math.min(start.r, selected.r), r1: Math.max(start.r, selected.r), c0: Math.min(start.c, selected.c), c1: Math.max(start.c, selected.c) };
}
function createSession(workspace: FeatureWorkspace, cardId: CardId) {
  let snapshot: SheetSession = { selected: { r: 1, c: 0 }, anchor: null, edit: { kind: 'idle' }, error: '', scroll: { top: 0, left: 0 } };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<SheetSession>) => { snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener(); };
  const data = () => { const card = workspace.card(cardId).getSnapshot(); return card?.kind === 'sheet' ? card.data : null; };
  const setCell = (cell: Cell, text: string): boolean => {
    const current = data();
    if (!current) { update({ error: 'This sheet was deleted.' }); return false; }
    if (rawCell(current, cell) === text) return true;
    const result = cell.r ? workspace.submit([{ op: 'object_set', id: cardId, path: ['rows', cell.r - 1, 'cells', cell.c], value: text }]) : workspace.submit([{ op: 'object_set', id: cardId, path: ['columns', cell.c, 'label'], value: text }]);
    if (result.kind === 'rejected') { update({ error: result.errors.map(error => error.reason).join('. ') }); return false; }
    update({ error: '' }); return true;
  };
  const flush = (): boolean => {
    if (snapshot.edit.kind === 'idle') return true;
    const edit = snapshot.edit, current = data();
    if (!current) { update({ error: 'This sheet was deleted. Copy your value before closing.' }); return false; }
    const latest = rawCell(current, edit.cell);
    if (latest !== edit.base && latest !== edit.text && edit.text !== edit.base) { update({ error: 'This cell changed while you were editing. Copy your value or press Escape to keep the latest value.' }); return false; }
    if (edit.text !== edit.base && !setCell(edit.cell, edit.text)) return false;
    update({ edit: { kind: 'idle' }, error: '' }); return true;
  };
  return { getSnapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, update, flush, setCell,
    select: (cell: Cell, extend = false) => { const current = data(); if (!current) return; update({ selected: { r: Math.max(0, Math.min(current.rows.length, cell.r)), c: Math.max(0, Math.min(current.columns.length - 1, cell.c)) }, anchor: extend ? snapshot.anchor ?? snapshot.selected : null }); },
    begin: (seed?: string, input: 'cell' | 'bar' = 'cell') => { const current = data(); if (!current || snapshot.edit.kind === 'editing') return; const base = rawCell(current, snapshot.selected); update({ edit: { kind: 'editing', input, cell: snapshot.selected, base, text: seed ?? base }, error: '' }); },
    change: (text: string) => { if (snapshot.edit.kind === 'editing') update({ edit: { ...snapshot.edit, text } }); },
    cancel: () => update({ edit: { kind: 'idle' }, error: '' }),
  };
}
export function sheetSession(workspace: FeatureWorkspace, cardId: CardId) {
  let byId = sessions.get(workspace);
  if (!byId) { byId = new Map(); sessions.set(workspace, byId); }
  let session = byId.get(cardId);
  if (!session) { session = createSession(workspace, cardId); byId.set(cardId, session); }
  return session;
}
export function flushSheet(context: FeatureContext, id: CardId): boolean { return sheetSession(context.workspace, id).flush(); }
