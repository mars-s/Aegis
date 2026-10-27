import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { BubbleMenuPlugin } from "@tiptap/extension-bubble-menu";
import { Editor } from "@tiptap/core";
import { AllSelection } from "@tiptap/pm/state";
import { z } from "zod/v4";
import {
  BoardIdSchema,
  CardIdSchema,
  CardSchema,
  RichNodeSchema,
} from "@aegis/domain/schema";
import type { Card, CardId, Source } from "@aegis/domain";
import {
  COPY_TYPES,
  documentUpdate,
  markdownHTML,
} from "@aegis/domain/content";
import { wordCount, wordCountLabel } from "@aegis/domain/words";
import type { CardBodyProps, FeatureWorkspace } from "../../composition.js";
import {
  findDocumentSession,
  getDocumentSession,
  sessionDocument,
} from "./session.js";
import { copiedContent, documentContent, tiptapContent } from "./content.js";
import { createExtensions } from "./extensions.js";
import { Choice, Disclosure } from "./controls.js";
import { Toolbar, useEditorState } from "./Toolbar.js";
import { useDocumentServices } from "./services.js";
import { downloadWord, printPDF } from "./export.js";
import { showDocumentCopy } from "./copy-notice.js";
import "./document.css";

const Clipboard = z.object({
  boardId: BoardIdSchema,
  ids: z.array(CardIdSchema),
});
const BoardClip = z.object({ cards: z.array(CardSchema) });
const clipboardType = "application/x-aegis-cards";
const PAGE_OPTIONS = [
  ["auto", "Auto page"],
  ["light", "Light page"],
  ["dark", "Dark page"],
] as const;
const PAPER_OPTIONS = [
  ["a4", "A4"],
  ["letter", "Letter"],
] as const;

function useSnapshot<T>(source: Source<T>): T {
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}

