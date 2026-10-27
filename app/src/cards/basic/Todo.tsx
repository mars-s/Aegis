import { useRef } from 'react';
import { useCard } from '../../workspace/index.js';
import type { CardBodyProps } from '../../composition.js';
import { Editable } from './Editable.js';
import { textStyle } from './presentation.js';
import './basic.css';
export function TodoBody(props: CardBodyProps) {
  const { workspace, cardId } = props, card = useCard(workspace, cardId), root = useRef<HTMLDivElement>(null);
  if (!card || card.type !== 'todo') return null;
  const items = card.items ?? [];
  function save(next: typeof items) { workspace.submit([{ op: 'update', id: cardId, set: { items: next.map(item => ({ text: item.text, done: item.done, ...(item.t === undefined ? {} : { t: item.t }) })), props: { contentFit: true } } }]); }
  return <div ref={root} className={`basic-todo${card.props?.fixedHeight ? ' fixed-height' : ''}`} style={textStyle(card)}>
    {card.heading ? <Editable {...props} className="heading" label="Heading" value={card.heading} multiline={false} onChange={text => { workspace.submit([{ op: 'update', id: cardId, set: { heading: text } }]); }} /> : null}
    <Editable {...props} className="label body" label="Checklist title" value={card.text} onChange={text => { workspace.submit([{ op: 'update', id: cardId, set: { text, props: { contentFit: true } } }]); }} />
    <div className="items">{items.map((item, i) => <div className={`todo-item${item.done ? ' done' : ''}`} key={i}><input type="checkbox" checked={item.done} aria-label={item.text || 'Checklist item'} onChange={event => save(items.map((entry, n) => n === i ? { ...entry, done: event.currentTarget.checked } : entry))} /><Editable {...props} className="todo-text" label={`Task ${i + 1}`} value={item.text} onChange={text => save(items.map((entry, n) => n === i ? { ...entry, text } : entry))} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === 'Backspace' && !event.currentTarget.innerText) {
        event.preventDefault(); const text = event.currentTarget.innerText.trim(), add = event.key === 'Enter' && !!text;
        const latest = workspace.card(cardId).getSnapshot()?.items ?? [];
        const next = latest.map(entry => ({ ...entry }));
        if (add) next.splice(i + 1, 0, { text: '', done: false }); else if (!text) next.splice(i, 1);
        save(next); queueMicrotask(() => root.current?.querySelectorAll<HTMLElement>('.todo-text')[add ? i + 1 : Math.max(0, i - 1)]?.focus({ preventScroll: true }));
      }
    }} /><button type="button" className="remove-item" aria-label="Remove item" onClick={() => save(items.filter((_, n) => n !== i))}>×</button></div>)}</div>
    <input className="add-item" placeholder="Add item" aria-label="Add checklist item" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') event.currentTarget.blur(); if (event.key === 'Enter' && event.currentTarget.value.trim()) { event.preventDefault(); save([...items, { text: event.currentTarget.value.trim(), done: false }]); event.currentTarget.value = ''; } }} />
  </div>;
}
