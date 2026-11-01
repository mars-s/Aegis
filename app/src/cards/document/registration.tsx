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
