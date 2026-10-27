import { useState } from 'react';
import type { ObjectData } from './model.js';
import { useObjectEditing } from './context.js';
import { Actions } from './Actions.js';
import { Text } from './Text.js';
import { Trend } from './Trend.js';
import { Value } from './Value.js';
export function Stats({ data }: { readonly data: ObjectData['stats'] }) {
  const { set } = useObjectEditing();
  return <><dl className="stats">{data.tiles.map((tile, i) => <div className="stat" key={i}><dt><Text value={tile.label} label={`Stat ${i + 1} label`} path={['tiles', i, 'label']} maxLength={60} /></dt><dd><span className="value">{tile.editable ? <Value value={tile.value} label={tile.label} onChange={value => set(['tiles', i, 'value'], value)} /> : <Text value={tile.value} label={`Stat ${i + 1} value`} path={['tiles', i, 'value']} maxLength={40} />}</span>{tile.delta ? <span className="meta"><Text value={tile.delta} label={`Stat ${i + 1} change`} path={['tiles', i, 'delta']} maxLength={100} /></span> : null}{tile.sparkline ? <Trend values={tile.sparkline} label={`${tile.label} trend`} /> : null}</dd></div>)}</dl>{data.note ? <p className="footnote"><Text value={data.note} label="Stats note" path={['note']} multiline maxLength={200} /></p> : null}</>;
}
export function Progress({ data }: { readonly data: ObjectData['progress'] }) {
  const { set } = useObjectEditing();
  return <ul className="goals">{data.goals.map((goal, i) => <li key={i}><div className="heading"><strong><Text value={goal.label} label={`Goal ${i + 1} label`} path={['goals', i, 'label']} maxLength={80} /></strong><span className="amount">{goal.editable ? <Value value={goal.current} display={goal.current.toLocaleString('en-AU')} label={`Current: ${goal.label}`} numeric onChange={value => set(['goals', i, 'current'], value)} /> : goal.current.toLocaleString('en-AU')}<span className="meta"> / {goal.target.toLocaleString('en-AU')} {goal.unit ?? ''}</span></span></div><span className="track" role="meter" aria-label={goal.label} aria-valuemin={0} aria-valuemax={Math.max(goal.target, goal.current)} aria-valuenow={goal.current} aria-valuetext={`${goal.current} of ${goal.target} ${goal.unit ?? ''}`}><span style={{ width: `${Math.min(100, goal.current / goal.target * 100)}%` }} /></span></li>)}</ul>;
}
export function Callout({ data }: { readonly data: ObjectData['callout'] }) {
  const names = { quote: 'Quote', note: 'Note', warning: 'Warning', tip: 'Tip' };
  const text = <Text value={data.text} label="Callout text" path={['text']} multiline />;
  return <aside className="callout" aria-label={names[data.tone]}>{data.tone === 'quote' ? <blockquote>{text}</blockquote> : <><strong>{names[data.tone]}</strong><p>{text}</p></>}{data.attribution ? <p className="attribution"><Text value={data.attribution} label="Attribution" path={['attribution']} maxLength={120} /></p> : null}</aside>;
}
export function Compare({ data }: { readonly data: ObjectData['compare'] }) {
  return <><div className="comparison"><table aria-label="Option comparison"><thead><tr><th scope="col">Criteria</th>{data.options.map((option, i) => <th scope="col" key={i}><strong><Text value={option.name} label={`Option ${i + 1} name`} path={['options', i, 'name']} maxLength={60} /></strong>{option.detail ? <p><Text value={option.detail} label={`Option ${i + 1} detail`} path={['options', i, 'detail']} multiline maxLength={160} /></p> : null}</th>)}</tr></thead><tbody>{data.criteria.map((criterion, r) => <tr key={r}><th scope="row"><Text value={criterion.label} label={`Criterion ${r + 1}`} path={['criteria', r, 'label']} maxLength={80} /></th>{criterion.values.map((value, c) => <td key={c}><Text value={value} label={`Criterion ${r + 1}, option ${c + 1}`} path={['criteria', r, 'values', c]} multiline maxLength={200} /></td>)}</tr>)}</tbody></table></div><p className="verdict"><strong>Verdict</strong><Text value={data.verdict} label="Verdict" path={['verdict']} multiline maxLength={500} /></p></>;
}
export function Timeline({ data }: { readonly data: ObjectData['timeline'] }) {
  const { set } = useObjectEditing();
  return <ol className={`timeline${data.direction === 'horizontal' ? ' horizontal' : ''}`}>{data.events.map((event, i) => <li className={event.done ? 'done' : undefined} key={i}><div className="date"><time dateTime={event.date}><Text value={event.date} label={`Event ${i + 1} date`} path={['events', i, 'date']} maxLength={10} /></time></div><div className="station">{data.checkable ? <label className="tick"><input type="checkbox" checked={!!event.done} aria-label={`Done: ${event.title}`} onChange={e => set(['events', i, 'done'], e.currentTarget.checked)} /></label> : <i />}</div><div className="event"><strong><Text value={event.title} label={`Event ${i + 1} title`} path={['events', i, 'title']} maxLength={100} /></strong>{event.detail ? <p><Text value={event.detail} label={`Event ${i + 1} detail`} path={['events', i, 'detail']} multiline maxLength={400} /></p> : null}</div></li>)}</ol>;
}
export function Stages({ data }: { readonly data: ObjectData['stages'] }) {
  const { set } = useObjectEditing();
  const names = { pending: 'Pending', active: 'In progress', done: 'Done', blocked: 'Blocked' };
  const statuses = ['pending', 'active', 'done', 'blocked'] as const;
  return <ol className="stages">{data.steps.map((step, i) => <li className={step.status} key={i}><div className="rail"><span className="dot">{i + 1}</span></div><strong><Text value={step.title} label={`Stage ${i + 1} title`} path={['steps', i, 'title']} maxLength={80} /></strong><span className="status">{names[step.status]}</span>{step.detail ? <p><Text value={step.detail} label={`Stage ${i + 1} detail`} path={['steps', i, 'detail']} multiline maxLength={240} /></p> : null}{data.editable ? <Actions label={`Set status for ${step.title}`} heading={step.title} items={statuses.map(status => ({ title: names[status], ariaLabel: `${step.title}: ${names[status]}`, checked: status === step.status, run: () => { set(['steps', i, 'status'], status); } }))} /> : null}</li>)}</ol>;
}
export function Kanban({ data }: { readonly data: ObjectData['kanban'] }) {
  const editing = useObjectEditing(), [dragging, setDragging] = useState<string | null>(null);
  function move(id: string, column: string) {
    const i = data.cards.findIndex(card => card.id === id);
    if (i >= 0 && data.cards[i]?.column !== column) editing.set(['cards', i, 'column'], column);
    setDragging(null);
  }
  return <div className="kanban">{data.columns.map((column, c) => <section className="lane" aria-label={column.title} key={column.id} onDragOver={event => { if (dragging) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragging && event.dataTransfer.getData('text/aegis-kanban') === dragging) move(dragging, column.id); }}><h4><Text value={column.title} label={`Lane ${c + 1} title`} path={['columns', c, 'title']} maxLength={60} /><span>{data.cards.filter(card => card.column === column.id).length}</span></h4>{data.cards.filter(card => card.column === column.id).map(item => <article className={`ticket${dragging === item.id ? ' dragging' : ''}`} key={item.id}>{editing.enabled ? <p><Text value={item.title} label={`Card title: ${item.title}`} path={['cards', data.cards.indexOf(item), 'title']} maxLength={100} /></p> : <button className="handle" type="button" draggable aria-label={`Drag ${item.title}`} onDragStart={event => { setDragging(item.id); event.dataTransfer.setData('text/aegis-kanban', item.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragging(null)}>{item.title}</button>}{item.detail ? <p><Text value={item.detail} label={`Card detail: ${item.title}`} path={['cards', data.cards.indexOf(item), 'detail']} multiline maxLength={280} /></p> : null}<Actions label={`Move ${item.title}`} heading={item.title} items={data.columns.map(target => ({ title: target.title, ariaLabel: `Move ${item.title} to ${target.title}`, checked: target.id === item.column, run: () => move(item.id, target.id) }))} /></article>)}{data.cards.every(card => card.column !== column.id) ? <p className="empty">No cards</p> : null}</section>)}</div>;
}
