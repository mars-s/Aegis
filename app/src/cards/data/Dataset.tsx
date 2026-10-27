import { openCardEditor } from "../../platform/editor-actions.js";
import { z } from 'zod/v4';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import { ProfileSchema } from '../../editors/dataset/protocol.js';
import './cards.css';
export const DatasetPreviewSchema = z.object({ name: z.string().optional(), src: z.string().optional(), rows: z.number().nonnegative().default(0), columns: z.array(z.string()).default([]), preview: z.array(z.array(z.string())).default([]), profile: ProfileSchema.optional() });
const marks = new Map([['number', '#'], ['date', '◷'], ['text', 'Aa']]);
const format = (n: string | number | undefined) => typeof n === 'number' ? n.toLocaleString('en-AU', { maximumFractionDigits: 2 }) : n ?? '';
export function DatasetBody({ cardId, workspace }: CardBodyProps) {
  const card = useCard(workspace, cardId);
  if (card?.type !== 'dataset') return null;
  const parsed = DatasetPreviewSchema.safeParse(card.props ?? {});
  if (!parsed.success) return <p role="alert">Could not read this dataset preview. Import the source CSV again.</p>;
  const data = parsed.data;
  const preview = data.preview.slice(0, 40);
  return <section className="data-card dataset" aria-label={`${card.text}, dataset with ${data.rows} rows`}><header className="win-strip doc-strip"><span className="win-name">{card.text || data.name || 'Dataset'}</span><span className="win-kind">Data</span><span className="data-size">{data.rows.toLocaleString()} rows · {data.columns.length} columns</span><button className="win-open" onClick={() => openCardEditor(cardId)}>Open</button></header>
    <div className="data-cols" aria-label="Columns">{data.profile?.columns.map((column, i) => <span key={i} className={`data-col kind-${column.kind}`} title={column.kind === 'number' ? `${format(column.min)} to ${format(column.max)}, mean ${format(column.mean)}` : column.kind === 'date' ? `${column.min} to ${column.max}` : `${column.distinct} distinct${column.top?.[0] ? `, most often ${column.top[0].value}` : ''}`}><b>{marks.get(column.kind) ?? 'Aa'}</b><span>{column.name}</span>{column.empty ? <i>{column.empty === data.rows ? 'empty' : `${column.empty} blank`}</i> : null}</span>)}</div>
    <div className="data-scroll"><table className="data-grid"><thead><tr><th />{data.columns.map((name, i) => <th key={i} className={data.profile?.columns[i]?.kind === 'number' ? 'num' : ''}>{name}</th>)}</tr></thead><tbody>{preview.map((row, r) => <tr key={r}><th scope="row">{r + 1}</th>{row.map((value, i) => <td key={i} className={data.profile?.columns[i]?.kind === 'number' ? 'num' : ''}>{value}</td>)}</tr>)}{data.rows > preview.length ? <tr><td className="data-more" colSpan={data.columns.length + 1}>{(data.rows - preview.length).toLocaleString()} more rows. Open to explore every row.</td></tr> : null}</tbody></table></div>
  </section>;
}
