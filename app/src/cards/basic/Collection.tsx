import { useCard } from '../../workspace/index.js';
import type { CardBodyProps } from '../../composition.js';
import { Editable } from './Editable.js';
import './basic.css';
export function CollectionBody(props: CardBodyProps) {
  const card = useCard(props.workspace, props.cardId);
  if (!card) return null;
  return <div className="basic-collection">{card.props?.head !== false ? <Editable {...props} className="collection-head" label="Collection title" value={card.text || 'Collection'} multiline={false} onChange={text => { props.workspace.submit([{ op: 'update', id: props.cardId, set: { text } }]); }} /> : null}</div>;
}
