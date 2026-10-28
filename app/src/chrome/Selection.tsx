import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuShortcut } from "../lib/shortcuts.js";
import { createPopup } from "../lib/ui/dropdown.js";
import { OrbMark } from "../lib/ui/orb-mark.js";
import type { Card, CardId } from "@aegis/domain";
import { CardSchema } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
import type { FeatureContext } from "../composition.js";
import { useSelection, useSource } from "../workspace/index.js";
import {
  Disclosure,
  Icon,
  MenuButton,
  PopupButton,
  Stepper,
  TextField,
  ValuePicker,
} from "./controls.js";
import { arrange, locked, useBoard } from "./model.js";
import {
  deleteCards,
  duplicateCards,
  groupCards,
  selectedCards,
  submit,
} from "./actions.js";
import type { Notify } from "./actions.js";
import { restack } from './Stacking.js';
import { useCreativeServices } from "../features/media/services.js";
import {
  collectSelection,
  collectionLayout,
  writingFonts,
  fontName,
  fontFamily,
} from "../features/editing/registration.js";

export interface ChromeGestures {
  readonly start: (intent: {
    readonly kind: "resize" | "rotate";
    readonly ids: readonly CardId[];
    readonly event: PointerEvent;
  }) => void;
  readonly connect: (id: CardId) => void;
}

function numberProp(
  card: Card | undefined,
  key: string,
  fallback: number,
): number {
  const value = card?.props?.[key];
  return typeof value === "number" ? value : fallback;
}

interface SelectionBounds {
  readonly x: number;
  readonly y: number;
  readonly right: number;
  readonly bottom: number;
}
function selectionBounds(context: FeatureContext): SelectionBounds | null {
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const id of context.workspace.selection.getSnapshot()) {
    const card = context.workspace.record(id).getSnapshot();
    if (!card) continue;
    x = Math.min(x, card.x);
    y = Math.min(y, card.y);
    right = Math.max(right, card.x + card.w);
    bottom = Math.max(bottom, card.y + card.h);
  }
  return x === Infinity ? null : { x, y, right, bottom };
}
function positionSelection(
  context: FeatureContext,
  engine: CanvasEngine,
  bar: HTMLElement,
  outline: HTMLElement,
  size: { width: number; height: number; hubTop: number },
  box: SelectionBounds | null,
): void {
  const editor = context.workspace.ui.getSnapshot().editor;
  const ids = context.workspace.selection.getSnapshot();
  if (!box || engine.busy() || editor?.view === "full" || editor && ids.length === 1 && ids[0] === editor.id) {
    bar.classList.remove("selection-enter");
    bar.hidden = true;
    outline.hidden = true;
    return;
  }
  const camera = engine.camera();
  const left = box.x * camera.zoom + camera.x,
    right = box.right * camera.zoom + camera.x;
  const top = box.y * camera.zoom + camera.y,
    bottom = box.bottom * camera.zoom + camera.y;
  const area = editor ? engine.availableArea() : engine.viewport();
  const width = Math.min(size.width, Math.max(1, area.width - 24));
  const x = Math.max(
    area.x + 12,
    Math.min(area.x + area.width - width - 12, (left + right - width) / 2),
  );
  const y =
    innerWidth <= 700
      ? Math.max(8, size.hubTop - size.height - 10)
      : Math.max(
          // Stay clear of the title bar when the selection is above the view.
          52,
          Math.min(
            innerHeight - size.height - 12,
            top - size.height - 40 >= 8 ? top - size.height - 40 : bottom + 12,
          ),
        );
  // A transformed ancestor would turn the shared fixed-position popups into local
  // coordinates in WebKit. Position this small toolbar without a containing block.
  if (bar.dataset.input === "keyboard") bar.classList.remove("selection-enter");
  else if (bar.hidden) bar.classList.add("selection-enter");
  bar.hidden = false;
  bar.style.maxWidth = `${Math.max(1, area.width - 24)}px`;
  bar.style.left = `${x}px`;
  bar.style.top = `${y}px`;
  outline.hidden = context.workspace.ui.getSnapshot().editor !== null;
  outline.style.transform = `translate(${left}px, ${top}px)`;
  outline.style.width = `${right - left}px`;
  outline.style.height = `${bottom - top}px`;
}

