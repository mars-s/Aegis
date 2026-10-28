import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { createMenu } from "../lib/ui/menu.js";
import type { MenuItem } from "../lib/ui/menu.js";
import { createDropdown, createPopup } from "../lib/ui/dropdown.js";
import type { DropdownOption } from '../lib/ui/dropdown.js';

export function TextField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="selection-row">
      <span>{label}</span>
      <input
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export function ValuePicker({
  id,
  label,
  value,
  options,
  onChange,
  size = false,
  disabled = false,
}: {
  readonly id?: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly DropdownOption[];
  readonly onChange: (value: string) => void;
  readonly size?: boolean;
  readonly disabled?: boolean;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const picker = useRef<ReturnType<typeof createDropdown> | null>(null);
  const current = useRef(onChange);
  useEffect(() => {
    current.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const control = createDropdown({
      label,
      options: [],
      value: "",
      onChange: (next) => current.current(next),
    });
    control.addEventListener("click", () =>
      control.focus({ preventScroll: true }),
    );
    if (id) control.id = id;
    if (size) control.dataset.size = "";
    picker.current = control;
    host.current?.append(control);
    return () => {
      control.dropdown.destroy();
      control.remove();
      picker.current = null;
    };
  }, [id, label, size]);
  useEffect(() => {
    picker.current?.setOptions(options);
    if (picker.current) {
      picker.current.value = value;
      picker.current.disabled = disabled;
      if (disabled) picker.current.dropdown.close(false, true);
    }
  }, [options, value, disabled]);
  return <span ref={host} className="chrome-value-picker" />;
}

export { Icon } from './icons.js';

export function MenuButton({
  label,
  triggerLabel,
  items,
  className = "",
  children,
  menuClass = "",
  dataProjectCover,
  disabled = false,
  tabIndex,
}: {
  readonly label: string;
  readonly triggerLabel?: string;
  readonly items: readonly MenuItem[] | (() => readonly MenuItem[]);
  readonly className?: string;
  readonly menuClass?: string;
  readonly dataProjectCover?: string;
  readonly disabled?: boolean;
  readonly tabIndex?: number;
  readonly children: ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null),
    current = useRef(items),
    menuNode = useRef<HTMLDivElement | null>(null),
    menuLabel = useRef(label);
  useEffect(() => {
    menuLabel.current = label;
    menuNode.current?.setAttribute("aria-label", label);
  }, [label]);
  useEffect(() => {
    current.current = items;
  }, [items]);
  useEffect(() => {
    if (!button.current) return;
    const menuElement = document.createElement("div");
    menuNode.current = menuElement;
    menuElement.className = menuClass;
    const menu = createMenu({
      trigger: button.current,
      menu: menuElement,
      label: menuLabel.current,
      items: () => [
        ...(typeof current.current === "function"
          ? current.current()
          : current.current),
      ],
    });
    return () => {
      menu.destroy();
      menuNode.current = null;
    };
  }, [menuClass]);
  return (
    <button
      ref={button}
      type="button"
      className={className}
      aria-label={triggerLabel ?? label}
      title={label}
      disabled={disabled}
      tabIndex={tabIndex}
      data-project-cover={dataProjectCover}
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
  closeOnResize = false,
  placement = "bottom",
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly caption?: ReactNode;
  readonly className?: string;
  readonly triggerId?: string;
  readonly menuId?: string;
  readonly closeOnResize?: boolean;
  readonly placement?: "bottom" | "right";
}) {
  const button = useRef<HTMLButtonElement>(null),
    content = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createPopup> | null>(null);
  useEffect(() => {
    if (!button.current || !content.current) return;
    const popup = createPopup({
      trigger: button.current,
      menu: content.current,
      role: "dialog",
      duration: 160,
      placement,
      onToggle: (opened) => {
        if (opened) button.current?.focus({ preventScroll: true });
      },
    });
    controller.current = popup;
    const resized = () => { if (closeOnResize) popup.close(false, true); };
    window.addEventListener("resize", resized);
    return () => { window.removeEventListener("resize", resized); popup.destroy(); controller.current = null; };
  }, [label, closeOnResize, placement]);
  return (
    <>
      <button ref={button} id={triggerId} type="button" aria-label={label} title={caption ? label : undefined}>
        {caption ?? label}
      </button>
      <div
        ref={content}
        id={menuId}
        className={`selection-popup-menu ${className}`}
        aria-label={`${label} controls`}
        onClick={event => {
          const target = event.target;
          if (target instanceof Element && target.closest('button[data-popup-close],button[data-tool]:not([data-tool="templates"])')) controller.current?.close(true, true);
        }}
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
  nested = false,
  dismissed = false,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly caption: ReactNode;
  readonly nested?: boolean;
  readonly dismissed?: boolean;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const activePopup = useRef<ReturnType<typeof createPopup> | null>(null);
  const [menu] = useState(() => {
    const element = document.createElement("div");
    element.className = `aegis-chrome selection-menu ${nested ? "selection-submenu-panel" : "selection-overflow"}`;
    return element;
  });
  useEffect(() => {
    menu.setAttribute("aria-label", `${label} controls`);
  }, [label, menu]);
  useEffect(() => {
    const node = details.current,
      trigger = node?.querySelector("summary");
    if (!node || !trigger) return;
    const placement: 'bottom' | 'right' = nested ? 'right' : 'bottom';
    const options = {
      trigger,
      menu,
      portal: true,
      role: "dialog",
      placement,
      onToggle: (open: boolean) => {
        node.open = open;
        if (open)
          menu
            .querySelector<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),summary",
            )
            ?.focus({ preventScroll: true });
      },
    };
    const popup = createPopup(options);
    activePopup.current = popup;
    const toggle = () => {
      if (!node.open) popup.close();
    };
    node.addEventListener("toggle", toggle);
    return () => {
      node.removeEventListener("toggle", toggle);
      popup.destroy();
      activePopup.current = null;
    };
  }, [menu, nested]);
  useEffect(() => {
    if (dismissed) activePopup.current?.close(false, true);
  }, [dismissed]);
  return (
    <details
      ref={details}
      className={nested ? "selection-submenu" : "selection-more"}
    >
      <summary aria-label={label}>{caption}</summary>
      {createPortal(children, menu)}
    </details>
  );
}
