import { OBJECT_KINDS } from "@aegis/domain/objects";
import type {
  CardBodyProps,
  CardRegistration,
  EditorRegistration,
} from "../../composition.js";
import { ObjectView } from "./ObjectBody.js";
import type { ObjectServices } from "./services.js";
import { flushObject } from "../../editors/object/session.js";
export type { ObjectServices, SandboxRegistration } from "./services.js";
export { ObjectView } from "./ObjectBody.js";
export { flushObject } from "../../editors/object/session.js";
export { objectNames } from "./model.js";
export function objectRegistrations(services: ObjectServices): {
  readonly cards: readonly CardRegistration[];
  readonly editors: readonly EditorRegistration[];
} {
  const Body = (props: CardBodyProps) => (
    <ObjectView {...props} services={services} />
  );
  const Editor = (props: CardBodyProps) => (
    <ObjectView {...props} services={services} expanded />
  );
  const kinds = OBJECT_KINDS.filter(
    (kind) => kind !== "plot" && kind !== "sheet",
  );
  return {
    cards: kinds.map((kind) => ({ kind: `object:${kind}`, Body })),
    editors: kinds.map((kind) => ({
      kind: `object:${kind}`,
      Body: Editor,
      flush: flushObject,
    })),
  };
}