export function Selection({
  context,
  engine,
  notify,
  gestures,
  ask,
  exportSelection,
  canOpen,
}: {
  readonly canOpen: (card: Card) => boolean;
  readonly context: FeatureContext;
  readonly engine: CanvasEngine;
  readonly notify: Notify;
  readonly gestures?: ChromeGestures;
  readonly ask?: (ids: readonly CardId[]) => void;
  readonly exportSelection: (format: "png" | "pdf") => void;
}) {
  const services = useCreativeServices();
  const board = useBoard(context.workspace),
    ids = useSelection(context.workspace),
    ui = useSource(context.workspace.ui);
  const cards = selectedCards(board, ids),
    first = cards[0],
    isLocked = cards.some((card) => locked(board, card));
  const replacement = useRef<HTMLInputElement>(null),
    replaceTarget = useRef<{
      readonly id: CardId;
      readonly board: typeof board.id;
    } | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const bar = useRef<HTMLDivElement>(null),
    outline = useRef<HTMLDivElement>(null);
  const [fonts, setFonts] = useState(false),
    [fontSearch, setFontSearch] = useState("");
  const fontTrigger = useRef<HTMLButtonElement>(null),
    fontDialog = useRef<HTMLDivElement>(null);
  const fontPopup = useRef<ReturnType<typeof createPopup> | null>(null);
  useEffect(() => {
    const element = bar.current,
      edges = outline.current;
    if (!element || !edges) return;
    const size = { width: 280, height: 38, hubTop: innerHeight - 80 };
    let geometryDirty = true,
      chromeDirty = true;
    let box: SelectionBounds | null = null;
    const invalidate = () => {
      geometryDirty = true;
      engine.invalidate();
    };
    const resized = () => {
      chromeDirty = true;
      engine.invalidate();
    };
    const detach = engine.registerFrameParticipant({
      read: () => {
        if (geometryDirty) {
          box = selectionBounds(context);
          geometryDirty = false;
        }
        if (!chromeDirty) return;
        chromeDirty = false;
        if (!element.hidden) {
          const rectangle = element.getBoundingClientRect();
          if (rectangle.width && rectangle.height) {
            size.width = rectangle.width;
            size.height = rectangle.height;
          }
        }
        const hub = document.getElementById("mobileHub");
        if (hub && !hub.hidden) size.hubTop = hub.getBoundingClientRect().top;
      },
      write: () =>
        positionSelection(context, engine, element, edges, size, box),
    });
    const input = (event: Event): void => { element.dataset.input = event.type === "keydown" ? "keyboard" : "pointer"; };
    // The scene selects on a window capture listener, so read the input kind one step earlier.
    document.addEventListener("keydown", input, true);
    document.addEventListener("pointerdown", input, true);
    const dimensions = new ResizeObserver(resized);
    dimensions.observe(element);
    const offSelection = context.workspace.selection.subscribe(invalidate),
      offScene = context.workspace.scene.subscribe(invalidate),
      offUi = context.workspace.ui.subscribe(resized);
    window.addEventListener("resize", resized);
    invalidate();
    return () => {
      detach();
      dimensions.disconnect();
      offSelection();
      offScene();
      offUi();
      window.removeEventListener("resize", resized);
      document.removeEventListener("keydown", input, true);
      document.removeEventListener("pointerdown", input, true);
    };
  }, [context, engine]);
  useEffect(() => {
    if (!fonts || !fontDialog.current || !fontTrigger.current) return;
    const popup = createPopup({
      trigger: fontTrigger.current,
      menu: fontDialog.current,
      role: "dialog",
      duration: 160,
      onToggle: (open: boolean) => { if (!open) setFonts(false); },
    });
    fontPopup.current = popup;
    popup.open();
    fontDialog.current.querySelector("input")?.focus();
    return () => { popup.destroy(); fontPopup.current = null; };
  }, [fonts]);
  function format(
    ...[key, value]:
      | [
          key:
            | "bold"
            | "italic"
            | "under"
            | "strike"
            | "locked"
            | "fixedHeight",
          value: boolean,
        ]
      | [key: "size" | "ls", value: number]
      | [key: "lh", value: number | null]
      | [key: "font", value: string | null]
      | [key: "align", value: "left" | "center" | "right"]
  ): void {
    submit(
      context,
      cards
        .filter(
          (card) =>
            !locked(board, card) &&
            card.props?.[key] !== value &&
            !(value === null && card.props?.[key] == null),
        )
        .map((card) => ({
          op: "update",
          id: card.id,
          set: { props: { [key]: value } },
        })),
      notify,
    );
  }
  function fontClose(): void {
    fontPopup.current?.close(true);
  }
  const textCards = cards.filter((card) =>
    ["note", "title", "todo", "text", "shape", "coll"].includes(card.type),
  );
  const media =
    cards.length === 1 &&
    first &&
    ["image", "audio", "video"].includes(first.type)
      ? first
      : null;
  const inlineActions = cards.length > 1 || (!textCards.length && !media);
  const colour = [
    "plain",
    "gray",
    "blue",
    "green",
    "yellow",
    "orange",
    "red",
    "purple",
  ];
  return (
    <>
      <div
        ref={bar}
        id="selectionBar"
        className="selection-bar"
        role="toolbar"
        aria-label="Selection controls"
        hidden={!first}
      >
        <div className="selection-inline">
          {cards.length > 1 ? (
            <span className="selection-count">{cards.length} selected</span>
          ) : null}
          {ask ? (
            <button
              className="selection-ai"
              title="Ask AI (⌘K)"
              aria-label={
                cards.length === 1
                  ? "Ask AI about this window"
                  : `Ask AI about ${cards.length} windows`
              }
              onClick={() => ask(ids)}
            >
              <span className="selection-ai-mark" dangerouslySetInnerHTML={{ __html: OrbMark() }} />
            </button>
          ) : null}
          {isLocked ? (
            <button
              className="selection-text"
              title="Unlock"
              onClick={() =>
                submit(
                  context,
                  cards.map((card) => ({
                    op: "update",
                    id: card.id,
                    set: { props: { locked: false } },
                  })),
                  notify,
                )
              }
            >
              <Icon name="unlock" />
              <span>Unlock</span>
            </button>
          ) : (
            <>
              {cards.length === 1 && textCards.length ? (
                <>
                  <button
                    aria-label="Bold"
                    title="Bold (⌘B)"
                    aria-pressed={textCards.every(
                      (card) => card.props?.["bold"] === true,
                    )}
                    onClick={() =>
                      format(
                        "bold",
                        !textCards.every(
                          (card) => card.props?.["bold"] === true,
                        ),
                      )
                    }
                  >
                    <Icon name="bold" />
                  </button>
                  <button
                    aria-label="Italic"
                    title="Italic (⌘I)"
                    aria-pressed={textCards.every(
                      (card) => card.props?.["italic"] === true,
                    )}
                    onClick={() =>
                      format(
                        "italic",
                        !textCards.every(
                          (card) => card.props?.["italic"] === true,
                        ),
                      )
                    }
                  >
                    <Icon name="italic" />
                  </button>
                  <span className="inline-size">
                    <Stepper
                      label="Text size"
                      value={numberProp(first, "size", first?.type === "title" ? 24 : first && ["note", "todo", "coll"].includes(first.type) ? 15 : 13)}
                      min={8}
                      max={120}
                      step={1}
                      onChange={(value) => format("size", value)}
                    />
                  </span>
                  <PopupButton label="Align" caption={<Icon name="align" />}>
                    {(["left", "center", "right"] as const).map((value) => (
                      <button
                        key={value}
                        onClick={() => format("align", value)}
                      >
                        {value === "center"
                          ? "Centre"
                          : value === "left"
                            ? "Left"
                            : "Right"}
                      </button>
                    ))}
                  </PopupButton>
                  <PopupButton label="Colour" caption={<Icon name="colour" />}>
                    <div className="selection-colours">
                      {colour.map((value) => (
                        <button
                          key={value}
                          className={`swatch-${value}`}
                          aria-label={`${value === "plain" ? "Default" : value === "gray" ? "Grey" : value[0]?.toUpperCase() + value.slice(1)} card colour`}
                          aria-pressed={first?.color === value}
                          onClick={() =>
                            submit(
                              context,
                              cards.map((card) => ({
                                op: "update",
                                id: card.id,
                                set: { color: value },
                              })),
                              notify,
                            )
                          }
                        />
                      ))}
                    </div>
                  </PopupButton>
                </>
              ) : cards.length === 1 && !media && first && canOpen(first) ? (
                <button
                  className="selection-text"
                  aria-label="Open"
                  title="Open"
                  onClick={() => {
                    if (first) context.openEditor(first.id);
                  }}
                >
                  <Icon name="open" />
                  <span>Open</span>
                </button>
              ) : null}
              {cards.length > 1 ? (
                <>
                  <PopupButton label="Align and distribute" caption={<Icon name="arrange" />}>
                    {(
                      [
                        "left",
                        "centre",
                        "right",
                        "top",
                        "middle",
                        "bottom",
                        "distribute-x",
                        "distribute-y",
                      ] as const
                    ).map((value) => (
                      <button
                        key={value}
                        onClick={() =>
                          submit(context, arrange(board, ids, value), notify)
                        }
                      >
                        {value === "distribute-x"
                          ? "Distribute horizontally"
                          : value === "distribute-y"
                            ? "Distribute vertically"
                            : `Align ${value}`}
                      </button>
                    ))}
                  </PopupButton>
                  <button
                    aria-label="Group"
                    title="Group (⌘G)"
                    onClick={() => groupCards(context, ids, false, notify)}
                  >
                    <Icon name="group" />
                  </button>
                </>
              ) : null}
              {media ? (
                <>
                  <button
                    aria-label="Replace"
                    onClick={() => {
                      replaceTarget.current = { id: media.id, board: board.id };
                      replacement.current?.click();
                    }}
                    title="Replace"
                  >
                    <Icon name="replace" />
                  </button>
                  <button
                    aria-label="Download"
                    onClick={() => {
                      void (async () => {
                        try {
                          const response = await fetch(
                            services.assetUrl(media.url),
                          );
                          if (!response.ok)
                            throw new Error("Could not download this file.");
                          const blob = await response.blob(),
                            url = URL.createObjectURL(blob),
                            link = document.createElement("a");
                          link.href = url;
                          link.download =
                            media.text ||
                            `${media.type}.${blob.type.split("/")[1] || "bin"}`;
                          link.click();
                          setTimeout(() => URL.revokeObjectURL(url), 5000);
                        } catch (cause) {
                          notify({
                            text:
                              cause instanceof Error
                                ? cause.message
                                : "Could not download this file.",
                          });
                        }
                      })();
                    }}
                    title="Download"
                  >
                    <Icon name="download" />
                  </button>
                </>
              ) : null}
              {inlineActions ? (
                <>
                  <button
                    aria-label="Duplicate"
                    title="Duplicate (⌘D)"
                    onClick={() => duplicateCards(context, ids, notify)}
                  >
                    <Icon name="duplicate" />
                  </button>
                  <button
                    aria-label="Delete"
                    title="Delete (⌫)"
                    className="selection-danger"
                    onClick={() => {
                      void deleteCards(context, ids, notify);
                    }}
                  >
                    <Icon name="delete" />
                  </button>
                </>
              ) : null}
              <Disclosure
                label="More selection controls"
                caption={<Icon name="more" />}
              >
                <section>
                  <h3>Actions</h3>
                  {first && cards.length === 1 && gestures ? (
                    <button onClick={() => gestures.connect(first.id)}>
                      Connect
                    </button>
                  ) : null}
                  {!inlineActions ? (
                    <button
                      onClick={() => duplicateCards(context, ids, notify)}
                    >
                      Duplicate
                    </button>
                  ) : null}
                  {!inlineActions ? (
                    <button
                      onClick={() => {
                        void deleteCards(context, ids, notify);
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </section>
                {textCards.length ? (
                  <Disclosure label="Format selection" caption="Format" nested>
                    {cards.length > 1 ? (
                      <Stepper
                        label="Text size"
                        value={numberProp(first, "size", first?.type === "title" ? 24 : first && ["note", "todo", "coll"].includes(first.type) ? 15 : 13)}
                        min={8}
                        max={120}
                        step={1}
                        onChange={(value) => format("size", value)}
                      />
                    ) : null}
                    <label className="selection-row">
                      <span>Font</span>
                      <ValuePicker
                        label="Font"
                        value={
                          typeof first?.props?.font === "string"
                            ? first.props.font
                            : ""
                        }
                        options={[
                          ["", "Default font"],
                          ["system-ui", "System"],
                          ["serif", "Serif"],
                          ["monospace", "Monospace"],
                        ]}
                        onChange={(value) => format("font", value || null)}
                      />
                    </label>
                    <Stepper
                      label="Line height"
                      value={numberProp(
                        first,
                        "lh",
                        first?.type === "note"
                          ? 1.45
                          : first?.type === "title"
                            ? 1
                            : 1.35,
                      )}
                      min={0.8}
                      max={3}
                      step={0.05}
                      onChange={(value) => format("lh", value)}
                    />
                    <Stepper
                      label="Letter spacing"
                      value={numberProp(first, "ls", 0)}
                      min={-10}
                      max={50}
                      step={0.5}
                      onChange={(value) => format("ls", value)}
                    />
                    <button
                      ref={fontTrigger}
                      onClick={() => {
                        setFontSearch("");
                        setFonts(true);
                      }}
                    >
                      Fonts…
                    </button>
                    <button onClick={() => format("lh", null)}>
                      Use default line height
                    </button>
                    <MenuButton
                      label="Text alignment"
                      items={(["left", "center", "right"] as const).map(
                        (value) => ({
                          title: value === "center" ? "Centre" : value,
                          run: () => format("align", value),
                        }),
                      )}
                    >
                      Text alignment
                    </MenuButton>
                    <button
                      className="selection-menu-action"
                      aria-label="Underline"
                      onClick={() =>
                        format(
                          "under",
                          !textCards.every(
                            (card) => card.props?.["under"] === true,
                          ),
                        )
                      }
                    >
                      <span>Underline</span><span className="selection-value">{menuShortcut("underline")}</span>
                    </button>
                    <button
                      onClick={() =>
                        format(
                          "strike",
                          !textCards.every(
                            (card) => card.props?.["strike"] === true,
                          ),
                        )
                      }
                    >
                      Strike through
                    </button>
                  </Disclosure>
                ) : null}
                <Disclosure label="Arrange selection" caption="Arrange" nested>
                  {cards.length > 1 ? (
                    <button onClick={() => collectSelection(context)}>
                      Collect
                    </button>
                  ) : null}
                  {cards.some((card) => card.group) ? (
                    <button
                      onClick={() => groupCards(context, ids, true, notify)}
                    >
                      Ungroup
                    </button>
                  ) : null}
                  <button
                    onClick={() => restack(context, ids, 'front', notify)}
                  >
                    Bring to front
                  </button>
                  <button
                    onClick={() => restack(context, ids, 'back', notify)}
                  >
                    Send to back
                  </button>
                  <button onClick={() => format("locked", true)}>Lock</button>
                </Disclosure>
                <Disclosure label="Details selection" caption="Details" nested>
                  {first ? (
                    <>
                      {cards.length === 1 && first.type === "note" ? (
                        <TextField
                          label="Note name"
                          value={first.heading ?? ""}
                          onChange={(heading) =>
                            submit(
                              context,
                              [
                                {
                                  op: "update",
                                  id: first.id,
                                  set: { heading },
                                },
                              ],
                              notify,
                            )
                          }
                        />
                      ) : null}
                      {cards.length === 1 &&
                      !["coll", "swatch", "ink"].includes(first.type) ? (
                        <TextField
                          label={first.type === "image" ? "Caption" : "Label"}
                          value={String(
                            first.type === "image"
                              ? (first.props?.tagText ?? first.props?.tag ?? "")
                              : (first.props?.tag ?? ""),
                          )}
                          onChange={(value) =>
                            submit(
                              context,
                              [
                                {
                                  op: "update",
                                  id: first.id,
                                  set: {
                                    props:
                                      first.type === "image"
                                        ? { tagText: value || null, tag: null }
                                        : { tag: value || null },
                                  },
                                },
                              ],
                              notify,
                            )
                          }
                        />
                      ) : null}
                      {cards.length === 1 && first.type === "coll" ? (
                        <button
                          onClick={() => {
                            const head = first.props?.head === false;
                            const card = CardSchema.parse({
                              ...first,
                              props: { ...first.props, head },
                            });
                            submit(
                              context,
                              [
                                {
                                  op: "update",
                                  id: first.id,
                                  set: { props: { head } },
                                },
                                ...collectionLayout(board, card),
                              ],
                              notify,
                            );
                          }}
                        >
                          {first.props?.head === false
                            ? "Show header"
                            : "Hide header"}
                        </button>
                      ) : null}
                      <Stepper
                        label="Width"
                        value={first.w}
                        min={20}
                        max={20000}
                        step={10}
                        onChange={(value) =>
                          submit(
                            context,
                            [{ op: "update", id: first.id, set: { w: value } }],
                            notify,
                          )
                        }
                      />
                      <Stepper
                        label="Height"
                        value={first.h}
                        min={20}
                        max={20000}
                        step={10}
                        onChange={(value) =>
                          submit(
                            context,
                            [
                              {
                                op: "update",
                                id: first.id,
                                set: { h: value, props: { fixedHeight: true } },
                              },
                            ],
                            notify,
                          )
                        }
                      />
                      {["note", "todo"].includes(first.type) ? (
                        <button
                          onClick={() =>
                            format("fixedHeight", !first.props?.fixedHeight)
                          }
                        >
                          {first.props?.fixedHeight
                            ? "Grow to fit text"
                            : "Keep current height"}
                        </button>
                      ) : null}
                      <PopupButton label="Tilt" className="editing-tilt">
                        {[-30, -15, 0, 15, 30].map((rot) => (
                          <button
                            key={rot}
                            onClick={() =>
                              submit(
                                context,
                                cards.map((card) => ({
                                  op: "update",
                                  id: card.id,
                                  set: { rot },
                                })),
                                notify,
                              )
                            }
                          >
                            {rot}°
                          </button>
                        ))}
                        <Stepper
                          label="Tilt in degrees"
                          value={first.rot ?? 0}
                          min={-180}
                          max={180}
                          step={15}
                          onChange={(value) =>
                            submit(
                              context,
                              cards.map((card) => ({
                                op: "update",
                                id: card.id,
                                set: { rot: value },
                              })),
                              notify,
                            )
                          }
                        />
                        <button
                          onClick={() =>
                            submit(
                              context,
                              cards.map((card) => ({
                                op: "update",
                                id: card.id,
                                set: { rot: 0 },
                              })),
                              notify,
                            )
                          }
                        >
                          Reset tilt
                        </button>
                      </PopupButton>
                    </>
                  ) : null}
                </Disclosure>
                <Disclosure label="Export selection" caption="Export" nested>
                  <button onClick={() => exportSelection("png")}>PNG</button>
                  <button onClick={() => exportSelection("pdf")}>PDF</button>
                </Disclosure>
              </Disclosure>
            </>
          )}
        </div>
      </div>
      <input
        ref={replacement}
        type="file"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0],
            target = replaceTarget.current;
          event.currentTarget.value = "";
          if (!file || !target) return;
          void services
            .upload(file)
            .then((upload) => {
              if (
                !mounted.current ||
                context.workspace.metadata.getSnapshot().id !== target.board ||
                !context.workspace.record(target.id).getSnapshot()
              )
                return;
              submit(
                context,
                [{ op: "update", id: target.id, set: { url: upload.url } }],
                notify,
              );
            })
            .catch((cause) => {
              if (mounted.current)
                notify({
                  text:
                    cause instanceof Error
                      ? cause.message
                      : "Could not replace this file.",
                });
            });
        }}
      />
      <div
        ref={outline}
        className="editing-outline"
        hidden={!first || !!ui.editor}
      >
        {gestures && !isLocked ? (
          <>
            <button
              className="rotation-handle"
              aria-label="Rotate selection"
              onPointerDown={(event) =>
                gestures.start({
                  kind: "rotate",
                  ids,
                  event: event.nativeEvent,
                })
              }
            >
              <Icon name="rotate" />
            </button>
            <button
              className="selection-resize"
              aria-label="Resize selection"
              onPointerDown={(event) =>
                gestures.start({
                  kind: "resize",
                  ids,
                  event: event.nativeEvent,
                })
              }
            />
          </>
        ) : null}
      </div>
      {fonts ? createPortal(
        <div
          ref={fontDialog}
          role="dialog"
          className="aegis-dialog editing-font-picker"
          aria-label="Font picker"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <input
            aria-label="Search fonts"
            value={fontSearch}
            onChange={(event) => setFontSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                fontDialog.current
                  ?.querySelector<HTMLButtonElement>("button[data-font]")
                  ?.focus();
              }
            }}
          />
          <div role="menu" aria-label="Fonts">
          {writingFonts(cards.flatMap(card => typeof card.props?.font === "string" ? [card.props.font] : []))
            .filter(font => fontName(font).toLocaleLowerCase().includes(fontSearch.trim().toLocaleLowerCase()))
            .map(value => (
              <button
                key={value}
                data-font={value}
                role="menuitem"
                tabIndex={-1}
                style={{ fontFamily: fontFamily(value) }}
                onClick={() => {
                  if (value !== undefined) format("font", value || null);
                  fontClose();
                }}
              >
                {fontName(value)}
              </button>
            ))}
          </div>
          <button onClick={fontClose}>Close</button>
        </div>, document.body
      ) : null}
    </>
  );
}
