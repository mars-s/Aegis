import { Fragment, useEffect, useState } from "react";
import { z } from "zod/v4";
import type { Composition } from "../composition.js";
import { readLayout, resetLayout, saveLayout } from "./layout.js";
import { ValuePicker } from "./controls.js";

const ToolbarSchema = z.object({
  size: z.enum(["small", "medium", "large"]).catch("medium"),
  hidden: z.array(z.string()).catch([]),
  order: z.array(z.string()).catch([]),
});
type Toolbar = z.output<typeof ToolbarSchema>;
function readToolbar(): Toolbar {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem("aegis:toolbar") || "{}",
    );
    return ToolbarSchema.parse(raw);
  } catch {
    return ToolbarSchema.parse({});
  }
}
function saveToolbar(next: Toolbar): void {
  localStorage.setItem("aegis:toolbar", JSON.stringify(next));
  window.dispatchEvent(new Event("aegis:toolbar-changed"));
}
export function useToolbar() {
  const [value, setValue] = useState(readToolbar);
  useEffect(() => {
    const refresh = () => setValue(readToolbar());
    window.addEventListener("aegis:toolbar-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("aegis:toolbar-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return value;
}
export function toolOrder(
  defaults: readonly string[],
  saved: readonly string[],
): string[] {
  return [
    ...new Set([...saved.filter((id) => defaults.includes(id)), ...defaults]),
  ];
}
export function toolbarTools(composition: Composition) {
  return [
    { id: "select", label: "Select" },
    { id: "note", label: "Note" },
    { id: "title", label: "Heading" },
    { id: "todo", label: "Checklist" },
    { id: "readme", label: "Read me" },
    { id: "templates", label: "Templates" },
    ...composition.tools,
  ];
}
export function ToolbarPreferences({
  composition,
}: {
  readonly composition: Composition;
}) {
  const value = useToolbar(),
    tools = toolbarTools(composition),
    order = toolOrder(
      tools.map((tool) => tool.id),
      value.order,
    );
  function move(id: string, delta: number): void {
    const at = order.indexOf(id),
      next = order.filter((item) => item !== id);
    next.splice(Math.max(0, Math.min(next.length, at + delta)), 0, id);
    saveToolbar({ ...value, order: next });
  }
  return (
    <section className="sheet-sec chrome-preferences">
      <h3>Your toolbar</h3>
      <label>
        Tool size
        <ValuePicker
          label="Tool size"
          value={value.size}
          size
          options={[
            ["small", "Small"],
            ["medium", "Medium"],
            ["large", "Large"],
          ]}
          onChange={(size) => {
            if (size === "small" || size === "medium" || size === "large")
              saveToolbar({ ...value, size });
          }}
        />
      </label>
      <div className="toolbar-options">
        {order.map((id, index) => (
          <div
            key={id}
            className="toolbar-option"
            draggable
            onDragStart={(event) =>
              event.dataTransfer.setData("text/x-aegis-tool", id)
            }
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("text/x-aegis-tool"))
                event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const source = event.dataTransfer.getData("text/x-aegis-tool");
              if (order.includes(source))
                move(source, order.indexOf(id) - order.indexOf(source));
            }}
          >
            <label>
              {tools.find((tool) => tool.id === id)?.label}
              <button
                type="button"
                role="switch"
                aria-label={`Show ${id}`}
                aria-checked={!value.hidden.includes(id)}
                className="setting-switch"
                onClick={() =>
                  saveToolbar({
                    ...value,
                    hidden: value.hidden.includes(id)
                      ? value.hidden.filter((item) => item !== id)
                      : [...value.hidden, id],
                  })
                }
              >
                <span />
              </button>
            </label>
            <button
              type="button"
              aria-label={`Move ${id} up`}
              disabled={index === 0}
              onClick={() => move(id, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${id} down`}
              disabled={index === order.length - 1}
              onClick={() => move(id, 1)}
            >
              ↓
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => saveToolbar(ToolbarSchema.parse({}))}
      >
        Reset toolbar
      </button>
    </section>
  );
}
export function PanelPreferences({
  composition,
}: {
  readonly composition: Composition;
}) {
  const [layout, setLayout] = useState(readLayout);
  useEffect(() => {
    const refresh = () => setLayout(readLayout());
    window.addEventListener("aegis:panels-changed", refresh);
    return () => window.removeEventListener("aegis:panels-changed", refresh);
  }, []);
  const panels = [
    { id: "layers", label: "Windows" },
    { id: "library", label: "Library" },
    { id: "tools", label: "Tools" },
    ...composition.panels.map((panel) => ({
      id: panel.id,
      label: panel.label ?? panel.id,
    })),
    { id: "keys", label: "Shortcuts" },
  ];
  const nested = panels.filter(panel =>
    !layout.columns.left.includes(panel.id) && !layout.columns.right.includes(panel.id) &&
    (panel.id === "keys" || composition.panels.some(item => item.id === panel.id && item.side === "left")),
  );
  const childIds = new Set(nested.map(panel => panel.id));
  const choice = (panel: { readonly id: string; readonly label: string }) => (
    <label key={panel.id}>
      <input
        type="checkbox"
        aria-label={`Show ${panel.label}`}
        data-panel-visibility={panel.id}
        checked={!layout.off[panel.id]}
        onChange={event => saveLayout({ ...layout, off: { ...layout.off, [panel.id]: !event.currentTarget.checked } })}
      />
      {panel.label}
    </label>
  );
  return (
    <section className="sheet-sec chrome-preferences">
      <h3>Side bar panels</h3>
      <div className="panel-layout-options">
        {panels.filter(panel => !childIds.has(panel.id)).map(panel => (
          <Fragment key={panel.id}>
            {choice(panel)}
            {panel.id === "tools" ? <div className="panel-tools-choices" role="group" aria-label="Tools panels">{nested.map(choice)}</div> : null}
          </Fragment>
        ))}
      </div>
      <button type="button" data-reset-panels onClick={resetLayout}>
        Reset layout
      </button>
    </section>
  );
}
