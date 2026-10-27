import { useEffect, useRef, useState } from "react";
import type { Card, CardId } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
import type { FeatureContext } from "../composition.js";
import { useSelection, useSource } from "../workspace/index.js";
import {
  Disclosure,
  Icon,
  MenuButton,
  PopupButton,
  Stepper,
} from "./controls.js";
import { arrange, bounds, locked, useBoard } from "./model.js";
import {
  deleteCards,
  duplicateCards,
  groupCards,
  selectedCards,
  submit,
} from "./actions.js";
import type { Notify } from "./actions.js";

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

function positionSelection(
  context: FeatureContext,
  engine: CanvasEngine,
  bar: HTMLElement,
  outline: HTMLElement,
  size: { width: number; height: number },
): void {
  const ids = context.workspace.selection.getSnapshot();
  const cards = ids.flatMap((id) => {
    const card = context.workspace.record(id).getSnapshot();
    return card ? [card] : [];
  });
  const box = bounds(cards);
  if (!box) {
    bar.hidden = true;
    outline.hidden = true;
    return;
  }
  const camera = engine.camera();
  const left = box.x * camera.zoom + camera.x,
    right = box.right * camera.zoom + camera.x;
  const top = box.y * camera.zoom + camera.y,
    bottom = box.bottom * camera.zoom + camera.y;
  const x = Math.max(
    12,
    Math.min(innerWidth - size.width - 12, (left + right - size.width) / 2),
  );
  const y = Math.max(
    8,
    Math.min(
      innerHeight - size.height - 12,
      top - size.height - 40 >= 8 ? top - size.height - 40 : bottom + 12,
    ),
  );
  // A transformed ancestor would turn the shared fixed-position popups into local
  // coordinates in WebKit. Position this small toolbar without a containing block.
  bar.hidden = false;
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
}: {
  readonly context: FeatureContext;
  readonly engine: CanvasEngine;
  readonly notify: Notify;
  readonly gestures?: ChromeGestures;
  readonly ask?: (ids: readonly CardId[]) => void;
}) {
  const board = useBoard(context.workspace),
    ids = useSelection(context.workspace),
    ui = useSource(context.workspace.ui);
  const cards = selectedCards(board, ids),
    first = cards[0],
    isLocked = cards.some((card) => locked(board, card));
  const bar = useRef<HTMLDivElement>(null),
    outline = useRef<HTMLDivElement>(null);
  const [fonts, setFonts] = useState(false),
    [fontSearch, setFontSearch] = useState("");
  const fontTrigger = useRef<HTMLButtonElement>(null),
    fontDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = bar.current,
      edges = outline.current;
    if (!element || !edges) return;
    const size = { width: 280, height: 38 };
    let pendingSize: ReturnType<typeof setTimeout> | null = null;
    const position = () =>
      positionSelection(context, engine, element, edges, size);
    // Scene writes its camera transform once. This observer reads model geometry only.
    // It neither measures layout nor starts a competing animation loop.
    const world = document.getElementById("world");
    const movement = new MutationObserver(position);
    if (world)
      movement.observe(world, { attributes: true, attributeFilter: ["style"] });
    const dimensions = new ResizeObserver((entries) => {
      const entry = entries[0],
        border = entry?.borderBoxSize[0];
      if (border && border.inlineSize > 0 && border.blockSize > 0) {
        size.width = border.inlineSize;
        size.height = border.blockSize;
      }
      if (pendingSize === null)
        pendingSize = setTimeout(() => {
          pendingSize = null;
          position();
        }, 0);
    });
    dimensions.observe(element);
    const offSelection = context.workspace.selection.subscribe(position),
      offScene = context.workspace.scene.subscribe(position);
    window.addEventListener("resize", position);
    position();
    return () => {
      movement.disconnect();
      dimensions.disconnect();
      if (pendingSize !== null) clearTimeout(pendingSize);
      offSelection();
      offScene();
      window.removeEventListener("resize", position);
    };
  }, [context, engine]);
  useEffect(() => {
    if (fonts) {
      fontDialog.current?.showModal();
      fontDialog.current?.querySelector("input")?.focus();
    }
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
    fontDialog.current?.close();
    setFonts(false);
    fontTrigger.current?.focus();
  }
  const textCards = cards.filter((card) =>
    ["note", "title", "todo", "text", "shape", "coll"].includes(card.type),
  );
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
        {cards.length > 1 ? <span>{cards.length} selected</span> : null}
        {ask ? (
          <button
            aria-label={
              cards.length === 1
                ? "Ask AI about this window"
                : `Ask AI about ${cards.length} windows`
            }
            onClick={() => ask(ids)}
          >
            Ask AI
          </button>
        ) : null}
        {isLocked ? (
          <button
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
            Unlock
          </button>
        ) : (
          <>
            {textCards.length ? (
              <>
                <button
                  aria-label="Bold"
                  aria-pressed={textCards.every(
                    (card) => card.props?.["bold"] === true,
                  )}
                  onClick={() =>
                    format(
                      "bold",
                      !textCards.every((card) => card.props?.["bold"] === true),
                    )
                  }
                >
                  <b>B</b>
                </button>
                <button
                  aria-label="Italic"
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
                  <i>I</i>
                </button>
                <span className="inline-size">
                  <Stepper
                    label="Text size"
                    value={numberProp(first, "size", 15)}
                    min={8}
                    max={120}
                    step={1}
                    onChange={(value) => format("size", value)}
                  />
                </span>
                <PopupButton label="Align">
                  {(["left", "center", "right"] as const).map((value) => (
                    <button key={value} onClick={() => format("align", value)}>
                      {value === "center"
                        ? "Centre"
                        : value === "left"
                          ? "Left"
                          : "Right"}
                    </button>
                  ))}
                </PopupButton>
                <PopupButton label="Colour">
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
            ) : (
              <button
                onClick={() => {
                  if (first) context.openEditor(first.id);
                }}
              >
                Open
              </button>
            )}
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
                <button onClick={() => duplicateCards(context, ids, notify)}>
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    void deleteCards(context, ids, notify);
                  }}
                >
                  Delete
                </button>
              </section>
              {textCards.length ? (
                <Disclosure label="Format selection" caption="Format">
                  <Stepper
                    label="Text size"
                    value={numberProp(first, "size", 15)}
                    min={8}
                    max={120}
                    step={1}
                    onChange={(value) => format("size", value)}
                  />
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
                    onClick={() =>
                      format(
                        "under",
                        !textCards.every(
                          (card) => card.props?.["under"] === true,
                        ),
                      )
                    }
                  >
                    Underline
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
              <Disclosure label="Arrange selection" caption="Arrange">
                {cards.length > 1 ? (
                  <>
                    <button
                      onClick={() => groupCards(context, ids, false, notify)}
                    >
                      Group
                    </button>
                    <MenuButton
                      label="Align and distribute"
                      items={(
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
                      ).map((value) => ({
                        title: value.startsWith("distribute")
                          ? value === "distribute-x"
                            ? "Distribute horizontally"
                            : "Distribute vertically"
                          : `Align ${value}`,
                        run: () => {
                          submit(context, arrange(board, ids, value), notify);
                        },
                      }))}
                    >
                      Align and distribute
                    </MenuButton>
                  </>
                ) : null}
                {cards.some((card) => card.group) ? (
                  <button
                    onClick={() => groupCards(context, ids, true, notify)}
                  >
                    Ungroup
                  </button>
                ) : null}
                <button
                  onClick={() =>
                    submit(
                      context,
                      [{ op: "order", ids: [...ids], to: "front" }],
                      notify,
                    )
                  }
                >
                  Bring to front
                </button>
                <button
                  onClick={() =>
                    submit(
                      context,
                      [{ op: "order", ids: [...ids], to: "back" }],
                      notify,
                    )
                  }
                >
                  Send to back
                </button>
                <button onClick={() => format("locked", true)}>Lock</button>
              </Disclosure>
              <Disclosure label="Details selection" caption="Details">
                {first ? (
                  <>
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
                    <PopupButton label="Tilt">
                      <Stepper
                        label="Rotation"
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
                    </PopupButton>
                  </>
                ) : null}
              </Disclosure>
            </Disclosure>
          </>
        )}
      </div>
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
      {fonts ? (
        <dialog
          ref={fontDialog}
          className="aegis-dialog editing-font-picker"
          aria-label="Font picker"
          onCancel={(event) => {
            event.preventDefault();
            fontClose();
          }}
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
          {[
            ["system-ui", "System"],
            ["serif", "Serif"],
            ["monospace", "Monospace"],
            ["", "Default font"],
          ]
            .filter(([, label]) =>
              label
                ?.toLocaleLowerCase()
                .includes(fontSearch.toLocaleLowerCase()),
            )
            .map(([value, label]) => (
              <button
                key={value}
                data-font={value}
                onClick={() => {
                  if (value !== undefined) format("font", value || null);
                  fontClose();
                }}
              >
                {label}
              </button>
            ))}
          <button onClick={fontClose}>Close</button>
        </dialog>
      ) : null}
    </>
  );
}
