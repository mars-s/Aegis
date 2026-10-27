import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JsonValue } from "@aegis/domain";
import type { CardBodyProps } from "../../composition.js";
import { useCard, useSaveState } from "../../workspace/index.js";
import { useExportView } from "../../features/editing/export-view.js";
import {
  retainObjectDraft,
  flushObjectDrafts,
} from "../../editors/object/session.js";
import { pinObjectDraft } from "./dirty-pins.js";
import { ObjectEditingContext } from "./context.js";
import { generatedKinds, objectNames } from "./model.js";
import type { ObjectContent } from "./model.js";
import type { ObjectServices } from "./services.js";
import { Reply } from "./Reply.js";
import { Code, List, Plan } from "./BasicObjects.js";
import {
  Callout,
  Compare,
  Kanban,
  Progress,
  Stages,
  Stats,
  Timeline,
} from "./Generated.js";
import { Table } from "./Table.js";
import { Form } from "./Form.js";
import { Gallery } from "./Gallery.js";
import { Diagram } from "./Diagram.js";
import { Html } from "./Html.js";
import "./objects.css";
import "./kinds.css";

function Contents({
  card,
  services,
  expanded,
  ...props
}: CardBodyProps & {
  readonly card: ObjectContent;
  readonly services: ObjectServices;
  readonly expanded: boolean;
}) {
  switch (card.kind) {
    case "reply":
      return <Reply data={card.data} />;
    case "plan":
      return <Plan data={card.data} />;
    case "list":
      return <List data={card.data} />;
    case "code":
      return <Code data={card.data} />;
    case "stats":
      return <Stats data={card.data} />;
    case "progress":
      return <Progress data={card.data} />;
    case "callout":
      return <Callout data={card.data} />;
    case "compare":
      return <Compare data={card.data} />;
    case "timeline":
      return <Timeline data={card.data} />;
    case "stages":
      return <Stages data={card.data} />;
    case "kanban":
      return <Kanban data={card.data} />;
    case "table":
      return <Table data={card.data} />;
    case "form":
      return <Form data={card.data} />;
    case "gallery":
      return (
        <Gallery
          data={card.data}
          assetUrl={services.assetUrl}
          expanded={expanded}
        />
      );
    case "diagram":
      return <Diagram data={card.data} />;
    case "html":
      return (
        <Html
          {...props}
          data={card.data}
          title={card.text || "Custom UI"}
          services={services}
          expanded={expanded}
        />
      );
    case "plot":
    case "sheet":
      return null;
    default: {
      const exhaustive: never = card;
      return exhaustive;
    }
  }
}
export function ObjectView({
  services,
  expanded = false,
  ...props
}: CardBodyProps & {
  readonly services: ObjectServices;
  readonly expanded?: boolean;
}) {
  const { cardId, workspace, engine } = props,
    card = useCard(workspace, cardId),
    saving = useSaveState(workspace),
    exporting = useExportView();
  const [editingText, setEditingText] = useState(false),
    [error, setError] = useState("");
  const region = useRef<HTMLDivElement>(null),
    boardId = workspace.metadata.getSnapshot().id;
  const set = useCallback(
    (path: (string | number)[], value: JsonValue): boolean => {
      if (workspace.metadata.getSnapshot().id !== boardId) return false;
      const result = workspace.submit([
        { op: "object_set", id: cardId, path, value },
      ]);
      if (result.kind === "rejected") {
        setError(result.errors.map((field) => field.reason).join(". "));
        return false;
      }
      setError("");
      return true;
    },
    [workspace, cardId, boardId],
  );
  const retain = useCallback(
    (flush: () => boolean) => retainObjectDraft(workspace, cardId, flush),
    [workspace, cardId],
  );
  const pin = useCallback(
    (token: symbol, pinned: boolean) =>
      pinObjectDraft(engine, cardId, token, pinned),
    [engine, cardId],
  );
  const editing = useMemo(
    () => ({ enabled: expanded && editingText, set, retain, pin }),
    [expanded, editingText, set, retain, pin],
  );
  useEffect(() => {
    if (expanded) region.current?.focus({ preventScroll: true });
  }, [expanded, cardId]);
  useEffect(() => {
    if (exporting || expanded || !region.current) return;
    const request = () => {
      for (const lease of engine.leases.getSnapshot())
        if (lease.cardId === cardId)
          engine.requestMeasurement(lease.key, lease.generation);
    };
    const observer = new ResizeObserver(request);
    observer.observe(region.current);
    for (const child of region.current.children) observer.observe(child);
    request();
    return () => observer.disconnect();
  }, [card, cardId, engine, exporting, expanded]);
  if (card?.type !== "object") return null;
  const generative = generatedKinds.has(card.kind),
    name = objectNames[card.kind];
  return (
    <ObjectEditingContext value={editing}>
      <section
        onDoubleClick={(event) => {
          if (
            expanded ||
            (event.target instanceof Element &&
              event.target.closest(
                "button,input,textarea,summary,a,[contenteditable],[role=gridcell]",
              ))
          )
            return;
          event.currentTarget.dispatchEvent(
            new CustomEvent("aegis:open-card", {
              bubbles: true,
              detail: { id: cardId, keyboard: false },
            }),
          );
        }}
        onKeyDown={(event) => {
          if (
            expanded &&
            event.key !== "Escape" &&
            !(
              (event.metaKey || event.ctrlKey) &&
              (["k", "z"].includes(event.key.toLowerCase()) ||
                (event.shiftKey && event.code === "KeyF"))
            )
          )
            event.stopPropagation();
        }}
        className={`object ${card.kind}${expanded ? " expanded" : ""}${card.props?.fixedHeight ? " fixed-height" : ""}`}
      >
        {!expanded ? (
          <header className="win-strip">
            <h3>
              {card.text || name}
              <span className="kind"> · {name}</span>
            </h3>
            {generative ? (
              <span
                className={`updated${saving.kind === "saved" ? " save-settled" : ""}`}
                aria-hidden={saving.kind === "saved"}
                title={`Version ${card.ver ?? 1}`}
                role="status"
                data-object-saved
              >
                {saving.kind === "saved"
                  ? "Saved"
                  : saving.kind === "saving"
                    ? "Saving…"
                    : "Not saved"}
                {saving.kind === "blocked" ? (
                  <button
                    type="button"
                    aria-label="Retry save"
                    onClick={workspace.retry}
                  >
                    Retry
                  </button>
                ) : null}
              </span>
            ) : (card.ver ?? 1) > 1 ? (
              <span className="updated" title={`Version ${card.ver}`}>
                Updated
                {card.updated
                  ? ` · ${new Date(card.updated).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </span>
            ) : null}
            <button
              className="win-open"
              type="button"
              aria-label={`Open ${card.text || name}`}
              onClick={(event) =>
                event.currentTarget.dispatchEvent(
                  new CustomEvent("aegis:open-card", {
                    bubbles: true,
                    detail: { id: cardId, keyboard: event.detail === 0 },
                  }),
                )
              }
            >
              Open
            </button>
          </header>
        ) : null}
        <div
          ref={region}
          className={`content${generative ? " genui" : ""}`}
          tabIndex={expanded ? 0 : undefined}
          role={expanded ? "region" : undefined}
          aria-label={expanded ? `${name} content` : undefined}
          onPointerDown={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest(
                'button,input,textarea,label,.ticket,.lane,.choices,[role="gridcell"]',
              )
            )
              event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("input,textarea,summary,button") &&
              event.key !== "Escape"
            )
              event.stopPropagation();
          }}
        >
          {expanded && generative && card.kind !== "html" ? (
            <div className="text-edit-actions">
              <button
                type="button"
                className="text-edit-toggle"
                aria-pressed={editingText}
                onClick={() => {
                  if (flushObjectDrafts(workspace, cardId))
                    setEditingText(!editingText);
                }}
              >
                {editingText ? "Done editing" : "Edit text"}
              </button>
            </div>
          ) : null}
          {exporting && card.kind === "html" ? (
            <p>{card.text || "Custom UI"}</p>
          ) : (
            <Contents
              {...props}
              card={card}
              services={services}
              expanded={expanded}
            />
          )}
          {error ? (
            <p className="object-field-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </ObjectEditingContext>
  );
}
