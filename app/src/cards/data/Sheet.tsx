import { openCardEditor } from "../../platform/editor-actions.js";
// Sheet rendering and cell rules adapted from Zephium at 0eaad6d, MPL-2.0.
// Changes for Aegis: React and virtual rows inside the leased body.
import { useMemo, useState } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import { bests, cellOrder, figure, host, numeric, rating, yesNo } from './sheet-model.js';
import { useBox } from '../../charts/useBox.js';
import './cards.css';
export function SheetBody({ cardId, workspace }: CardBodyProps) {
  const card = useCard(workspace, cardId);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [scroll, setScroll] = useState(0);
  const box = useBox<HTMLDivElement>();
  const data = card?.kind === 'sheet' ? card.data : null;
  const best = useMemo(() => data ? bests(data) : [], [data]);
  const order = useMemo(() => {
    const rows = data?.rows.map((row, index) => ({ row, index })) ?? [];
    const column = sort ? data?.columns[sort.col] : null;
    if (!sort || !column) return rows;
    return rows.sort((a, b) => { const x = cellOrder(column, a.row.cells[sort.col] ?? ''), y = cellOrder(column, b.row.cells[sort.col] ?? ''); if (x === y) return 0; if (x === null) return 1; if (y === null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  }, [data, sort]);
  if (!data) return null;
  const start = Math.max(0, Math.floor(scroll / 29) - 6), end = Math.min(order.length, start + Math.ceil((box.height || 340) / 29) + 14);
  const open = () => openCardEditor(cardId);
  return <section className="data-card sheet-card"><header className="win-strip"><span className="win-name">{card?.text || 'Untitled sheet'}</span><span className="win-kind">Sheet</span><button className="win-open" onClick={open}>Open</button></header><div className="sheet-preview-scroll" ref={box.ref} onScroll={event => setScroll(event.currentTarget.scrollTop)}><div className="sheet"><table><thead><tr className="letters" aria-hidden="true"><th className="rn" />{data.columns.map((_, c) => <th className="letter" key={c}>{String.fromCharCode(65 + c)}</th>)}</tr><tr><th className="rn">1</th>{data.columns.map((column, c) => <th key={c} className={numeric(column) ? 'num' : ''} aria-sort={sort?.col === c ? sort.dir === 1 ? 'ascending' : 'descending' : 'none'}><button type="button" disabled={data.rows.length < 3 || column.kind === 'link'} onClick={() => setSort(sort?.col === c ? sort.dir === 1 ? { col: c, dir: -1 } : null : { col: c, dir: numeric(column) ? -1 : 1 })}>{column.unit && column.kind !== 'money' ? `${column.label} (${column.unit})` : column.label}{sort?.col === c ? sort.dir === 1 ? ' ↑' : ' ↓' : ''}</button></th>)}</tr></thead><tbody>
    {start > 0 ? <tr aria-hidden="true" className="preview-spacer"><td colSpan={data.columns.length + 1} style={{ height: start * 29 }} /></tr> : null}
    {order.slice(start, end).map(({ row, index }, i) => <tr key={index}><th className="rn" scope="row">{start + i + 2}</th>{data.columns.map((column, c) => { const text = row.cells[c] ?? '', score = column.kind === 'rating' ? rating(text) : null; return <td key={c} className={[numeric(column) ? 'num' : '', column.kind === 'rating' || column.kind === 'yes_no' ? 'centre' : '', best[c]?.has(index) ? 'best' : ''].join(' ')}>{!text.trim() ? <span className="empty">–</span> : column.kind === 'yes_no' ? <span className={`yn ${yesNo(text)}`}>{yesNo(text) === 'yes' ? '✓' : yesNo(text) === 'no' ? '✕' : yesNo(text) === 'partial' ? '◐' : '?'}</span> : score ? <span className="rating" title={text}>{score.value}<span className="of">/{score.max}</span></span> : column.kind === 'link' ? <a className="link" href={/^https?:\/\//i.test(text) ? text : undefined} target="_blank" rel="noreferrer">{host(text)}</a> : column.kind === 'tag' ? <span className="tag">{text}</span> : numeric(column) ? figure(column, text) : text}</td>; })}</tr>)}
    {end < order.length ? <tr aria-hidden="true" className="preview-spacer"><td colSpan={data.columns.length + 1} style={{ height: (order.length - end) * 29 }} /></tr> : null}
  </tbody></table>{data.note ? <p className="note">{data.note}</p> : null}</div></div></section>;
}
