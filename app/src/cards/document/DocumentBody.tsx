import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { CardBodyProps } from "../../composition.js";
import { documentUpdate } from "@aegis/domain/content";
import {
  documentContent,
  documentHTML,
  hasDocumentContent,
} from "../../editors/document/content.js";
import { useDocumentServices } from "../../editors/document/services.js";
import "../../editors/document/document.css";

export function DocumentBody({ cardId, workspace }: CardBodyProps) {
  const services = useDocumentServices(),
    source = workspace.card(cardId);
  const card = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const host = useRef<HTMLDivElement>(null),
    scroll = useRef(0);
  const html = useMemo(
    () =>
      card && hasDocumentContent(documentContent(card))
        ? documentHTML(card, services.assetUrl)
        : '<p class="doc-empty">Empty document. Open it to start writing.</p>',
    [card, services.assetUrl],
  );
  useEffect(() => {
    if (card && card.type === "doc" && !card.props?.docTitleMigrated)
      workspace.submit([documentUpdate(cardId, documentContent(card))]);
  }, [card, cardId, workspace]);
  useEffect(() => {
    const shell = host.current?.closest(".card");
    if (!shell || !card) return;
    shell.setAttribute(
      "aria-label",
      `${card.text || "Untitled document"}, document. Double-click or press Return to open.`,
    );
  }, [card]);
  if (!card || card.type !== "doc") return null;
  const name = card.text || "Untitled document";
  const open = () => {
    if (services.context) services.context.openEditor(cardId);
    else workspace.act({ kind: "edit", id: cardId, view: "side" });
  };
  return (
    <div
      ref={host}
      data-document-id={cardId}
      className={`document-card${card.props?.body?.trim() ? " docs-has-content" : ""}`}
      onDoubleClick={open}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === "Enter") {
          event.preventDefault();
          open();
        }
      }}
    >
      <header className="win-strip doc-strip">
        <span className="win-name">{name}</span>
        <span className="win-kind"> · Document</span>
        <button
          className="win-open"
          type="button"
          aria-label={`Open ${name}`}
          onClick={open}
        >
          Open
        </button>
      </header>
      <div
        className="doc-view"
        data-scene-interactive
        onScroll={(event) => {
          scroll.current = event.currentTarget.scrollTop;
        }}
        ref={(element) => {
          if (element) element.scrollTop = scroll.current;
        }}
      >
        <article
          className="doc-page"
          dangerouslySetInnerHTML={{
            __html:
              html ||
              '<p class="doc-empty">Empty document. Open it to start writing.</p>',
          }}
        />
      </div>
    </div>
  );
}
