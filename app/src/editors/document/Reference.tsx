import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { z } from "zod/v4";
import { CardIdSchema } from "@aegis/domain/schema";
import type { Board, Card, CardId } from "@aegis/domain";
import { cardSummary, columnLabel, cellText } from "@aegis/domain/summary";
import { parseCsv } from "@aegis/domain/dataset";
import type { Dataset } from "@aegis/domain/dataset";
import type { FeatureContext, FeatureWorkspace } from "../../composition.js";
import { useDocumentServices } from "./services.js";
import { Choice } from "./controls.js";

const RegionSchema = z.object({
  sourceId: CardIdSchema.nullable(),
  row: z.number().int().positive().default(1),
  column: z.number().int().positive().default(1),
});
type Region = z.output<typeof RegionSchema>;
type DataState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "ready"; readonly data: Dataset };
const isReference = (card: Card): boolean =>
  card.kind === "plot" || card.kind === "sheet" || card.type === "dataset";

export function useBoard(workspace: FeatureWorkspace): Board {
  const subscribe = useMemo(
    () => (listener: () => void) => workspace.scene.subscribe(() => listener()),
    [workspace],
  );
  return useSyncExternalStore(subscribe, workspace.scene.snapshot);
}

export function referenceCandidates(board: Board, source: Card) {
  const linked = new Set(
    board.links.flatMap((link) =>
      link.a === source.id ? [link.b] : link.b === source.id ? [link.a] : [],
    ),
  );
  const sheet = (card: Card) =>
    card.kind === "sheet"
      ? card.id
      : card.kind === "plot"
        ? card.data.source?.cardId
        : undefined;
  const sourceSheet = sheet(source);
  return board.cards
    .filter((card) => {
      let current: Card | undefined = card;
      const seen = new Set<CardId>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        if (current.props?.hidden === true) return false;
        const parent: CardId | undefined = current.parent;
        current = parent
          ? board.cards.find((item) => item.id === parent)
          : undefined;
      }
      return card.id !== source.id && isReference(card);
    })
    .map((card) => ({
      card,
      relation: linked.has(card.id)
        ? "Linked"
        : sourceSheet && sheet(card) === sourceSheet
          ? "Shared data"
          : "Nearby",
    }))
    .sort((a, b) => {
      const rank = (relation: string) =>
        relation === "Linked" ? 0 : relation === "Shared data" ? 1 : 2;
      const distance = (card: Card) =>
        Math.hypot(
          card.x + card.w / 2 - source.x - source.w / 2,
          card.y + card.h / 2 - source.y - source.h / 2,
        );
      return (
        rank(a.relation) - rank(b.relation) ||
        distance(a.card) - distance(b.card)
      );
    });
}

