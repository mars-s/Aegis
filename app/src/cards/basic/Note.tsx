import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CardBodyProps } from "../../composition.js";

export function NoteBody({ cardId, workspace, engine }: CardBodyProps) {
  const source = workspace.card(cardId);
  const card = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const body = useRef<HTMLDivElement>(null);
  const lastText = useRef<string | null>(null);
  useEffect(() => {
    if (body.current && card && lastText.current !== card.text) {
      body.current.textContent = card.text;
      lastText.current = card.text;
    }
  }, [card]);
  if (!card) return null;
  return <>
    {card.heading ? <header className="card-heading">{card.heading}</header> : null}
    <div ref={body} className="body" role="textbox" aria-label={card.type === "title" ? "Title" : "Note"}
      contentEditable suppressContentEditableWarning spellCheck
      onFocus={() => engine.pin(cardId, "focus", true)}
      onBlur={() => engine.pin(cardId, "focus", false)}
      onCompositionStart={() => engine.pin(cardId, "ime", true)}
      onCompositionEnd={() => engine.pin(cardId, "ime", false)}
      onInput={event => {
        const text = event.currentTarget.innerText;
        if (text === lastText.current) return;
        lastText.current = text;
        workspace.submit([{ op: "update", id: cardId, set: { text, props: { contentFit: true } } }]);
      }} />
  </>;
}

