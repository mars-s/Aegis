import { Fragment, useEffect, useState } from "react";
import type { Composition } from "../composition.js";
import { readLayout, resetLayout, saveLayout } from "./layout.js";

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
    ...composition.panels.map((panel) => ({
      id: panel.id,
      label: panel.label ?? panel.id,
    })),
  ];
  const choice = (panel: { readonly id: string; readonly label: string }) => (
    <label key={panel.id}>
      <input
        type="checkbox"
        className="aegis-switch"
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
        {panels.map(panel => (
          <Fragment key={panel.id}>
            {choice(panel)}
          </Fragment>
        ))}
      </div>
      <button type="button" data-reset-panels onClick={resetLayout}>
        Reset layout
      </button>
    </section>
  );
}
