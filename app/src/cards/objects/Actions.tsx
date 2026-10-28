import { useEffect, useRef } from "react";
import { createMenu } from "../../lib/ui/menu.js";
export interface ObjectAction {
  readonly title: string;
  readonly ariaLabel: string;
  readonly checked: boolean;
  readonly run: () => void;
}
export function Actions({
  label,
  heading,
  items,
}: {
  readonly label: string;
  readonly heading: string;
  readonly items: readonly ObjectAction[];
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    current = useRef(items);
  useEffect(() => {
    current.current = items;
  }, [items]);
  useEffect(() => {
    const button = trigger.current;
    if (!button) return;
    const menu = createMenu({
      trigger: button,
      label,
      heading,
      items: () =>
        current.current.map((item) => ({
          ...item,
          run: () => {
            const region = button.closest(".genui");
            item.run();
            queueMicrotask(() => {
              if (!button.isConnected)
                [
                  ...(region?.querySelectorAll<HTMLButtonElement>(
                    ".kind-more",
                  ) ?? []),
                ]
                  .find((node) => node.getAttribute("aria-label") === label)
                  ?.focus({ preventScroll: true });
            });
          },
        })),
    });
    return () => menu.destroy();
  }, [label, heading]);
  return (
    <button
      ref={trigger}
      className="kind-more"
      type="button"
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="3" cy="8" r=".75" />
        <circle cx="8" cy="8" r=".75" />
        <circle cx="13" cy="8" r=".75" />
      </svg>
    </button>
  );
}
