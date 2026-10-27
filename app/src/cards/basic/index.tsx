import type { CardBodyProps, CardRegistration } from "../../composition.js";
import { NoteBody } from "./Note.js";
import { TodoBody } from "./Todo.js";
import { ImageBody, LinkBody, VideoBody, WebBody } from "./Media.js";
import type { BasicServices } from "./Media.js";
import { FrameBody } from "./Frame.js";
import { CollectionBody } from "./Collection.js";
export { NoteBody } from "./Note.js";
export { TodoBody } from "./Todo.js";
export { ImageBody, VideoBody, LinkBody, WebBody } from "./Media.js";
export { FrameBody } from "./Frame.js";
export type { FrameServices } from "./Frame.js";
export { CollectionBody } from "./Collection.js";
export type { BasicServices } from "./Media.js";
export function basicRegistrations(
  services: BasicServices,
): readonly CardRegistration[] {
  const Image = (props: CardBodyProps) => (
    <ImageBody {...props} services={services} />
  );
  const Frame = (props: CardBodyProps) => (
    <FrameBody {...props} services={services} />
  );
  const Video = (props: CardBodyProps) => (
    <VideoBody {...props} services={services} />
  );
  return [
    { kind: "note", Body: NoteBody },
    { kind: "title", Body: NoteBody },
    { kind: "todo", Body: TodoBody },
    { kind: "link", Body: LinkBody },
    { kind: "image", Body: Image },
    { kind: "video", Body: Video },
    { kind: "web", Body: WebBody },
    { kind: "frame", Body: Frame },
    { kind: "coll", Body: CollectionBody },
  ];
}
