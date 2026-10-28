export type UiImplementation = "legacy" | "react";

export function uiImplementation(value: string | undefined): UiImplementation {
  if (value === undefined || value === "react") return "react";
  if (value === "legacy") return value;
  throw new Error(`Unknown AEGIS_UI_IMPL ${JSON.stringify(value)}. Use legacy or react.`);
}
