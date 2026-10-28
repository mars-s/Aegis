export type UiImplementation = "react";

export function uiImplementation(value: string | undefined): UiImplementation {
  if (value === undefined || value === "react") return "react";
  throw new Error(`Unknown AEGIS_UI_IMPL ${JSON.stringify(value)}. React is the only UI.`);
}
