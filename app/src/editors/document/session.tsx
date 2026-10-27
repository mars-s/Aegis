import { Editor } from "@tiptap/core";
import { RichNodeSchema } from "@aegis/domain/schema";
import type { CardId, RichNode, Source } from "@aegis/domain/schema";
import { documentUpdate } from "@aegis/domain/content";
import type { FeatureWorkspace, FeatureContext } from "../../composition.js";
import type { CanvasEngine } from "@aegis/scene";
import { documentContent, tiptapContent } from "./content.js";
import { createExtensions } from "./extensions.js";

export type SessionState =
  | { readonly kind: "ready"; readonly version: number }
  | { readonly kind: "dirty"; readonly version: number }
  | {
      readonly kind: "rejected";
      readonly version: number;
      readonly reason: string;
    }
  | { readonly kind: "conflict"; readonly version: number };

export interface DocumentSession extends Source<SessionState> {
  readonly editor: Editor;
  readonly attached: () => boolean;
  readonly title: () => string;
  readonly setTitle: (title: string) => void;
  readonly flush: () => boolean;
  readonly resolveConflict: (choice: "local" | "remote") => void;
  readonly attach: (element: HTMLElement) => () => void;
  readonly destroy: () => void;
  readonly scroll: { top: number };
}

interface Pool {
  readonly sessions: Map<CardId, DocumentSession>;
  readonly release: () => void;
}
const pools = new WeakMap<FeatureWorkspace, Pool>();

export function getDocumentSession(
  workspace: FeatureWorkspace,
  cardId: CardId,
  engine: CanvasEngine,
  assetUrl?: (source: string) => string,
): DocumentSession {
  let pool = pools.get(workspace);
  if (!pool) {
    const boardId = workspace.metadata.getSnapshot().id;
    const sessions = new Map<CardId, DocumentSession>();
    const unsubscribe = workspace.scene.subscribe((change) => {
      if (change.boardId !== boardId) {
        for (const session of sessions.values()) session.destroy();
        sessions.clear();
        unsubscribe();
        pools.delete(workspace);
      } else
        for (const id of change.removed) {
          sessions.get(id)?.destroy();
          sessions.delete(id);
        }
    });
    pool = { sessions, release: unsubscribe };
    pools.set(workspace, pool);
  }
  const existing = pool.sessions.get(cardId);
  if (existing) {
    pool.sessions.delete(cardId);
    pool.sessions.set(cardId, existing);
    return existing;
  }
  const session = createSession(workspace, cardId, engine, assetUrl);
  pool.sessions.set(cardId, session);
  // Closed, saved editors have no pending work. Bound the retained Undo/selection cache.
  for (const [id, cached] of pool.sessions) {
    if (pool.sessions.size <= 8) break;
    if (
      id !== cardId &&
      cached.getSnapshot().kind === "ready" &&
      !cached.attached()
    ) {
      cached.destroy();
      pool.sessions.delete(id);
    }
  }
  return session;
}

