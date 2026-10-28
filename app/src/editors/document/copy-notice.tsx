import { useEffect, useSyncExternalStore } from "react";
import type { BoardId, CardId, CardProps, RichNode } from "@aegis/domain";
import type { FeatureWorkspace } from "../../composition.js";
import { createSource } from "../../workspace/source.js";

type Notice =
  | {
      readonly kind: "copied";
      readonly boardId: BoardId;
      readonly id: CardId;
      readonly before: Pick<CardProps, "doc" | "body" | "docTitleMigrated">;
      readonly after: RichNode;
    }
  | { readonly kind: "changed" }
  | null;
function createNotice() {
  const source = createSource<Notice>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    source.set(null);
  };
  return {
    source,
    clear,
    show: (notice: Notice) => {
      clear();
      source.set(notice);
      timer = setTimeout(clear, 8000);
    },
  };
}
const notices = new WeakMap<
  FeatureWorkspace,
  ReturnType<typeof createNotice>
>();
function noticeFor(workspace: FeatureWorkspace) {
  let notice = notices.get(workspace);
  if (!notice) {
    notice = createNotice();
    notices.set(workspace, notice);
  }
  return notice;
}

export function showDocumentCopy(
  workspace: FeatureWorkspace,
  notice: Exclude<Notice, { readonly kind: "changed" } | null>,
): void {
  noticeFor(workspace).show(notice);
}

export function DocumentCopyNotice({
  workspace,
}: {
  readonly workspace: FeatureWorkspace;
}) {
  const store = noticeFor(workspace),
    state = useSyncExternalStore(
      store.source.subscribe,
      store.source.getSnapshot,
    );
  const metadata = useSyncExternalStore(
    workspace.metadata.subscribe,
    workspace.metadata.getSnapshot,
  );
  useEffect(() => () => store.clear(), [store]);
  if (!state || (state.kind === "copied" && state.boardId !== metadata.id))
    return null;
  function undo(): void {
    if (state?.kind !== "copied") return;
    const card = workspace.card(state.id).getSnapshot();
    if (
      workspace.metadata.getSnapshot().id !== state.boardId ||
      JSON.stringify(card?.props?.doc) !== JSON.stringify(state.after)
    ) {
      store.show({ kind: "changed" });
      return;
    }
    const result = workspace.submit([
      {
        op: "update",
        id: state.id,
        set: {
          props: {
            doc: state.before.doc ?? null,
            body: state.before.body ?? null,
            docTitleMigrated: state.before.docTitleMigrated ?? null,
          },
        },
      },
    ]);
    if (result.kind === "applied") store.clear();
    else store.show({ kind: "changed" });
  }
  return (
    <div className="docs-copy-notice" role="status">
      {state.kind === "changed" ? (
        "The document changed after copying. Open it to review the changes."
      ) : (
        <>
          Cards copied into document.
          <button type="button" aria-label="Undo card copy" onClick={undo}>
            Undo
          </button>
        </>
      )}
    </div>
  );
}