export function DocumentEditor({ cardId, workspace, engine }: CardBodyProps) {
  const services = useDocumentServices();
  const session = useMemo(
    () => getDocumentSession(workspace, cardId, engine, services.assetUrl),
    [workspace, cardId, engine, services.assetUrl],
  );
  const { editor } = session;
  const state = useSnapshot(session),
    saving = useSnapshot(workspace.saving),
    selection = useSnapshot(workspace.selection);
  useEditorState(editor);
  const body = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null);
  const [bubble] = useState(() => document.createElement("div"));
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const value = localStorage.getItem("aegis:doc-page");
    return value === "dark" || value === "light" ? value : "auto";
  });
  const [paper, setPaper] = useState<"a4" | "letter">(() =>
    localStorage.getItem("aegis:doc-paper") === "letter" ? "letter" : "a4",
  );
  const lifetime = useRef<AbortController | null>(null);
  const revision = useSnapshot(workspace.metadata).rev;
  const applicable = workspace.scene
    .snapshot()
    .cards.some(
      (card) =>
        card.id !== cardId &&
        selection.includes(card.id) &&
        COPY_TYPES.has(card.type),
    );
  const [copyLocation, setCopyLocation] = useState<HTMLElement | null>(null);
  const footerCopy = useRef<HTMLSpanElement>(null),
    menuCopy = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    setCopyLocation(applicable ? footerCopy.current : menuCopy.current);
  }, [applicable]);

  function close(): void {
    if (!session.flush()) return;
    if (services.context) services.context.closeEditor();
    else workspace.act({ kind: "edit-close" });
  }

  useEffect(() => {
    const scrollTarget = scroll.current;
    if (!body.current || !scrollTarget) return;
    const release = session.attach(body.current),
      controller = new AbortController();
    lifetime.current = controller;
    if (scroll.current) scroll.current.scrollTop = session.scroll.top;
    bubble.className = "docs-bubble";
    bubble.setAttribute("role", "toolbar");
    bubble.setAttribute("aria-label", "Selection formatting");
    editor.registerPlugin(
      BubbleMenuPlugin({
        pluginKey: "document-bubble",
        editor,
        element: bubble,
        appendTo: () =>
          body.current?.closest<HTMLElement>(".docs-panel") ?? document.body,
        updateDelay: 0,
        options: {
          placement: "top",
          offset: 8,
          flip: { boundary: scrollTarget },
          shift: { boundary: scrollTarget, crossAxis: true, padding: 8 },
          scrollTarget,
          onShow: () => {
            queueMicrotask(() => {
              if (!controller.signal.aborted) setBubbleOpen(true);
            });
          },
          onHide: () => {
            queueMicrotask(() => {
              if (!controller.signal.aborted) setBubbleOpen(false);
            });
          },
        },
        shouldShow: ({ state: current }) =>
          !current.selection.empty &&
          !!current.doc
            .textBetween(current.selection.from, current.selection.to)
            .trim() &&
          !editor.isActive("image"),
      }),
    );
    const visibility = () => {
      if (document.hidden) session.flush();
    };
    const save = () => {
      session.flush();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", save);
    if (!workspace.card(cardId).getSnapshot()?.props?.docTitleMigrated)
      session.flush();
    return () => {
      controller.abort();
      lifetime.current = null;
      if (scroll.current) session.scroll.top = scroll.current.scrollTop;
      editor.unregisterPlugin("document-bubble");
      release();
      bubble.remove();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", save);
    };
  }, [session, editor, bubble, workspace, cardId]);

  useEffect(() => {
    if (bubbleOpen && !editor.isDestroyed)
      editor.view.dispatch(
        editor.state.tr.setMeta("document-bubble", "updatePosition"),
      );
  }, [bubbleOpen, editor]);

  async function addImage(image: File, position?: number): Promise<void> {
    const signal = lifetime.current?.signal;
    if (!image.type.startsWith("image/") || !signal) return;
    try {
      if (image.size > 600000)
        throw new Error(
          "Choose an image smaller than 600 KB to fit the board document limit",
        );
      let source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Could not read image"));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(image);
      });
      if (!/^image\/(png|jpe?g|gif|bmp)$/.test(image.type)) {
        const picture = new Image();
        picture.src = source;
        await picture.decode();
        const canvas = document.createElement("canvas");
        canvas.width = picture.naturalWidth;
        canvas.height = picture.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not convert this image");
        context.drawImage(picture, 0, 0);
        source = canvas.toDataURL("image/png");
      }
      if (signal.aborted || editor.isDestroyed) return;
      if (JSON.stringify(editor.getJSON()).length + source.length > 950000)
        throw new Error("This image would exceed the board document limit");
      editor
        .chain()
        .focus()
        .insertContentAt(
          Math.min(
            position ?? editor.state.selection.to,
            editor.state.doc.content.size,
          ),
          { type: "image", attrs: { src: source, alt: image.name } },
        )
        .run();
    } catch (error) {
      if (!signal.aborted)
        setMessage(
          error instanceof Error ? error.message : "Could not add image",
        );
    }
  }

  useEffect(() => {
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        handleKeyDown: (view, event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "a" &&
            view.state.selection instanceof AllSelection
          )
            view.focus();
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "k"
          ) {
            event.preventDefault();
            openLink();
            return true;
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const data = event.clipboardData;
          if (!data) return false;
          for (const type of [clipboardType, "text/x-aegis"]) {
            const raw = data.getData(type);
            if (!raw) continue;
            try {
              const json: unknown = JSON.parse(raw);
              const cards =
                type === clipboardType
                  ? (() => {
                      const payload = Clipboard.parse(json);
                      return payload.boardId ===
                        workspace.metadata.getSnapshot().id
                        ? workspace.scene
                            .snapshot()
                            .cards.filter((card) =>
                              payload.ids.includes(card.id),
                            )
                        : [];
                    })()
                  : BoardClip.parse(json).cards;
              const content = copiedContent(cards, cardId);
              if (content.length) {
                editor
                  .chain()
                  .focus()
                  .insertContent(content.map(tiptapContent))
                  .run();
                event.preventDefault();
                return true;
              }
            } catch {
              /* Another clipboard format can still supply the content. */
            }
          }
          const images = [...data.files].filter((image) =>
            image.type.startsWith("image/"),
          );
          if (images.length) {
            event.preventDefault();
            for (const image of images) void addImage(image);
            return true;
          }
          const text = data.getData("text/plain");
          const markdown =
            /(^|\n)(#{1,3} |[-*>] |\d+\. |```|\$\$|---)|\*\*.+\*\*|\[.+\]\(.+\)|\$[^$\n]+\$/m.test(
              text,
            );
          if (
            !text ||
            (data.getData("text/html") && !markdown) ||
            editor.isActive("codeBlock")
          )
            return false;
          event.preventDefault();
          editor.chain().focus().insertContent(markdownHTML(text)).run();
          return true;
        },
        handleDrop: (view, event) => {
          const images = [...(event.dataTransfer?.files ?? [])].filter(
            (image) => image.type.startsWith("image/"),
          );
          if (!images.length) return false;
          event.preventDefault();
          const position = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos;
          for (const image of images) void addImage(image, position);
          return true;
        },
      },
    });
  }, [editor, workspace, cardId]);

  function openLink(): void {
    const href: unknown = editor.getAttributes("link").href;
    setLink(typeof href === "string" ? href : "");
  }

  async function rewrite(how: string): Promise<void> {
    if (busy) return;
    const signal = lifetime.current?.signal;
    if (!services.rewrite || !signal) {
      setMessage("Document rewriting needs an Aegis agent host adapter");
      return;
    }
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setMessage("Select some words to rewrite first");
      return;
    }
    const snapshot = editor.state.doc;
    setBusy(true);
    try {
      const text = await services.rewrite(
        {
          text: snapshot.textBetween(from, to, "\n"),
          how,
          title: session.title(),
          around: snapshot.textBetween(
            Math.max(0, from - 700),
            Math.min(snapshot.content.size, to + 700),
            "\n",
          ),
          boardId: workspace.metadata.getSnapshot().id,
          cardId,
        },
        signal,
      );
      if (signal.aborted || editor.isDestroyed) return;
      if (!editor.state.doc.eq(snapshot)) {
        setMessage("The document changed. Select the words and try again");
        return;
      }
      if (!text.trim()) throw new Error("The agent returned no text");
      editor
        .chain()
        .focus()
        .insertContentAt({ from, to }, { type: "text", text })
        .setTextSelection({ from, to: from + text.length })
        .run();
    } catch (error) {
      if (!signal.aborted)
        setMessage(
          error instanceof Error ? error.message : "Could not rewrite",
        );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  async function exportDocument(word: boolean): Promise<void> {
    if (exporting || !session.flush()) return;
    setExporting(true);
    setMessage(
      word
        ? "Preparing Word document…"
        : "Preparing print preview. Choose Save as PDF in the print dialogue.",
    );
    const signal = lifetime.current?.signal;
    try {
      const document = {
        json: sessionDocument(session),
        html: editor.getHTML(),
        title: session.title(),
        paper,
      };
      if (word) await downloadWord(document, services);
      else await printPDF(document, services.printHtml);
      const menu = body.current
        ?.closest(".docs-panel")
        ?.querySelector<HTMLDetailsElement>(".docs-more");
      if (menu) menu.open = false;
    } catch (error) {
      if (!signal?.aborted)
        setMessage(error instanceof Error ? error.message : "Could not export");
    } finally {
      if (!signal?.aborted) setExporting(false);
    }
  }

  function copySelected(): void {
    const cards = workspace.scene
      .snapshot()
      .cards.filter((card) => selection.includes(card.id));
    const content = copiedContent(cards, cardId);
    if (!content.length) {
      setMessage(
        "Select notes, headings, checklists, links or other text cards to copy",
      );
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt(
        editor.state.doc.content.size,
        content.map(tiptapContent),
      )
      .run();
    session.flush();
    setMessage("Cards copied into the document. Use Undo to restore.");
  }

  const saved =
    state.kind === "conflict"
      ? "Document changed elsewhere"
      : state.kind === "rejected"
        ? "Not saved"
        : state.kind === "dirty" || saving.kind === "saving"
          ? "Saving…"
          : saving.kind === "blocked"
            ? "Not saved"
            : "Saved";
  return (
    <section
      className="docs-panel document-editor"
      data-document-id={cardId}
      data-page={page}
      data-revision={revision}
      aria-label="Document editor"
      onFocusCapture={() => engine.pin(cardId, "focus", true)}
      onBlurCapture={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          engine.pin(cardId, "focus", false);
      }}
      onCompositionStart={() => session.setComposing(true)}
      onCompositionEnd={() => session.setComposing(false)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (
          event.target instanceof Element &&
          event.target.closest(".docs-math-source")
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (link !== null) {
          setLink(null);
          editor.view.focus();
        } else close();
      }}
    >
      <header className="side-editor-head docs-heading">
        <input
          className="docs-title"
          aria-label="Document title"
          placeholder="Untitled document"
          value={session.title()}
          onChange={(event) => session.setTitle(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              editor.commands.focus("start");
              editor.view.focus();
            }
          }}
        />
        <span className="side-editor-kind">Document</span>
        <span data-saved role="status">
          {saved}
        </span>
        <Disclosure label="Document options" name="docs-more">
          <div className="docs-page-options">
            <Choice
              label="Page colour"
              value={page}
              options={PAGE_OPTIONS}
              change={(value) => {
                if (value === "auto" || value === "light" || value === "dark") {
                  setPage(value);
                  localStorage.setItem("aegis:doc-page", value);
                }
              }}
            />
            <Choice
              label="Paper size"
              value={paper}
              options={PAPER_OPTIONS}
              change={(value) => {
                if (value === "a4" || value === "letter") {
                  setPaper(value);
                  localStorage.setItem("aegis:doc-paper", value);
                }
              }}
            />
          </div>
          <button
            type="button"
            data-pdf
            disabled={exporting}
            onClick={() => {
              void exportDocument(false);
            }}
          >
            Export PDF
          </button>
          <button
            type="button"
            data-word
            disabled={exporting}
            onClick={() => {
              void exportDocument(true);
            }}
          >
            Export Word
          </button>
          <span ref={menuCopy} />
        </Disclosure>
        {services.editorActions ? (
          <span className="side-editor-tools">{services.editorActions}</span>
        ) : null}
      </header>
      {state.kind === "conflict" ? (
        <div role="alert" className="docs-message">
          This document changed while you were writing. Your draft is retained.
          <button onClick={() => session.resolveConflict("local")}>
            Keep my draft
          </button>
          <button onClick={() => session.resolveConflict("remote")}>
            Use saved document
          </button>
        </div>
      ) : null}
      {state.kind === "rejected" ? (
        <div role="alert" className="docs-message">
          {state.reason}
          <button
            onClick={() => {
              session.flush();
            }}
          >
            Retry document save
          </button>
        </div>
      ) : null}
      {saving.kind === "blocked" ? (
        <div role="alert" className="docs-message">
          {saving.reason}
          <button onClick={workspace.retry}>Retry</button>
        </div>
      ) : null}
      <div
        className="office-ribbon docs-ribbon"
        role="toolbar"
        aria-label="Formatting"
      >
        <Toolbar
          editor={editor}
          board={workspace.scene.snapshot}
          editLink={openLink}
          image={() => file.current?.click()}
          rewrite={(how) => {
            void rewrite(how);
          }}
          busy={busy}
        />
      </div>
      <div
        ref={scroll}
        className="docs-scroll"
        onScroll={(event) => {
          session.scroll.top = event.currentTarget.scrollTop;
        }}
      >
        <article className="docs-paper">
          <div ref={body} className="docs-body" />
        </article>
      </div>
      <footer className="docs-footer">
        <button type="button" data-back onClick={close}>
          Back to board
        </button>
        <span data-count>
          {wordCountLabel(wordCount(sessionDocument(session)))}
        </span>
        <span className="docs-spacer" />
        <span ref={footerCopy} />
      </footer>
      {copyLocation
        ? createPortal(
            <button type="button" data-copy-cards onClick={copySelected}>
              Copy selected board cards
            </button>,
            copyLocation,
          )
        : null}
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const image = event.currentTarget.files?.[0];
          if (image) void addImage(image);
          event.currentTarget.value = "";
        }}
      />
      {message ? (
        <div className="docs-message" role="status">
          {message}
          <button type="button" onClick={() => setMessage("")}>
            Dismiss
          </button>
        </div>
      ) : null}
      {link !== null ? (
        <form
          className="docs-link-form aegis-surface"
          role="dialog"
          aria-label="Edit document link"
          onSubmit={(event) => {
            event.preventDefault();
            if (!/^(https?:|mailto:)/i.test(link)) {
              setMessage("Use an https, http or email link");
              return;
            }
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: link })
              .run();
            setLink(null);
          }}
        >
          <input
            aria-label="Link address"
            type="url"
            autoFocus
            value={link}
            onChange={(event) => setLink(event.currentTarget.value)}
          />
          <button type="submit">Apply link</button>
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              setLink(null);
            }}
          >
            Remove link
          </button>
          <button
            type="button"
            onClick={() => {
              if (/^(https?:|mailto:)/i.test(link)) {
                if (services.openUrl) services.openUrl(link);
                else window.open(link, "_blank", "noopener,noreferrer");
              }
            }}
          >
            Open link
          </button>
          <button
            type="button"
            onClick={() => {
              setLink(null);
              editor.view.focus();
            }}
          >
            Close link menu
          </button>
        </form>
      ) : null}
      {bubbleOpen
        ? createPortal(
            <Toolbar
              editor={editor}
              board={workspace.scene.snapshot}
              editLink={openLink}
              image={() => file.current?.click()}
              rewrite={(how) => {
                void rewrite(how);
              }}
              busy={busy}
              compact
            />,
            bubble,
          )
        : null}
    </section>
  );
}

