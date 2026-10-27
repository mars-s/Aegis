import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { CardBodyProps } from '../../composition.js';
export function Editable({ value, label, className, onChange, multiline = true, onKeyDown, ...props }: CardBodyProps & {
  readonly value: string; readonly label: string; readonly className: string; readonly multiline?: boolean;
  readonly onChange: (value: string) => void; readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const field = useRef<HTMLDivElement>(null), last = useRef(value);
  useEffect(() => {
    if (field.current && field.current.innerText !== value && value !== last.current) field.current.textContent = value;
    last.current = value;
  }, [value]);
  useEffect(() => { if (field.current) field.current.textContent = value; }, []);
  function save(node: HTMLDivElement) {
    const text = multiline ? node.innerText : node.innerText.trim();
    if (text !== last.current) { last.current = text; onChange(text); }
  }
  return <div ref={field} className={className} role="textbox" aria-label={label} aria-multiline={multiline} contentEditable="plaintext-only" suppressContentEditableWarning spellCheck
    onFocus={() => props.engine.pin(props.cardId, 'focus', true)} onBlur={event => { save(event.currentTarget); props.engine.pin(props.cardId, 'focus', false); }}
    onCompositionStart={() => props.engine.pin(props.cardId, 'ime', true)} onCompositionEnd={event => { save(event.currentTarget); props.engine.pin(props.cardId, 'ime', false); }}
    onInput={event => save(event.currentTarget)} onKeyDown={event => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' || !multiline && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      onKeyDown?.(event);
    }} />;
}
