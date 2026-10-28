import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { PanelLayout } from "./layout.js";
import { Icon } from "./controls.js";
import { beginPanelDrag } from "./panel-drag.js";

export function Panel({
  id,
  label,
  layout,
  change,
  children,
  count,
  filtered = false,
  nested = false,
}: {
  readonly id: string;
  readonly label: string;
  readonly layout: PanelLayout;
  readonly change: (next: PanelLayout) => void;
  readonly children: ReactNode;
  readonly count?: string;
  readonly filtered?: boolean;
  readonly nested?: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null),
    dragCleanup = useRef<(() => void) | null>(null),
    lifted = useRef(0);
  const folded =
    layout.folded[id] ?? !["layers", "library", "unsorted"].includes(id);
  const family = id === "layers" ? "windows" : id === "library" ? "library" : "tools";
  const fold = (): void =>
    change({ ...layout, folded: { ...layout.folded, [id]: !folded } });
  useEffect(() => () => dragCleanup.current?.(), []);
  return (
    <section
      ref={section}
      data-panel={id}
      data-family={family}
      className={`pbox${folded ? " folded" : ""}${filtered ? " is-filtered" : ""}${nested ? " nested" : ""}`}
      hidden={layout.off[id] === true}
    >
      {nested ? (
        <div className="phead subhead">
          <i className="tri" aria-hidden="true" />
          <span className="plabel">{label}</span>
          <button
            className="icon-btn"
            type="button"
            aria-label={`Fold ${label}`}
            aria-expanded={!folded}
            onClick={fold}
          >
            <Icon name="right" />
          </button>
        </div>
      ) : (
        <div
          className="phead"
          onPointerDown={(event) => {
            if (
              !section.current ||
              (event.target instanceof Element &&
                event.target.closest("button:not(.ptoggle), input"))
            )
              return;
            dragCleanup.current?.();
            dragCleanup.current = beginPanelDrag({
              event: event.nativeEvent,
              element: section.current,
              id,
              layout,
              change,
              onLift: () => {
                lifted.current = performance.now();
              },
            });
          }}
        >
          <button
            className="ptoggle"
            type="button"
            aria-label={`Toggle ${label}`}
            aria-expanded={!folded}
            onClick={() => {
              // A press that became a panel drag still ends with a click; it must not also fold.
              if (performance.now() - lifted.current < 250) return;
              fold();
            }}
          >
            <span className="pmark" aria-hidden="true" />
            <span className="plabel">{label}</span>
            {count ? <span className="pcount">{count}</span> : null}
            <span className="pchev" aria-hidden="true"><Icon name="right" /></span>
          </button>
          <div className="pactions" data-actions={id} />
        </div>
      )}
      <div
        ref={body}
        id={nested ? `tool-${id}` : undefined}
        className="pbody"
        hidden={folded}
        style={{ height: filtered ? undefined : layout.heights[id] }}
      >
        {children}
      </div>
      <div
        className="resize-handle"
        role="separator"
        aria-label={`Resize ${label}`}
        aria-orientation="horizontal"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            change({
              ...layout,
              heights: {
                ...layout.heights,
                [id]: Math.max(
                  48,
                  Math.min(
                    2000,
                    (layout.heights[id] ?? 200) +
                      (event.key === "ArrowDown" ? 16 : -16),
                  ),
                ),
              },
            });
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !body.current) return;
          event.preventDefault();
          dragCleanup.current?.();
          const element = body.current,
            height = element.getBoundingClientRect().height,
            y = event.clientY,
            pointer = event.pointerId,
            lifetime = new AbortController();
          let nextHeight = height;
          const finish = (keep: boolean) => {
            lifetime.abort();
            dragCleanup.current = null;
            element.style.height = "";
            if (keep)
              change({
                ...layout,
                heights: { ...layout.heights, [id]: Math.round(nextHeight) },
              });
          };
          dragCleanup.current = () => finish(false);
          window.addEventListener(
            "pointermove",
            (move) => {
              if (move.pointerId === pointer) {
                nextHeight = Math.max(
                  48,
                  Math.min(innerHeight * 0.8, height + move.clientY - y),
                );
                element.style.height = `${nextHeight}px`;
              }
            },
            { signal: lifetime.signal },
          );
          window.addEventListener(
            "pointerup",
            (up) => {
              if (up.pointerId === pointer) finish(true);
            },
            { signal: lifetime.signal },
          );
          window.addEventListener(
            "pointercancel",
            (cancel) => {
              if (cancel.pointerId === pointer) finish(false);
            },
            { signal: lifetime.signal },
          );
          window.addEventListener(
            "keydown",
            (key) => {
              if (key.key === "Escape") {
                key.preventDefault();
                finish(false);
              }
            },
            { signal: lifetime.signal, capture: true },
          );
        }}
      />
    </section>
  );
}

export function SideResize({
  side,
  layout,
  change,
}: {
  readonly side: "left" | "right";
  readonly layout: PanelLayout;
  readonly change: (layout: PanelLayout) => void;
}) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const key = side === "left" ? "width" : "rightWidth",
    direction = side === "left" ? 1 : -1;
  return (
    <div
      className="side-resize"
      role="separator"
      aria-label={`Resize ${side} side bar`}
      aria-orientation="vertical"
      aria-valuemin={200}
      aria-valuemax={420}
      aria-valuenow={layout[key]}
      tabIndex={0}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        change({
          ...layout,
          [key]: Math.max(
            200,
            Math.min(
              420,
              layout[key] + direction * (event.key === "ArrowRight" ? 16 : -16),
            ),
          ),
        });
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const column = event.currentTarget.closest("aside");
        if (!column) return;
        event.preventDefault();
        cleanup.current?.();
        const start = event.clientX,
          pointer = event.pointerId,
          originalWidth = column.style.width;
        const variable = side === "left" ? "--side-w" : "--right-side-w",
          originalInset =
            document.documentElement.style.getPropertyValue(variable);
        const lifetime = new AbortController();
        let width = layout[key];
        const finish = (keep: boolean) => {
          lifetime.abort();
          cleanup.current = null;
          column.style.width = originalWidth;
          document.documentElement.style.setProperty(variable, originalInset);
          if (keep) change({ ...layout, [key]: width });
        };
        cleanup.current = () => finish(false);
        window.addEventListener(
          "pointermove",
          (move) => {
            if (move.pointerId === pointer) {
              width = Math.round(
                Math.max(
                  200,
                  Math.min(
                    420,
                    layout[key] + direction * (move.clientX - start),
                  ),
                ),
              );
              column.style.width = `${width}px`;
              document.documentElement.style.setProperty(
                variable,
                `${width}px`,
              );
            }
          },
          { signal: lifetime.signal },
        );
        window.addEventListener(
          "pointerup",
          (up) => {
            if (up.pointerId === pointer) finish(true);
          },
          { signal: lifetime.signal },
        );
        window.addEventListener(
          "pointercancel",
          (cancel) => {
            if (cancel.pointerId === pointer) finish(false);
          },
          { signal: lifetime.signal },
        );
        window.addEventListener(
          "keydown",
          (key) => {
            if (key.key === "Escape") {
              key.preventDefault();
              key.stopImmediatePropagation();
              finish(false);
            }
          },
          { signal: lifetime.signal, capture: true },
        );
        window.addEventListener("blur", () => finish(false), {
          signal: lifetime.signal,
        });
      }}
    />
  );
}
