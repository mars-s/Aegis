import { useEffect, useRef } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import './basic.css';

export function TemplateGroupBody({ workspace, cardId, engine }: CardBodyProps) {
  const card = useCard(workspace, cardId), field = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (field.current && document.activeElement !== field.current) field.current.textContent = card?.text ?? '';
  }, [card?.text]);
  useEffect(() => () => { engine.pin(cardId, 'focus', false); engine.pin(cardId, 'ime', false); }, [cardId, engine]);
  if (!card) return null;
  return <div ref={field} className="template-group-title" contentEditable="plaintext-only" suppressContentEditableWarning role="textbox" aria-label="Group name" aria-multiline={false}
    onFocus={() => engine.pin(cardId, 'focus', true)}
    onCompositionStart={() => engine.pin(cardId, 'ime', true)}
    onCompositionEnd={() => engine.pin(cardId, 'ime', false)}
    onBlur={event => {
      const text = event.currentTarget.textContent?.trim() ?? '';
      if (text !== card.text) workspace.submit([{ op: 'update', id: cardId, set: { text } }]);
      engine.pin(cardId, 'focus', false);
    }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing || !['Enter', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Escape') event.currentTarget.textContent = card.text;
      event.currentTarget.blur();
    }} />;
}
