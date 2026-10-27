import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createMenu } from "../lib/ui/menu.js";
import type { MenuItem } from "../lib/ui/menu.js";
import { bindDisclosure, createPopup } from "../lib/ui/dropdown.js";

export function Icon({
  name,
}: {
  readonly name:
    | "more"
    | "left"
    | "right"
    | "close"
    | "fold"
    | "window"
    | "lock"
    | "hidden"
    | "rotate";
}) {
  const path = {
    more: "M3 8h.01M8 8h.01M13 8h.01",
    left: "m10 4-4 4 4 4",
    right: "m6 4 4 4-4 4",
    close: "m4 4 8 8M12 4l-8 8",
    fold: "M3 8h10M8 3v10",
    window: "M3 3h10v10H3zM3 6h10",
    lock: "M4 7h8v6H4zM5 7V5a3 3 0 0 1 6 0v2",
    hidden: "m2 2 12 12M6 4c4-1 7 2 8 4l-2 3M9 12c-4 1-6-2-7-4l2-3",
    rotate: "M12.5 6a5 5 0 1 0 .5 4M9 6h4V2",
  }[name];
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function MenuButton({
  label,
  triggerLabel,
  items,
  className = "",
  children,
  menuClass = "",
  disabled = false,
  tabIndex,
}: {
  readonly label: string;
  readonly triggerLabel?: string;
  readonly items: readonly MenuItem[] | (() => readonly MenuItem[]);
  readonly className?: string;
  readonly menuClass?: string;
  readonly disabled?: boolean;
  readonly tabIndex?: number;
  readonly children: ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null),
    current = useRef(items);
  useEffect(() => {
    current.current = items;
  }, [items]);
  useEffect(() => {
    if (!button.current) return;
    const menuElement = document.createElement("div");
    menuElement.className = menuClass;
    const menu = createMenu({
      trigger: button.current,
      menu: menuElement,
      label,
      items: () =>
        typeof current.current === "function"
          ? current.current()
          : current.current,
    });
    return () => menu.destroy();
  }, [label, menuClass]);
  return (
    <button
      ref={button}
      type="button"
      className={className}
      aria-label={triggerLabel ?? label}
      disabled={disabled}
      tabIndex={tabIndex}
    >
      {children}
    </button>
  );
}

export function PopupButton({
  label,
  children,
  caption,
  className = "",
  triggerId,
  menuId,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly caption?: ReactNode;
  readonly className?: string;
  readonly triggerId?: string;
  readonly menuId?: string;
}) {
  const button = useRef<HTMLButtonElement>(null),
    content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!button.current || !content.current) return;
    const popup = createPopup({
      trigger: button.current,
      menu: content.current,
      role: "dialog",
      duration: 160,
    });
    return () => popup.destroy();
  }, [label]);
  return (
    <>
      <button ref={button} id={triggerId} type="button" aria-label={label}>
        {caption ?? label}
      </button>
      <div
        ref={content}
        id={menuId}
        className={`selection-popup-menu ${className}`}
        aria-label={`${label} controls`}
        hidden
      >
        {children}
      </div>
    </>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);
  const apply = (candidate: number) => {
    if (Number.isFinite(candidate)) {
      const next = Math.min(
        max,
        Math.max(min, Math.round(candidate * 1000) / 1000),
      );
      setDraft(String(next));
      if (next !== value) onChange(next);
    }
  };
  return (
    <label className="selection-row">
      <span>{label}</span>
      <span className="aegis-stepper">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => apply(value - step)}
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={draft}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            if (draft.trim() && Number.isFinite(Number(draft)))
              apply(Number(draft));
            else setDraft(String(value));
          }}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            const next = Number(event.currentTarget.value);
            if (
              event.currentTarget.value &&
              Number.isFinite(next) &&
              next >= min &&
              next <= max
            )
              if (next !== value) onChange(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              event.stopPropagation();
              apply(
                (draft.trim() && Number.isFinite(Number(draft))
                  ? Number(draft)
                  : value) + (event.key === "ArrowUp" ? step : -step),
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => apply(value + step)}
        >
          +
        </button>
      </span>
    </label>
  );
}

export function Disclosure({
  label,
  children,
  caption,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly caption: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!details.current) return;
    const popup = bindDisclosure(details.current, {
      label: `${label} controls`,
    });
    return () => popup.destroy();
  }, [label]);
  return (
    <details ref={details} className="selection-more">
      <summary aria-label={label}>{caption}</summary>
      <div className="selection-overflow">{children}</div>
    </details>
  );
}
