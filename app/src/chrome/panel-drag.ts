// Panel movement adapted from Mochiboard, MIT. See LICENSE.mochiboard.
import type { PanelLayout } from "./layout.js";

export function beginPanelDrag({
  event,
  element,
  id,
  layout,
  change,
}: {
  readonly event: PointerEvent;
  readonly element: HTMLElement;
  readonly id: string;
  readonly layout: PanelLayout;
  readonly change: (layout: PanelLayout) => void;
}): () => void {
  if (
    event.button !== 0 ||
    event.pointerType === "touch" ||
    ["library", "tools"].includes(id)
  )
    return () => {};
  const home = element.parentElement;
  if (!home) return () => {};
  const nextSibling = element.nextSibling,
    originalStyle = element.style.cssText;
  const lifetime = new AbortController();
  const slots: {
    readonly element: HTMLElement;
    readonly side: "left" | "right";
    readonly before: string | null;
    readonly x: number;
    readonly y: number;
  }[] = [];
  const visibility = new Map<HTMLElement, HTMLElement["hidden"]>();
  let dragging = false,
    gripX = 0,
    gripY = 0,
    chosen: (typeof slots)[number] | undefined;
  const restore = () => {
    if (!dragging) return;
    home.insertBefore(
      element,
      nextSibling?.parentNode === home ? nextSibling : null,
    );
    slots.forEach((slot) => slot.element.remove());
    element.style.cssText = originalStyle;
    element.classList.remove("panel-lifted", "aegis-chrome");
    document.body.classList.remove("panel-arranging");
    document
      .querySelectorAll(".side.panel-drop")
      .forEach((side) => side.classList.remove("panel-drop"));
    for (const [column, hidden] of visibility) column.hidden = hidden;
    dragging = false;
  };
  const finish = (keep: boolean) => {
    lifetime.abort();
    restore();
    if (!keep || !chosen) return;
    const columns = {
      left: layout.columns.left.filter((item) => item !== id),
      right: layout.columns.right.filter((item) => item !== id),
    };
    const target = columns[chosen.side],
      at = chosen.before ? target.indexOf(chosen.before) : target.length;
    target.splice(at < 0 ? target.length : at, 0, id);
    change({
      ...layout,
      columns,
      open: { ...layout.open, [chosen.side]: true },
    });
  };
  window.addEventListener(
    "pointermove",
    (move) => {
      if (move.pointerId !== event.pointerId) return;
      if (!dragging) {
        if (
          Math.hypot(
            move.clientX - event.clientX,
            move.clientY - event.clientY,
          ) < 5
        )
          return;
        const rect = element.getBoundingClientRect();
        gripX = event.clientX - rect.left;
        gripY = event.clientY - rect.top;
        dragging = true;
        element.classList.add("panel-lifted", "aegis-chrome");
        Object.assign(element.style, {
          position: "fixed",
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${Math.min(rect.height, 320)}px`,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: "400",
          background: "var(--color-surface)",
        });
        document.body.append(element);
        document.body.classList.add("panel-arranging");
        for (const side of ["left", "right"] as const) {
          const column = document.getElementById(
            side === "left" ? "side" : "sideRight",
          );
          if (!column) continue;
          visibility.set(column, column.hidden);
          column.hidden = false;
          column.classList.add("panel-drop");
          const before = [...column.children].filter(
            (child): child is HTMLElement =>
              child instanceof HTMLElement &&
              child.classList.contains("pbox") &&
              !["library", id].includes(child.dataset["panel"] ?? ""),
          );
          for (const other of [...before, null]) {
            const slot = document.createElement("div");
            slot.className = "panel-slot";
            slot.setAttribute("aria-hidden", "true");
            column.insertBefore(slot, other);
            const box = slot.getBoundingClientRect();
            slots.push({
              element: slot,
              side,
              before: other?.dataset["panel"] ?? null,
              x: box.left + box.width / 2,
              y: box.top + box.height / 2,
            });
          }
        }
      }
      move.preventDefault();
      const nearest = slots.reduce<(typeof slots)[number] | undefined>(
        (best, slot) =>
          !best ||
          Math.hypot(move.clientX - slot.x, move.clientY - slot.y) <
            Math.hypot(move.clientX - best.x, move.clientY - best.y)
            ? slot
            : best,
        undefined,
      );
      if (chosen !== nearest) {
        chosen?.element.classList.remove("on");
        chosen = nearest;
        chosen?.element.classList.add("on");
      }
      element.style.left = `${move.clientX - gripX}px`;
      element.style.top = `${move.clientY - gripY}px`;
    },
    { passive: false, signal: lifetime.signal },
  );
  window.addEventListener(
    "pointerup",
    (up) => {
      if (up.pointerId === event.pointerId) finish(true);
    },
    { signal: lifetime.signal },
  );
  window.addEventListener(
    "pointercancel",
    (cancel) => {
      if (cancel.pointerId === event.pointerId) finish(false);
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
  return () => finish(false);
}
