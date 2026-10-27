import { z } from "zod/v4";

const LayoutSchema = z.object({
  width: z.number().min(200).max(420).catch(300),
  rightWidth: z.number().min(200).max(420).catch(320),
  columns: z
    .object({ left: z.array(z.string()), right: z.array(z.string()) })
    .catch({ left: ["layers", "library", "tools"], right: [] }),
  off: z.record(z.string(), z.boolean()).catch({}),
  folded: z.record(z.string(), z.boolean()).catch({ keys: true, tools: true }),
  heights: z.record(z.string(), z.number().min(48).max(2000)).catch({}),
  open: z
    .object({ left: z.boolean(), right: z.boolean() })
    .catch({ left: false, right: false }),
});
export type PanelLayout = z.output<typeof LayoutSchema>;
const SavedLayoutSchema = LayoutSchema.extend({
  hidden: z.boolean().optional(),
  order: z.array(z.string()).optional(),
  columns: LayoutSchema.shape.columns.optional(),
  open: LayoutSchema.shape.open.optional(),
});
export function normaliseLayout(layout: PanelLayout): PanelLayout {
  return {
    ...layout,
    columns: {
      left: [
        ...(layout.columns.right.includes("layers")
          ? []
          : layout.columns.left.includes("layers")
            ? ["layers"]
            : []),
        "library",
        "tools",
        ...layout.columns.left.filter(
          (id) => !["layers", "library", "tools"].includes(id),
        ),
      ],
      right: layout.columns.right.filter(
        (id) => !["library", "tools"].includes(id),
      ),
    },
  };
}
export function readLayout(): PanelLayout {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("aegis:panels") || "{}",
    );
    const saved = SavedLayoutSchema.parse(value);
    const parsed = LayoutSchema.parse({
      ...saved,
      columns: saved.columns ?? {
        left: saved.order ?? ["layers", "library", "tools"],
        right: [],
      },
      open: saved.open ?? { left: saved.hidden === false, right: false },
    });
    return normaliseLayout({
      ...parsed,
      columns: {
        left: [
          ...(parsed.columns.right.includes("layers") ? [] : ["layers"]),
          "library",
          "tools",
          ...parsed.columns.left.filter(
            (id) =>
              !["layers", "library", "tools"].includes(id) &&
              (id !== "keys" || parsed.columns.left.includes("tools")),
          ),
        ],
        right: parsed.columns.right.filter(
          (id) => !["library", "tools"].includes(id),
        ),
      },
    });
  } catch {
    return LayoutSchema.parse({});
  }
}
export function saveLayout(layout: PanelLayout): void {
  localStorage.setItem("aegis:panels", JSON.stringify(layout));
  window.dispatchEvent(new Event("aegis:panels-changed"));
}
export function resetLayout(): void {
  saveLayout(LayoutSchema.parse({ open: { left: true, right: false } }));
}
