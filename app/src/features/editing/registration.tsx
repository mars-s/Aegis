import { BoardSchema, CardIdSchema, CardSchema } from "@aegis/domain";
import type { Command, JsonValue } from "@aegis/domain";
import type { ActionRegistration, FeatureContext } from "../../composition.js";
import {
  arrange,
  bounds,
  effectiveFlag,
  makeClip,
  stackCommands,
} from "./operations.js";
import type { Arrange } from "./operations.js";
import {
  copySelection,
  duplicateSelection,
  pasteSelection,
} from "./clipboard.js";
import { deleteSelection } from "./delete-operations.js";
import { collectionLayout } from "./collection-operations.js";

export function setSelection(
  context: FeatureContext,
  set: { readonly [key: string]: JsonValue },
) {
  const board = context.workspace.scene.snapshot(),
    selected = new Set(context.workspace.selection.getSnapshot());
  const commands = board.cards
    .filter(
      (card) => selected.has(card.id) && !effectiveFlag(board, card, "locked"),
    )
    .map((card) => ({ op: "update", id: card.id, set }) satisfies Command);
  if (commands.length) context.workspace.submit(commands);
}
export function arrangeSelection(context: FeatureContext, how: Arrange) {
  context.workspace.submit(
    arrange(
      context.workspace.scene.snapshot(),
      context.workspace.selection.getSnapshot(),
      how,
    ),
  );
}
export function collectSelection(context: FeatureContext) {
  const board = context.workspace.scene.snapshot(),
    clip = makeClip(board, context.workspace.selection.getSnapshot());
  if (!clip.cards.length) return;
  const box = bounds(clip.cards),
    id = CardIdSchema.parse(
      crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    );
  const coll = CardSchema.parse({
    id,
    type: "coll",
    text: "Collection",
    color: "plain",
    x: box.x - 12,
    y: box.y - 46,
    w: Math.max(244, box.right - box.x + 24),
    h: 100,
    props: { kids: clip.cards.map((card) => card.id) },
  });
  context.workspace.submit([
    {
      op: "create",
      newId: id,
      type: "coll",
      text: coll.text,
      x: coll.x,
      y: coll.y,
      w: coll.w,
      h: coll.h,
    },
    ...collectionLayout(
      BoardSchema.parse({ ...board, cards: [...board.cards, coll] }),
      coll,
      clip.cards.map((card) => card.id),
    ),
  ]);
  context.workspace.act({ kind: "select", ids: [id] });
}
export const editingMenus: readonly ActionRegistration[] = [
  {
    id: "copy",
    label: "Copy",
    shortcut: "mod+c",
    run: (context) => {
      void copySelection(context);
    },
  },
  {
    id: "paste",
    label: "Paste",
    shortcut: "mod+v",
    run: (context) => {
      pasteSelection(context);
    },
  },
  {
    id: "duplicate",
    label: "Duplicate",
    shortcut: "mod+d",
    run: (context) => {
      duplicateSelection(context);
    },
  },
  {
    id: "delete",
    label: "Delete",
    shortcut: "Backspace",
    run: (context) => {
      deleteSelection(context);
    },
  },
  {
    id: "bold",
    label: "Bold",
    shortcut: "mod+b",
    run: (context) => {
      const id = context.workspace.selection.getSnapshot()[0],
        card = id ? context.workspace.record(id).getSnapshot() : null;
      setSelection(context, { props: { bold: !card?.props?.bold } });
    },
  },
  {
    id: "italic",
    label: "Italic",
    shortcut: "mod+i",
    run: (context) => {
      const id = context.workspace.selection.getSnapshot()[0],
        card = id ? context.workspace.record(id).getSnapshot() : null;
      setSelection(context, { props: { italic: !card?.props?.italic } });
    },
  },
  {
    id: "group",
    label: "Group",
    shortcut: "mod+g",
    run: (context) => setSelection(context, { group: crypto.randomUUID() }),
  },
  {
    id: "ungroup",
    label: "Ungroup",
    shortcut: "mod+shift+g",
    run: (context) => setSelection(context, { group: "" }),
  },
  { id: "collect", label: "Put in collection", run: collectSelection },
  {
    id: "front",
    label: "Bring to front",
    shortcut: "alt+mod+]",
    run: (context) => {
      context.workspace.submit(
        stackCommands(
          context.workspace.scene.snapshot(),
          context.workspace.selection.getSnapshot(),
          "front",
        ),
      );
    },
  },
  {
    id: "back",
    label: "Send to back",
    shortcut: "alt+mod+[",
    run: (context) => {
      context.workspace.submit(
        stackCommands(
          context.workspace.scene.snapshot(),
          context.workspace.selection.getSnapshot(),
          "back",
        ),
      );
    },
  },
];
export {
  copySelection,
  duplicateSelection,
  pasteSelection,
} from "./clipboard.js";
export { deleteSelection, restoreDeleted } from "./delete-operations.js";
export {
  arrange,
  bounds,
  descendants,
  effectiveFlag,
  lineHeightDefault,
  makeClip,
  cloneCommands,
  snapRotation,
  stackCommands,
  toolbarOrder,
} from "./operations.js";
export { collectionDrop, collectionLayout } from "./collection-operations.js";
export { layerParents, layerDescendants } from "./layers.js";
export { parseCapture } from "./capture.js";

export { exportBoard, imagePdf, prepareExportCard } from "./board-export.js";
export type { ExportServices, ExportContext } from "./board-export.js";
export { createExportRenderer } from "./export-view.js";
export { drawGridMotif, gridShapes } from "./grid-motifs.js";
export {
  writingFont,
  writingFonts,
  fontName,
  fontFamily,
} from "./writing-fonts-model.js";
