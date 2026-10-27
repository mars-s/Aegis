import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useDraftFlush } from "./context.js";

export interface ValueProps {
  readonly value: string | number;
  readonly label: string;
  readonly numeric?: boolean;
  readonly display?: string;
  readonly multiline?: boolean;
  readonly maxLength?: number;
  readonly description?: string;
  readonly onChange: (value: string | number) => boolean;
}
type Draft =
  | { readonly kind: "idle" }
  | {
      readonly kind: "editing";
      readonly base: string | number;
      readonly text: string;
    };
export function Value({
  value,
  label,
  numeric = false,
  display,
  multiline = false,
  maxLength = 40,
  description,
  onChange,
}: ValueProps) {
  const [draft, setDraft] = useState<Draft>({ kind: "idle" });
  const draftRef = useRef(draft),
    field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const composing = useRef(false);
  function change(next: Draft) {
    draftRef.current = next;
    setDraft(next);
  }
  function commit(): boolean {
    const active = draftRef.current,
      input = field.current;
    if (active.kind === "idle") return true;
    if (
      !input ||
      composing.current ||
      !input.reportValidity() ||
      (numeric && input.value === "")
    )
      return false;
    const next =
      numeric && input instanceof HTMLInputElement
        ? input.valueAsNumber
        : input.value;
    if (typeof next === "number" && !Number.isFinite(next)) return false;
    if (value !== active.base && next !== value && next !== active.base) {
      setError(
        "This value changed while you were editing. Copy your value or press Escape to keep the latest value.",
      );
      return false;
    }
    if (next !== active.base && !onChange(next)) return false;
    change({ kind: "idle" });
    setError("");
    return true;
  }
  useDraftFlush(commit, draft.kind === "editing");
  useEffect(() => {
    if (draft.kind === "editing") {
      field.current?.focus({ preventScroll: true });
      field.current?.select();
    }
  }, [draft.kind]);
  function key(event: KeyboardEvent<HTMLSpanElement>) {
    if (draftRef.current.kind !== "editing") return;
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      change({ kind: "idle" });
      setError("");
      queueMicrotask(() => trigger.current?.focus({ preventScroll: true }));
    } else if (
      (event.key === "Enter" && !(multiline && event.shiftKey)) ||
      event.key === "Tab"
    ) {
      event.preventDefault();
      const stops = [
        ...document.querySelectorAll<HTMLElement>(
          'button,input,textarea,a[href],[tabindex="0"]',
        ),
      ].filter(
        (node) =>
          !node.closest("[inert],[hidden]") &&
          node.getClientRects().length &&
          getComputedStyle(node).visibility !== "hidden" &&
          !node.matches(":disabled") &&
          node.tabIndex >= 0,
      );
      const next =
        event.key === "Tab" && field.current
          ? stops[stops.indexOf(field.current) + (event.shiftKey ? -1 : 1)]
          : trigger.current;
      if (commit())
        queueMicrotask(() =>
          (next?.isConnected ? next : trigger.current)?.focus({
            preventScroll: true,
          }),
        );
    }
  }
  const inputProps = {
    "aria-label": label,
    "aria-description": description,
    maxLength,
    defaultValue: draft.kind === "editing" ? draft.text : value,
    onBlur: () => {
      commit();
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: () => {
      composing.current = false;
    },
    onChange: (event: {
      currentTarget: HTMLInputElement | HTMLTextAreaElement;
    }) => {
      const active = draftRef.current;
      if (active.kind === "editing")
        change({ ...active, text: event.currentTarget.value });
    },
  };
  return (
    <span
      className={`inline-value${draft.kind === "editing" ? " editing" : ""}${multiline ? " multiline" : ""}`}
      onKeyDown={key}
    >
      <button
        ref={trigger}
        type="button"
        className="value-trigger"
        aria-label={label}
        tabIndex={draft.kind === "editing" ? -1 : 0}
        onClick={() =>
          change({ kind: "editing", base: value, text: String(value) })
        }
      >
        {display ?? String(value)}
      </button>
      {draft.kind === "editing" ? (
        multiline ? (
          <textarea
            {...inputProps}
            rows={Math.min(12, Math.max(2, draft.text.split("\n").length))}
            ref={(node) => {
              field.current = node;
            }}
          />
        ) : (
          <input
            {...inputProps}
            type={numeric ? "number" : "text"}
            required={numeric}
            min={numeric ? 0 : undefined}
            step="any"
            ref={(node) => {
              field.current = node;
            }}
          />
        )
      ) : null}
      {error ? (
        <span role="alert" className="object-field-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
