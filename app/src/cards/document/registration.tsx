import { DocumentBody } from "./DocumentBody.js";
import { DocumentEditor, flushDocument } from "../../editors/document/index.js";
import type {
  ActionRegistration,
  CardRegistration,
  EditorRegistration,
} from "../../composition.js";

export const documentCard = {
  kind: "doc",
  Body: DocumentBody,
} satisfies CardRegistration;
export const documentEditor = {
  kind: "doc",
  Body: DocumentEditor,
  flush: flushDocument,
} satisfies EditorRegistration;
export const documentOpenAction = {
  id: "doc-open",
  label: "Open document",
  shortcut: "Enter",
  run(context) {
    const ids = context.workspace.selection.getSnapshot(),
      id = ids[0];
    if (
      ids.length === 1 &&
      id &&
      context.workspace.card(id).getSnapshot()?.type === "doc"
    )
      context.openEditor(id);
  },
} satisfies ActionRegistration;
export const documentTool = {
  id: "doc",
  label: "Doc",
  shortcut: "d",
  run(context) {
    const camera = context.engine()?.camera() ?? { x: 0, y: 0, zoom: 1 };
    const result = context.workspace.submit([
      {
        op: "create",
        type: "doc",
        text: "",
        x: (innerWidth / 2 - camera.x) / camera.zoom - 380,
        y: (innerHeight / 3 - camera.y) / camera.zoom - 60,
        w: 760,
        h: 540,
        props: {
          doc: { type: "doc", content: [{ type: "paragraph" }] },
          body: "",
        },
      },
    ]);
    if (result.kind === "applied" && result.ids[0]) {
      context.workspace.act({ kind: "select", ids: [result.ids[0]] });
      context.openEditor(result.ids[0]);
    }
  },
} satisfies ActionRegistration;