function createSession(
  workspace: FeatureWorkspace,
  cardId: CardId,
  engine: CanvasEngine,
  assetUrl?: (source: string) => string,
): DocumentSession {
  const initial = workspace.card(cardId).getSnapshot();
  if (!initial || initial.type !== "doc")
    throw new Error("This document is no longer available");
  let title = initial.text,
    baseDoc = JSON.stringify(initial.props?.doc),
    baseBody = initial.props?.body,
    baseTitle = initial.text;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let state: SessionState = { kind: "ready", version: 0 };
  const listeners = new Set<() => void>();
  let destroyed = false,
    submitting = false,
    mounted = false;
  const publish = (next: SessionState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const schedule = () => {
    if (destroyed) return;
    engine.pin(cardId, "dirty", true);
    publish({
      kind: state.kind === "conflict" ? "conflict" : "dirty",
      version: state.version + 1,
    });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, 350);
  };
  const editor = new Editor({
    element: null,
    extensions: createExtensions(assetUrl),
    content: tiptapContent(documentContent(initial)),
    editorProps: {
      attributes: {
        class: "docs-prose",
        spellcheck: "true",
        "aria-label": "Document content",
      },
    },
    onUpdate: schedule,
  });
  let baseEditorDoc = JSON.stringify(editor.getJSON());

  function flush(): boolean {
    if (timer) clearTimeout(timer);
    timer = null;
    if (destroyed) return true;
    if (mounted)
      editor.view.dom
        .querySelector<
          HTMLInputElement | HTMLTextAreaElement
        >(".docs-math-source")
        ?.blur();
    if (state.kind === "conflict") return false;
    const latest = workspace.card(cardId).getSnapshot();
    if (!latest) {
      engine.pin(cardId, "dirty", false);
      return true;
    }
    const json = RichNodeSchema.parse(editor.getJSON());
    if (
      JSON.stringify(json) === baseEditorDoc &&
      title === baseTitle &&
      latest.props?.docTitleMigrated
    ) {
      engine.pin(cardId, "dirty", false);
      publish({ kind: "ready", version: state.version });
      return true;
    }
    const update = documentUpdate(cardId, json);
    submitting = true;
    const result = workspace.submit([
      { ...update, set: { ...update.set, text: title } },
    ]);
    submitting = false;
    if (result.kind === "rejected") {
      engine.pin(cardId, "dirty", true);
      publish({
        kind: "rejected",
        version: state.version,
        reason: result.errors.map((error) => error.reason).join(". "),
      });
      return false;
    }
    baseDoc = JSON.stringify(json);
    baseEditorDoc = baseDoc;
    baseTitle = title;
    baseBody = workspace.card(cardId).getSnapshot()?.props?.body;
    engine.pin(cardId, "dirty", false);
    publish({ kind: "ready", version: state.version });
    return true;
  }

  const unsubscribe = workspace.card(cardId).subscribe(() => {
    if (submitting || destroyed) return;
    const card = workspace.card(cardId).getSnapshot();
    if (!card || card.type !== "doc") return;
    if (
      JSON.stringify(card.props?.doc) === baseDoc &&
      card.props?.body === baseBody &&
      card.text === baseTitle
    )
      return;
    if (state.kind !== "ready") {
      if (timer) clearTimeout(timer);
      timer = null;
      publish({ kind: "conflict", version: state.version });
      return;
    }
    title = card.text;
    baseTitle = title;
    baseDoc = JSON.stringify(card.props?.doc);
    baseBody = card.props?.body;
    editor.commands.setContent(tiptapContent(documentContent(card)), {
      emitUpdate: false,
    });
    baseEditorDoc = JSON.stringify(editor.getJSON());
    publish({ kind: "ready", version: state.version + 1 });
  });

  return {
    editor,
    attached: () => mounted,
    title: () => title,
    setTitle: (value) => {
      if (title !== value) {
        title = value;
        schedule();
      }
    },
    flush,
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    scroll: { top: 0 },
    resolveConflict(choice) {
      if (choice === "local") {
        publish({ kind: "dirty", version: state.version });
        flush();
        return;
      }
      const card = workspace.card(cardId).getSnapshot();
      if (!card) return;
      title = card.text;
      baseTitle = title;
      baseDoc = JSON.stringify(card.props?.doc);
      baseBody = card.props?.body;
      editor.commands.setContent(tiptapContent(documentContent(card)), {
        emitUpdate: false,
      });
      baseEditorDoc = JSON.stringify(editor.getJSON());
      engine.pin(cardId, "dirty", false);
      publish({ kind: "ready", version: state.version + 1 });
    },
    attach(element) {
      if (mounted) throw new Error("This document already has an editing view");
      editor.mount(element);
      mounted = true;
      return () => {
        flush();
        mounted = false;
        editor.unmount();
        engine.pin(cardId, "focus", false);
        engine.pin(cardId, "ime", false);
      };
    },
    destroy() {
      if (destroyed) return;
      if (timer) clearTimeout(timer);
      unsubscribe();
      listeners.clear();
      destroyed = true;
      editor.destroy();
      engine.pin(cardId, "dirty", false);
      engine.pin(cardId, "focus", false);
      engine.pin(cardId, "ime", false);
    },
  };
}

export function flushDocument(context: FeatureContext, id: CardId): boolean {
  return pools.get(context.workspace)?.sessions.get(id)?.flush() ?? true;
}

export function findDocumentSession(
  workspace: FeatureWorkspace,
  id: CardId,
): DocumentSession | undefined {
  return pools.get(workspace)?.sessions.get(id);
}

export function disposeDocumentSessions(workspace: FeatureWorkspace): boolean {
  const pool = pools.get(workspace);
  if (!pool) return true;
  for (const session of pool.sessions.values())
    if (!session.flush()) return false;
  for (const session of pool.sessions.values()) session.destroy();
  pool.release();
  pools.delete(workspace);
  return true;
}

export function sessionDocument(session: DocumentSession): RichNode {
  return RichNodeSchema.parse(session.editor.getJSON());
}
