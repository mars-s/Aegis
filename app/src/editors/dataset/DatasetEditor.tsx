import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import type { DataServices } from '../../features/data/services.js';
import { WorkerOutputSchema } from './protocol.js';
import type { Profile, WorkerInput, WorkerOutput } from './protocol.js';
import './dataset.css';
type Rows = Extract<WorkerOutput, { type: 'rows' }>;
type Loaded = { readonly columns: readonly string[]; readonly profile: Profile; readonly total: number };
type Status = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly data: Loaded } | { readonly kind: 'error'; readonly message: string };
const fmt = (value: number | string | undefined) => typeof value === 'number' ? value.toLocaleString('en-AU', { maximumFractionDigits: 2 }) : value ?? '';
const kindName = (kind: string) => kind === 'number' ? 'Number' : kind === 'date' ? 'Date' : 'Text';
const locations = new WeakMap<CardBodyProps['workspace'], Map<string, { top: number; left: number; column: number; query: string }>>();
export function DatasetEditor({ cardId, workspace, services }: CardBodyProps & { readonly services: Pick<DataServices, 'assetUrl'> }) {
  const card = useCard(workspace, cardId);
  const viewport = useRef<HTMLDivElement>(null), worker = useRef<Worker | null>(null), epoch = useRef(0), request = useRef(0);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [rows, setRows] = useState<Rows | null>(null);
  const [top, setTop] = useState(0), [left, setLeft] = useState(0), [height, setHeight] = useState(600), [width, setWidth] = useState(720);
  const [query, setQuery] = useState(''), [column, setColumn] = useState(0);
  const [sort, setSort] = useState<{ column: number; direction: 1 | -1 } | null>(null), [sorting, setSorting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const src = typeof card?.props?.src === 'string' ? card.props.src : '';
  const send = useCallback((message: WorkerInput) => worker.current?.postMessage(message), []);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const memory = locations.get(workspace)?.get(cardId);
    if (memory) { node.scrollTop = memory.top; node.scrollLeft = memory.left; setTop(memory.top); setLeft(memory.left); setColumn(memory.column); setQuery(memory.query); }
    const observer = new ResizeObserver(entries => { const box = entries[0]?.contentRect; if (box) { setHeight(box.height); setWidth(box.width); } }); observer.observe(node);
    return () => observer.disconnect();
  }, [workspace, cardId]);
  useEffect(() => { let entries = locations.get(workspace); if (!entries) { entries = new Map(); locations.set(workspace, entries); } entries.set(cardId, { top, left, column, query }); }, [workspace, cardId, top, left, column, query]);
  useEffect(() => {
    const current = ++epoch.current;
    setStatus({ kind: 'loading' }); setRows(null); setSort(null); setSorting(false);
    if (!src.startsWith('asset:')) { setStatus({ kind: 'error', message: 'Import the source CSV again.' }); return; }
    const source = new Worker(new URL('./viewer-worker.ts', import.meta.url), { type: 'module' }); worker.current = source;
    source.onerror = () => setStatus({ kind: 'error', message: 'The dataset worker stopped. Try again.' });
    source.onmessage = (event: MessageEvent<unknown>) => {
      const parsed = WorkerOutputSchema.safeParse(event.data);
      if (!parsed.success) { setStatus({ kind: 'error', message: 'The dataset worker returned invalid data.' }); return; }
      const message = parsed.data;
      if (message.epoch !== current || current !== epoch.current) return;
      switch (message.type) {
        case 'ready': setStatus({ kind: 'ready', data: message }); return;
        case 'rows': if (message.request === request.current) setRows(message); return;
        case 'sorted': setSort({ column: message.column, direction: message.direction }); setSorting(false); setRows(null); if (viewport.current) viewport.current.scrollTop = 0; setTop(0); return;
        case 'error': setStatus({ kind: 'error', message: message.message }); return;
        default: { const exhaustive: never = message; return exhaustive; }
      }
    };
    send({ type: 'load', epoch: current, url: services.assetUrl(src) });
    return () => { ++epoch.current; source.terminate(); if (worker.current === source) worker.current = null; };
  }, [src, services, attempt, send]);
  const start = Math.max(0, Math.floor((top - 48) / 32) - 6);
  const total = status.kind === 'ready' ? status.data.total : 0;
  const end = Math.min(total, start + Math.ceil(height / 32) + 14);
  useEffect(() => { if (status.kind === 'ready' && !sorting) send({ type: 'rows', epoch: epoch.current, start, end, request: ++request.current }); }, [status, start, end, sort, sorting, send]);
  const data = status.kind === 'ready' ? status.data : null;
  const offsets = useMemo(() => { let next = 76; return data?.columns.map((name, index) => { const size = data.profile.columns[index]?.kind === 'number' ? 156 : 204; const item = { name, index, left: next, width: size }; next += size; return item; }) ?? []; }, [data]);
  const visible = offsets.filter(item => item.left + item.width >= left + 76 - 204 && item.left <= left + width + 204);
  const before = visible[0]?.left ?? 76, last = visible.at(-1), allLast = offsets.at(-1);
  const tableWidth = allLast ? allLast.left + allLast.width : 76, after = tableWidth - (last ? last.left + last.width : 76);
  const matches = offsets.filter(item => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const profile = data?.profile.columns[column];
  const reveal = (index: number) => { setColumn(index); if (viewport.current) viewport.current.scrollLeft = (offsets[index]?.left ?? 76) - 76; };
  if (card?.type !== 'dataset') return null;
  return <section className="data-viewer data-editor" aria-label={card.text || 'Dataset'} onKeyDown={event => { if (['Delete', 'Backspace'].includes(event.key) && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); event.stopPropagation(); } }}>
    <div className="data-viewer-tools"><span data-size>{data ? `${fmt(data.total)} rows · ${data.columns.length} columns` : 'Loading source data…'}</span><label className="data-finder-label">Find column<input type="search" aria-label="Find column" placeholder="Column name" value={query} disabled={!data} onChange={event => { const next = event.currentTarget.value; setQuery(next); const first = offsets.find(item => item.name.toLowerCase().includes(next.trim().toLowerCase())); if (first) reveal(first.index); }} onKeyDown={event => { if (event.key === 'Enter') viewport.current?.querySelector<HTMLButtonElement>(`[data-column="${column}"] button`)?.focus(); }} /></label><select aria-label="Go to column" value={matches.some(item => item.index === column) ? column : ''} disabled={!matches.length} onChange={event => reveal(Number(event.currentTarget.value))}>{!matches.length ? <option value="">No matching columns</option> : matches.map(item => <option key={item.index} value={item.index}>{item.name}</option>)}</select></div>
    <details className="data-profile"><summary>Column profile</summary><div data-profile-content>{profile ? <><p className="data-profile-title">{profile.name}<span className={`data-kind kind-${profile.kind}`}>{kindName(profile.kind)}</span></p><dl>{[['Range', profile.min === undefined ? null : `${fmt(profile.min)} to ${fmt(profile.max)}`], ['Mean', profile.mean], ['Median', profile.median], ['Gaps', `${fmt(profile.empty)} of ${fmt(total)}`], ['Distinct values', profile.distinct]].map(([name, value]) => value === undefined || value === null ? null : <div className="profile-stat" key={name}><dt>{name}</dt><dd>{fmt(value)}</dd></div>)}</dl>{profile.top?.length ? <><p>Top values</p><ul>{profile.top.map(item => <li key={item.value}>{item.value}<span>{fmt(item.count)}</span></li>)}</ul></> : null}</> : null}</div></details>
    <div ref={viewport} className="data-viewport" role="region" tabIndex={0} aria-label="Dataset rows" aria-busy={status.kind === 'loading' || sorting} onScroll={event => { setTop(event.currentTarget.scrollTop); setLeft(event.currentTarget.scrollLeft); }}>
      {status.kind === 'loading' ? <p className="data-message" role="status">Loading source data…</p> : status.kind === 'error' ? <><p className="data-message" role="alert">Could not load the dataset. {status.message}</p><button className="data-retry" onClick={() => setAttempt(attempt + 1)}>Try again</button></> : <table className="data-viewer-grid" aria-label={card.text || 'Dataset'} aria-rowcount={total + 1} aria-colcount={(data?.columns.length ?? 0) + 1} style={{ width: tableWidth }}>
        <colgroup><col style={{ width: 76 }} />{before > 76 ? <col style={{ width: before - 76 }} /> : null}{visible.map(item => <col key={item.index} style={{ width: item.width }} />)}{after > 0 ? <col style={{ width: after }} /> : null}</colgroup>
        <thead><tr><th scope="col">Row</th>{before > 76 ? <th aria-hidden="true" /> : null}{visible.map(item => { const kind = data?.profile.columns[item.index]?.kind ?? 'text'; return <th key={item.index} scope="col" data-column={item.index} className={column === item.index ? 'is-found' : ''} aria-colindex={item.index + 2} aria-sort={sort?.column === item.index ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button type="button" aria-label={`Sort by ${item.name}`} onClick={() => { const direction = sort?.column === item.index && sort.direction === 1 ? -1 : 1; setSorting(true); setColumn(item.index); send({ type: 'sort', epoch: epoch.current, column: item.index, direction }); }}><span className="data-column-name">{item.name}</span><span className={`data-kind kind-${kind}`}>{kindName(kind)}</span><span className="data-sort" aria-hidden="true">↓</span></button></th>; })}{after > 0 ? <th aria-hidden="true" /> : null}</tr></thead>
        <tbody><tr aria-hidden="true" className="data-spacer"><td colSpan={visible.length + 1 + (before > 76 ? 1 : 0) + (after > 0 ? 1 : 0)} style={{ height: (rows?.start ?? start) * 32 }} /></tr>{rows?.rows.map((row, index) => <tr key={row.number} aria-rowindex={rows.start + index + 2}><th scope="row">{row.number}</th>{before > 76 ? <td aria-hidden="true" /> : null}{visible.map(item => <td key={item.index} aria-colindex={item.index + 2} title={row.cells[item.index]} className={data?.profile.columns[item.index]?.kind === 'number' ? 'num' : ''}>{row.cells[item.index]}</td>)}{after > 0 ? <td aria-hidden="true" /> : null}</tr>)}<tr aria-hidden="true" className="data-spacer"><td colSpan={visible.length + 1 + (before > 76 ? 1 : 0) + (after > 0 ? 1 : 0)} style={{ height: Math.max(0, total - (rows?.start ?? start) - (rows?.rows.length ?? 0)) * 32 }} /></tr></tbody>
      </table>}
    </div><footer className="data-viewer-status" role="status">{status.kind === 'error' ? 'Source data unavailable' : !data ? 'Loading every row from the source file' : !matches.length ? 'No matching columns' : sorting ? 'Sorting…' : total ? `Rows ${fmt(Math.min(total, Math.floor(top / 32) + 1))}–${fmt(Math.min(total, Math.ceil((top + height - 48) / 32)))} of ${fmt(total)}${sort ? ` · ${data.columns[sort.column]}, ${sort.direction === 1 ? 'ascending' : 'descending'}` : ''}` : 'No data rows'}</footer>
  </section>;
}