export function copyCardsIntoDocument(
  workspace: FeatureWorkspace,
  destination: CardId,
  cards: readonly Card[],
  point?: { readonly x: number; readonly y: number },
): boolean {
  const target = workspace.record(destination).getSnapshot();
  if (!target || target.type !== "doc") return false;
  const content = copiedContent(cards, destination);
  if (!content.length) return false;
  const session = findDocumentSession(workspace, destination);
  if (session) {
    if (!session.flush()) return false;
    const position =
      point && session.attached()
        ? session.editor.view.posAtCoords({ left: point.x, top: point.y })?.pos
        : undefined;
    session.editor.commands.insertContentAt(
      position ?? session.editor.state.doc.content.size,
      content.map(tiptapContent),
    );
    if (!session.flush()) return false;
    const after = workspace.card(destination).getSnapshot()?.props?.doc;
    if (!session.attached() && after)
      showDocumentCopy(workspace, {
        kind: "copied",
        id: destination,
        boardId: workspace.metadata.getSnapshot().id,
        before: target.props ?? {},
        after,
      });
    return true;
  }
  const editor = new Editor({
    element: null,
    extensions: createExtensions(),
    content: tiptapContent(documentContent(target)),
  });
  try {
    editor.commands.insertContentAt(
      editor.state.doc.content.size,
      content.map(tiptapContent),
    );
    const after = RichNodeSchema.parse(editor.getJSON());
    const result = workspace.submit([documentUpdate(destination, after)]);
    if (result.kind !== "applied") return false;
    showDocumentCopy(workspace, {
      kind: "copied",
      id: destination,
      boardId: workspace.metadata.getSnapshot().id,
      before: target.props ?? {},
      after,
    });
    return true;
  } finally {
    editor.destroy();
  }
}

