import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ObjectData } from './model.js';
import { useDraftFlush, useObjectEditing } from './context.js';
import { Text } from './Text.js';
import { Trend } from './Trend.js';

type Cell = ObjectData['table']['rows'][number]['cells'][number];
type Edit = { readonly r: number; readonly c: number; readonly text: string; readonly base: Cell } | null;
export function Table({ data }: { readonly data: ObjectData['table'] }) {
  const { set } = useObjectEditing(), grid = useRef<HTMLTableElement>(null), scroll = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Edit>(null), draft = useRef<Edit>(null), [overflow, setOverflow] = useState(false), [error, setError] = useState('');
  const composing = useRef(false);
  const cellAt = (r: number, c: number) => grid.current?.querySelector<HTMLTableCellElement>(`[data-row="${r}"][data-column="${c}"]`);
  function change(value: Edit) { draft.current = value; setEditing(value); }
  function cue() { const node = scroll.current; if (node) setOverflow(node.scrollWidth - node.clientWidth - node.scrollLeft > 1); }
  useEffect(() => {
    const observer = new ResizeObserver(cue);
    if (scroll.current) observer.observe(scroll.current);
    if (grid.current) observer.observe(grid.current);
    cue(); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (editing) { input.current?.focus({ preventScroll: true }); input.current?.select(); } }, [editing?.r, editing?.c]);
  function begin(r: number, c: number, text?: string) {
    const column = data.columns[c], value = data.rows[r]?.cells[c] ?? null;
    if (!column?.editable || column.kind === 'sparkline' || draft.current?.r === r && draft.current.c === c) return;
    if (!commit()) return;
    change({ r, c, base: value, text: text ?? (Array.isArray(value) ? '' : String(value ?? '')) });
  }
  function commit(): boolean {
    const active = draft.current;
    if (!active) return true;
    const field = input.current, column = data.columns[active.c];
    if (!field || !column || composing.current || !field.reportValidity()) return false;
    const value = column.kind === 'text' ? field.value : field.value === '' ? null : field.valueAsNumber;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    const latest = data.rows[active.r]?.cells[active.c] ?? null;
    if (latest !== active.base && value !== latest && value !== active.base) { setError('This cell changed while you were editing. Copy your value or press Escape to keep the latest value.'); return false; }
    if (value !== active.base && !set(['rows', active.r, 'cells', active.c], value)) return false;
    change(null); setError(''); return true;
  }
  useDraftFlush(commit);
  function key(event: KeyboardEvent<HTMLTableCellElement>, r: number, c: number) {
    const field = event.target instanceof HTMLInputElement ? event.target : null;
    if (!field && (event.metaKey || event.ctrlKey) && ['k', 'z'].includes(event.key.toLowerCase())) return;
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (field) {
      if (event.key === 'Escape') { event.preventDefault(); change(null); setError(''); queueMicrotask(() => cellAt(r, c)?.focus({ preventScroll: true })); }
      else if (event.key === 'Enter' || event.key === 'Tab') {
        const index = r * data.columns.length + c + (event.shiftKey ? -1 : 1) * (event.key === 'Enter' ? data.columns.length : 1);
        const next = index >= 0 && index < data.rows.length * data.columns.length ? cellAt(Math.floor(index / data.columns.length), index % data.columns.length) : null;
        if (next || event.key === 'Enter') event.preventDefault();
        if (!commit()) { event.preventDefault(); return; }
        if (next || event.key === 'Enter') queueMicrotask(() => (next ?? cellAt(r, c))?.focus({ preventScroll: true }));
      }
      return;
    }
    if (event.key === 'Escape') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); begin(r, c); }
    else if (event.key.length === 1 && data.columns[c]?.editable && data.columns[c]?.kind !== 'sparkline') { event.preventDefault(); begin(r, c, event.key); }
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault(); cellAt(r + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0), c + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))?.focus({ preventScroll: true });
    }
  }
  return <><div className={`table-viewport${overflow ? ' overflow' : ''}`}><div className="table-scroll" ref={scroll} onScroll={cue}><table ref={grid} className="data-grid" role="grid" aria-label="Data table"><thead><tr>{data.columns.map((column, c) => <th role="columnheader" className={column.kind !== 'text' ? 'numeric' : undefined} scope="col" key={c}><Text value={column.label} label={`Column ${c + 1} label`} path={['columns', c, 'label']} maxLength={60} /></th>)}</tr></thead><tbody>{data.rows.map((row, r) => <tr key={r}>{data.columns.map((column, c) => {
    const value = row.cells[c] ?? null, active = editing?.r === r && editing.c === c;
    return <td role="gridcell" tabIndex={0} aria-label={`${column.label}, row ${r + 1}`} aria-readonly={!column.editable || column.kind === 'sparkline'} data-row={r} data-column={c} className={`${column.kind !== 'text' ? 'numeric' : ''}${active ? ' editing' : ''}`} key={c} onClick={() => begin(r, c)} onPointerDown={event => event.stopPropagation()} onKeyDown={event => key(event, r, c)}>{column.kind === 'sparkline' && Array.isArray(value) ? <Trend values={value} label={column.label} /> : <span className={`cell-value${value === null ? ' meta' : ''}`}>{typeof value === 'number' ? value.toLocaleString('en-AU') : Array.isArray(value) ? value.join(', ') : value ?? '-'}</span>}{active ? <input ref={input} aria-label={`Edit ${column.label}, row ${r + 1}`} type={column.kind === 'text' ? 'text' : 'number'} min={column.kind === 'bar' ? 0 : undefined} step="any" maxLength={2000} defaultValue={editing.text} onChange={event => { const current = draft.current; if (current) change({ ...current, text: event.currentTarget.value }); }} onBlur={() => { commit(); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} /> : null}{column.kind === 'bar' && typeof value === 'number' ? <span className="track" role="meter" aria-label={column.label} aria-valuemin={0} aria-valuemax={Math.max(value, column.max ?? 1)} aria-valuenow={value} aria-valuetext={`${value} of ${column.max}`}><span style={{ width: `${Math.min(100, value / (column.max ?? 1) * 100)}%` }} /></span> : null}</td>;
  })}</tr>)}{!data.rows.length ? <tr><td role="gridcell" colSpan={data.columns.length} className="empty">No rows yet</td></tr> : null}</tbody></table></div></div>{error ? <p role="alert">{error}</p> : null}{data.note ? <p className="footnote"><Text value={data.note} label="Table note" path={['note']} multiline maxLength={200} /></p> : null}</>;
}
