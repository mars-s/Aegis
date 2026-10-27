import { useCard } from '../../workspace/index.js';
import type { CardBodyProps } from '../../composition.js';
import { Editable } from './Editable.js';
import { stringProp, textStyle } from './presentation.js';
import './basic.css';
export function NoteBody(props: CardBodyProps) {
  const { cardId, workspace } = props, card = useCard(workspace, cardId);
  if (!card) return null;
  function update(field: string, text: string) { workspace.submit([{ op: 'update', id: cardId, set: { [field]: text, props: { contentFit: true } } }]); }
  const tag = card.type !== 'image' ? stringProp(card, 'tag') : '';
  return <div className={`basic-note${card.props?.fixedHeight ? ' fixed-height' : ''}`} style={textStyle(card)}>
    {tag ? <Editable {...props} className="card-tag" label="Tag" value={tag} multiline={false} onChange={text => { workspace.submit([{ op: 'update', id: cardId, set: { props: { tag: text || null } } }]); }} /> : null}
    {card.badge ? <Editable {...props} className="badge" label="Badge" value={card.badge} multiline={false} onChange={text => update('badge', text)} /> : null}
    {card.heading ? <Editable {...props} className="heading card-heading" label="Heading" value={card.heading} multiline={false} onChange={text => update('heading', text)} /> : null}
    <Editable {...props} className="body" label={card.type === 'title' ? 'Title' : 'Note'} value={card.text} onChange={text => update('text', text)} />
  </div>;
}