export function resolveDocumentDrop({
  workspace,
  cards,
  element,
  point,
}: {
  readonly workspace: FeatureWorkspace;
  readonly cards: readonly Card[];
  readonly element: HTMLElement | null;
  readonly point: { readonly x: number; readonly y: number };
}): { readonly highlight: HTMLElement; readonly run: () => boolean } | null {
  const target = element?.closest<HTMLElement>("[data-document-id]");
  const parsed = CardIdSchema.safeParse(target?.dataset.documentId);
  if (
    !target ||
    !parsed.success ||
    !cards.length ||
    cards.some((card) => card.id === parsed.data || !COPY_TYPES.has(card.type))
  )
    return null;
  return {
    highlight: target,
    run: () => copyCardsIntoDocument(workspace, parsed.data, cards, point),
  };
}

export function installDocumentClipboard(
  workspace: FeatureWorkspace,
): () => void {
  const copy = (event: ClipboardEvent) => {
    if (
      (event.target instanceof Element &&
        event.target.closest("input, textarea, [contenteditable]")) ||
      String(window.getSelection())
    )
      return;
    const selected = workspace.selection.getSnapshot(),
      board = workspace.scene.snapshot();
    const cards = board.cards.filter(
      (card) => selected.includes(card.id) && COPY_TYPES.has(card.type),
    );
    if (!cards.length || !event.clipboardData) return;
    event.clipboardData.setData(
      clipboardType,
      JSON.stringify({ boardId: board.id, ids: cards.map((card) => card.id) }),
    );
    event.clipboardData.setData(
      "text/plain",
      cards.map((card) => card.props?.body ?? card.text).join("\n\n"),
    );
    event.preventDefault();
  };
  document.addEventListener("copy", copy);
  return () => document.removeEventListener("copy", copy);
}
