import { JsonSchema } from '@aegis/domain/schema';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import { COLUMN_KINDS } from '@aegis/domain/objects';
import type { CardBodyProps } from '../../composition.js';
import { useCard, useSaveState } from '../../workspace/index.js';
import type { Sheet } from '../../cards/data/sheet-model.js';
import { numeric } from '../../cards/data/sheet-model.js';
import { rangeOf, rawCell, sheetSession } from './session.js';
import type { Cell } from './session.js';
import './sheet.css';
function ToolIcon({ path }: { readonly path: string }) { return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d={path} /></svg>; }
const letter = (c: number) => String.fromCharCode(65 + c);
const labels = { text: 'Text', number: 'Number', money: 'Currency', percent: 'Percent', date: 'Date', duration: 'Duration', yes_no: 'Yes / No', rating: 'Rating', link: 'Link', tag: 'Tag' };
const format = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
export function SheetEditor({ cardId, workspace, engine }: CardBodyProps) {
  const card = useCard(workspace, cardId);
  const saving = useSaveState(workspace);
  const session = sheetSession(workspace, cardId);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const grid = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const [scrollTop, setScrollTop] = useState(state.scroll.top);
  const [viewHeight, setViewHeight] = useState(600);
  useEffect(() => { const node = grid.current; if (!node) return; node.scrollTop = state.scroll.top; node.scrollLeft = state.scroll.left; node.focus({ preventScroll: true }); const observer = new ResizeObserver(entries => { const h = entries[0]?.contentRect.height; if (h) setViewHeight(h); }); observer.observe(node); return () => { observer.disconnect(); }; }, [cardId, session]);
  useEffect(() => { if (state.edit.kind !== 'editing' || state.edit.input !== 'cell') return; input.current?.focus({ preventScroll: true }); input.current?.select(); }, [state.edit.kind, state.edit.kind === 'editing' ? state.edit.input : null]);
  useEffect(() => { engine.pin(cardId, 'dirty', state.edit.kind === 'editing'); return () => engine.pin(cardId, 'dirty', false); }, [engine, cardId, state.edit.kind]);
  useEffect(() => { const stop = () => { dragging.current = false; }; window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); }; }, []);
  if (card?.kind !== 'sheet') return null;
  const data = card.data, selected = { r: Math.min(state.selected.r, data.rows.length), c: Math.min(state.selected.c, data.columns.length - 1) };
  const range = rangeOf({ ...state, selected }), multi = range.r0 !== range.r1 || range.c0 !== range.c1;
  const column = data.columns[selected.c];
  const values = data.rows.flatMap((row, index) => index + 1 >= Math.max(1, range.r0) && index + 1 <= range.r1 ? row.cells.slice(range.c0, range.c1 + 1).flatMap(text => { const n = Number(text.replace(/[,$%\s]/g, '')); return text.trim() && Number.isFinite(n) ? [n] : []; }) : []);
  const sum = values.reduce((a, b) => a + b, 0);
  const stats = values.length > 1 ? `Sum ${format(sum)}   Average ${format(sum / values.length)}   Count ${values.length}` : multi ? `${(range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1)} cells` : '';
  const saveText = saving.kind === 'saved' ? 'Saved' : saving.kind === 'saving' ? 'Saving…' : 'Not saved';
  const mutate = (change: (next: Sheet) => void) => {
    if (!session.flush()) return;
    const latest = workspace.card(cardId).getSnapshot();
    if (latest?.kind !== 'sheet') return;
    const next = structuredClone(latest.data); change(next);
    const result = workspace.submit([{ op: 'revise', id: cardId, data: JsonSchema.parse(JSON.parse(JSON.stringify(next))) }]);
    session.update({ error: result.kind === 'rejected' ? result.errors.map(error => error.reason).join('. ') : '' });
  };
  const clear = () => mutate(next => { next.rows.forEach((row, i) => { if (i + 1 >= Math.max(1, range.r0) && i + 1 <= range.r1) row.cells = row.cells.map((text, c) => c >= range.c0 && c <= range.c1 ? '' : text); }); });
  const select = (cell: Cell, extend = false, reveal = true) => {
    if (!session.flush()) return;
    session.select(cell, extend);
    if (reveal && grid.current) {
      const rowHeight = matchMedia('(pointer: coarse)').matches ? 44 : 32;
      const node = grid.current, top = (cell.r + 1) * rowHeight;
      if (top < node.scrollTop + rowHeight) node.scrollTop = Math.max(0, top - rowHeight);
      else if (top + rowHeight > node.scrollTop + node.clientHeight) node.scrollTop = top + rowHeight - node.clientHeight;
      const left = 46 + cell.c * 148;
      if (left < node.scrollLeft + 46) node.scrollLeft = left - 46;
      else if (left + 148 > node.scrollLeft + node.clientWidth) node.scrollLeft = left + 148 - node.clientWidth;
    }
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); event.stopPropagation(); session.select({ r: 0, c: 0 }); session.select({ r: data.rows.length, c: data.columns.length - 1 }, true); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const moves = new Map([['ArrowUp', { r: -1, c: 0 }], ['ArrowDown', { r: 1, c: 0 }], ['ArrowLeft', { r: 0, c: -1 }], ['ArrowRight', { r: 0, c: 1 }]]);
    const move = moves.get(event.key);
    if (move) { event.preventDefault(); event.stopPropagation(); select({ r: selected.r + move.r, c: selected.c + move.c }, event.shiftKey); }
    else if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); clear(); }
    else if (event.key === 'Tab') { if (event.shiftKey ? selected.c === 0 : selected.c === data.columns.length - 1) return; event.preventDefault(); event.stopPropagation(); select({ ...selected, c: selected.c + (event.shiftKey ? -1 : 1) }); }
    else if (event.key === 'Enter' || event.key === 'F2' || event.key.length === 1) { event.preventDefault(); event.stopPropagation(); session.begin(event.key.length === 1 ? event.key : undefined); }
  };
  const rowHeight = matchMedia('(pointer: coarse)').matches ? 44 : 32;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 8), end = Math.min(data.rows.length + 1, start + Math.ceil(viewHeight / rowHeight) + 18);
  const rows = [data.columns.map(c => `${c.label}${c.unit ? ` (${c.unit})` : ''}`), ...data.rows.map(row => row.cells)];
  return <section className="sheet-editor data-editor" aria-label={card.text || 'Sheet'}>
    <div className="data-editor-heading"><span>{card.text || 'Untitled sheet'}</span><span data-saved role="status">{saveText}</span>{saving.kind === 'blocked' ? <button onClick={workspace.retry}>Retry</button> : null}</div>
    <div className="office-ribbon" role="toolbar" aria-label="Sheet tools">
      <div className="ribbon-group"><label className="ribbon-label" htmlFor={`sheet-kind-${cardId}`}>Column</label><select id={`sheet-kind-${cardId}`} aria-label="Column type" value={column?.kind ?? 'text'} onChange={event => { const kind = COLUMN_KINDS.find(kind => kind === event.currentTarget.value); if (kind) mutate(next => { const col = next.columns[selected.c]; if (col) col.kind = kind; }); }}>{COLUMN_KINDS.map(kind => <option key={kind} value={kind}>{labels[kind]}</option>)}</select>{column?.unit ? <span>{column.unit}</span> : null}</div>
      <div className="ribbon-group">{[1, -1].map(direction => <button key={direction} type="button" className="ribbon-btn" aria-label={`Sort ${direction === 1 ? 'ascending' : 'descending'}`} onClick={() => mutate(next => { const key = (text: string) => { if (!text.trim()) return null; const n = Number(text.replace(/[,$%\s]/g, '')); return Number.isFinite(n) ? n : text.toLowerCase(); }; next.rows.sort((a, b) => { const x = key(a.cells[selected.c] ?? ''), y = key(b.cells[selected.c] ?? ''); if (x === y) return 0; if (x === null) return 1; if (y === null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * direction; }); })}><ToolIcon path={direction === 1 ? 'M4 3v10M2 11l2 2 2-2M9 4h5M9 8h4M9 12h3' : 'M4 3v10M2 5l2-2 2 2M9 4h3M9 8h4M9 12h5'} /></button>)}</div>
      <div className="ribbon-group"><button aria-label="Add row" title="Add row" disabled={data.rows.length >= 200} onClick={() => mutate(next => next.rows.splice(Math.max(selected.r, range.r1), 0, { cells: next.columns.map(() => '') }))}><ToolIcon path="M2.5 2.5h11v5h-11zM8 10v4M6 12h4" /></button><button aria-label="Add column" title="Add column" disabled={data.columns.length >= 10} onClick={() => mutate(next => { const at = range.c1 + 1; next.columns.splice(at, 0, { label: `Column ${letter(next.columns.length)}`, kind: 'text' }); next.rows.forEach(row => row.cells.splice(at, 0, '')); })}><ToolIcon path="M2.5 2.5h5v11h-5zM10 8h4M12 6v4" /></button><button aria-label="Remove row" title="Remove row" disabled={data.rows.length <= 1 || selected.r === 0} onClick={() => mutate(next => next.rows.splice(selected.r - 1, 1))}><ToolIcon path="M2.5 2.5h11v5h-11zM6 12h4" /></button><button aria-label="Remove column" title="Remove column" disabled={data.columns.length <= 1} onClick={() => mutate(next => { next.columns.splice(selected.c, 1); next.rows.forEach(row => row.cells.splice(selected.c, 1)); session.select({ ...selected, c: Math.min(selected.c, next.columns.length - 1) }); })}><ToolIcon path="M2.5 2.5h5v11h-5zM10 8h4" /></button></div>
      <button onClick={clear} aria-label="Clear selected cells"><ToolIcon path="M3 13h10M5 10l5.5-6.5 2.5 2.5L7.5 12H5z" /></button>
    </div>
    {state.error ? <p role="alert">{state.error}</p> : null}
    <div className="sheet-bar"><output className="sheet-ref" aria-label="Cell reference">{letter(selected.c)}{selected.r + 1}</output><span className="sheet-fx">Value</span><input className="sheet-value" aria-label="Selected cell value" maxLength={selected.r ? 200 : 24} value={state.edit.kind === 'editing' ? state.edit.text : rawCell(data, selected)} onChange={event => { session.begin(undefined, 'bar'); session.change(event.currentTarget.value); }} onBlur={() => session.flush()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter' && session.flush()) grid.current?.focus(); if (event.key === 'Escape') { session.cancel(); grid.current?.focus(); } }} /></div>
    <div ref={grid} className="sheet-scroll" tabIndex={0} role="grid" aria-label="Sheet cells. Arrow keys move, Shift extends, Return edits." aria-multiselectable="true" aria-rowcount={data.rows.length + 2} aria-colcount={data.columns.length + 1} aria-activedescendant={`sheet-${cardId}-${selected.r}-${selected.c}`} onKeyDown={key}
      onScroll={event => { setScrollTop(event.currentTarget.scrollTop); session.update({ scroll: { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft } }); }}
      onPointerMove={event => { if (!dragging.current) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('td'); if (target instanceof HTMLTableCellElement && event.currentTarget.contains(target)) select({ r: Number(target.dataset.r), c: Number(target.dataset.c) }, true, false); }}>
      <table className="sheet-grid"><thead><tr><th />{data.columns.map((_, c) => <th scope="col" data-c={c} key={c} className={c >= range.c0 && c <= range.c1 ? 'hl' : ''} onPointerDown={event => { event.preventDefault(); select({ r: 0, c }, false, false); select({ r: data.rows.length, c }, true, false); grid.current?.focus(); }}>{letter(c)}</th>)}</tr></thead><tbody>
        {start > 0 ? <tr aria-hidden="true" className="sheet-spacer"><td colSpan={data.columns.length + 1} style={{ height: start * rowHeight }} /></tr> : null}
        {rows.slice(start, end).map((row, i) => { const r = start + i; return <tr key={r} className={r === 0 ? 'head' : ''}><th scope="row" data-r={r} className={r >= range.r0 && r <= range.r1 ? 'hl' : ''} onPointerDown={event => { event.preventDefault(); select({ r, c: 0 }, false, false); select({ r, c: data.columns.length - 1 }, true, false); grid.current?.focus(); }}>{r + 1}</th>{row.map((text, c) => {
          const inside = r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;
          const col = data.columns[c];
          const editing = state.edit.kind === 'editing' && state.edit.input === 'cell' && state.edit.cell.r === r && state.edit.cell.c === c;
          return <td key={c} id={`sheet-${cardId}-${r}-${c}`} data-r={r} data-c={c} role="gridcell" aria-selected={inside} className={[r > 0 && col && numeric(col) ? 'num' : '', selected.r === r && selected.c === c ? 'sel' : '', multi && inside ? `in-range${r === range.r0 ? ' edge-t' : ''}${r === range.r1 ? ' edge-b' : ''}${c === range.c0 ? ' edge-l' : ''}${c === range.c1 ? ' edge-r' : ''}` : ''].join(' ')} onPointerDown={event => { if (event.button !== 0 || event.target instanceof HTMLInputElement) return; event.preventDefault(); select({ r, c }, event.shiftKey, false); dragging.current = true; grid.current?.focus({ preventScroll: true }); }} onDoubleClick={() => session.begin()}>{editing && state.edit.kind === 'editing' ? <input ref={input} aria-label="Cell value" maxLength={r ? 200 : 24} value={state.edit.text} onChange={event => session.change(event.currentTarget.value)} onBlur={() => session.flush()} onKeyDown={event => { if (!['Escape', 'Enter', 'Tab'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); if (event.key === 'Escape') session.cancel(); else if (!session.flush()) return; if (event.key !== 'Escape') session.select({ r: r + (event.key === 'Enter' ? event.shiftKey ? -1 : 1 : 0), c: c + (event.key === 'Tab' ? event.shiftKey ? -1 : 1 : 0) }); grid.current?.focus(); }} /> : text}</td>;
        })}</tr>; })}
        {end < rows.length ? <tr aria-hidden="true" className="sheet-spacer"><td colSpan={data.columns.length + 1} style={{ height: (rows.length - end) * rowHeight }} /></tr> : null}
      </tbody></table>
    </div><footer className="sheet-status" role="status"><span data-stats>{stats}</span><span className="sheet-hint">Return to edit · Shift arrows to select</span></footer>
  </section>;
}