function ReferenceTable({
  card,
  region,
  change,
}: {
  readonly card: Card;
  readonly region: Region;
  readonly change: (region: Region) => void;
}) {
  const services = useDocumentServices();
  const [dataset, setDataset] = useState<DataState>({ kind: "loading" });
  const source = typeof card.props?.src === "string" ? card.props.src : "";
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (card.type !== "dataset") return;
    const lifetime = new AbortController();
    setDataset({ kind: "loading" });
    void (async () => {
      try {
        if (!source || (source.startsWith("asset:") && !services.assetUrl))
          throw new Error("The dataset source is unavailable");
        const response = await fetch(
          services.assetUrl ? services.assetUrl(source) : source,
          { signal: lifetime.signal },
        );
        if (!response.ok) throw new Error("The dataset source is unavailable");
        const data = parseCsv(await response.text());
        if (!lifetime.signal.aborted) setDataset({ kind: "ready", data });
      } catch (error) {
        if (!lifetime.signal.aborted)
          setDataset({
            kind: "error",
            reason:
              error instanceof Error
                ? error.message
                : "Could not read this reference",
          });
      }
    })();
    return () => lifetime.abort();
  }, [card.type, source, services.assetUrl, retry]);
  const sheet =
    card.kind === "sheet"
      ? {
          columns: card.data.columns.map(columnLabel),
          rows: card.data.rows.map((row) =>
            card.data.columns.map((column, index) =>
              cellText(column, row.cells[index]),
            ),
          ),
        }
      : null;
  const data = sheet ?? (dataset.kind === "ready" ? dataset.data : null);
  const start = data
    ? Math.max(0, Math.min(data.rows.length - 1, region.row - 1))
    : 0;
  const first = data
    ? Math.max(0, Math.min(data.columns.length - 1, region.column - 1))
    : 0;
  return (
    <>
      <div className="editor-reference-table">
        {data ? (
          <table
            aria-label={`${card.text || "Data"} reference, rows ${start + 1} to ${Math.min(data.rows.length, start + 4)}`}
          >
            <thead>
              <tr>
                {data.columns.slice(first, first + 2).map((name, index) => (
                  <th key={index} scope="col" title={name}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(start, start + 4).map((row, index) => (
                <tr key={start + index}>
                  {row.slice(first, first + 2).map((value, column) => (
                    <td key={first + column} title={value}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : dataset.kind === "error" ? (
          <p role="status">
            {dataset.reason}
            <button onClick={() => setRetry((value) => value + 1)}>
              Retry reference
            </button>
          </p>
        ) : (
          <p role="status">Loading reference…</p>
        )}
      </div>
      <div className="editor-reference-region">
        <label>
          Row
          <input
            aria-label="Reference first row"
            type="number"
            min="1"
            max={Math.max(1, data?.rows.length ?? 1)}
            value={data ? start + 1 : region.row}
            onChange={(event) => {
              const row = Number(event.currentTarget.value);
              if (Number.isInteger(row) && row > 0) change({ ...region, row });
            }}
          />
        </label>
        <label>
          Column
          <input
            aria-label="Reference first column"
            type="number"
            min="1"
            max={Math.max(1, data?.columns.length ?? 1)}
            value={data ? first + 1 : region.column}
            onChange={(event) => {
              const column = Number(event.currentTarget.value);
              if (Number.isInteger(column) && column > 0)
                change({ ...region, column });
            }}
          />
        </label>
      </div>
    </>
  );
}

export function DocumentContext({
  context,
  sourceId,
}: {
  readonly context: FeatureContext;
  readonly sourceId: CardId;
}) {
  const services = useDocumentServices(),
    board = useBoard(context.workspace);
  const source = board.cards.find((card) => card.id === sourceId),
    ui = useSyncExternalStore(
      context.workspace.ui.subscribe,
      context.workspace.ui.getSnapshot,
    );
  const parsed = RegionSchema.safeParse(source?.props?.editorReference);
  const candidates = source ? referenceCandidates(board, source) : [];
  const initial = candidates.find((item) => item.relation !== "Nearby");
  const region = parsed.success
    ? parsed.data
    : { sourceId: initial?.card.id ?? null, row: 1, column: 1 };
  const reference = candidates.find(
    (item) => item.card.id === region.sourceId,
  )?.card;
  const change = (next: Region) => {
    if (
      source &&
      JSON.stringify(next) !== JSON.stringify(source.props?.editorReference)
    )
      context.workspace.submit([
        {
          op: "update",
          id: sourceId,
          set: { props: { editorReference: next } },
        },
      ]);
  };
  const Chart = services.ReferenceChart;
  if (!source || ui.editor?.view === "full") return null;
  const summary = cardSummary(source);
  return (
    <section className="document-context" aria-label="Editor context">
      <button
        className="editor-context-source"
        onClick={() =>
          document
            .querySelector<HTMLInputElement>(".docs-title")
            ?.focus({ preventScroll: true })
        }
      >
        <span>Editing</span>
        <strong>{summary.title}</strong>
        <span>{summary.wordCount ?? ""}</span>
      </button>
      <section
        className="editor-context-reference"
        data-card-id={reference?.id}
      >
        <Choice
          label="Pinned reference"
          value={region.sourceId ?? ""}
          options={[
            ["", "None"],
            ...candidates.map(
              ({ card, relation }) =>
                [card.id, `${relation}: ${cardSummary(card).title}`] as const,
            ),
            ...(region.sourceId && !reference
              ? [[region.sourceId, "Unavailable reference"] as const]
              : []),
          ]}
          change={(value) =>
            change({
              sourceId: value ? CardIdSchema.parse(value) : null,
              row: 1,
              column: 1,
            })
          }
        />
        {reference?.kind === "plot" ? (
          <div className="editor-reference-chart">
            {Chart ? (
              <Chart card={reference} cards={board.cards} />
            ) : (
              <p>Open the reference to view this chart.</p>
            )}
          </div>
        ) : reference ? (
          <ReferenceTable
            key={reference.id}
            card={reference}
            region={region}
            change={change}
          />
        ) : (
          <p>
            {region.sourceId
              ? "Reference unavailable. Choose another source or None."
              : "Link a window to pin it here"}
          </p>
        )}
        {reference ? (
          <button
            className="editor-reference-open"
            onClick={() => context.openEditor(reference.id)}
          >
            Open reference: {cardSummary(reference).title}
          </button>
        ) : null}
      </section>
    </section>
  );
}
