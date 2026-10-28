// Library navigation ported from Mochiboard, MIT. See LICENSE.mochiboard.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod/v4";
import type { BoardId } from "@aegis/domain";
import { useSource } from "../workspace/index.js";
import { confirmAction } from "../lib/ui/confirm.js";
import { createMenu } from "../lib/ui/menu.js";
import { BoardPreview } from "./BoardPreview.js";
import { Icon, MenuButton } from "./controls.js";
import { ancestors, libraryItems, scopeRoot } from "./library-model.js";
import type {
  LibraryItem,
  LibraryService,
  LibrarySnapshot,
} from "./library-model.js";
import type { Notify } from "./actions.js";

function readExpanded(): ReadonlySet<string> {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem("aegis:lib-open") || "[]",
    );
    return new Set(z.array(z.string()).parse(raw));
  } catch {
    return new Set();
  }
}

export function Library({
  service,
  current,
  notify,
}: {
  readonly service: LibraryService;
  readonly current: BoardId;
  readonly notify: Notify;
}) {
  const data = useSource(service.source),
    items = useMemo(() => libraryItems(data), [data]);
  const [expanded, setExpanded] = useState(readExpanded),
    [target, setTarget] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState("");
  const [home, setHome] = useState<{ readonly at: string | null } | null>(null),
    [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    homeButton = useRef<HTMLButtonElement>(null),
    operations = useRef<Promise<void>>(Promise.resolve()),
    editingId = useRef<string | null>(null);
  const life = useRef<AbortController | null>(null);
  const tree = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null),
    coverFor = useRef<string | null>(null);
  const [actions, setActions] = useState<Element | null>(null);
  const currentPath = useRef("");
  const contextMenu = useRef<ReturnType<typeof createMenu> | null>(null);
  useEffect(() => () => contextMenu.current?.destroy(), []);
  useEffect(() => {
    if (!home || !editing) return;
    const field = dialog.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(editing)}"] strong[contenteditable]`);
    if (field) { field.focus(); const range = document.createRange(); range.selectNodeContents(field); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
  }, [editing, home]);
  const chain = useMemo(() => ancestors(data, current), [data, current]);
  useEffect(() => {
    setActions(
      tree.current
        ?.closest("[data-panel=library]")
        ?.querySelector("[data-actions=library]") ?? null,
    );
  }, []);
  useEffect(() => {
    const lifetime = new AbortController();
    life.current = lifetime;
    const refresh = () => {
      void service.refresh(lifetime.signal).catch((cause) => {
        if (!lifetime.signal.aborted)
          notify({
            text:
              cause instanceof Error
                ? cause.message
                : "Could not refresh Library.",
          });
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      lifetime.abort();
      life.current = null;
      window.removeEventListener("focus", refresh);
    };
  }, [service, notify]);
  useEffect(() => {
    const signature = JSON.stringify([
      current,
      ...chain.map((item) => item.id),
    ]);
    if (signature === currentPath.current) return;
    currentPath.current = signature;
    setExpanded((previous) => {
      const next = new Set(previous);
      chain.forEach((item) => next.add(item.id));
      return next;
    });
    setTarget(
      data.boards.find((board) => board.id === current)?.parent ?? null,
    );
  }, [current, chain, data.boards]);
  useEffect(() => {
    localStorage.setItem("aegis:lib-open", JSON.stringify([...expanded]));
  }, [expanded]);
  useEffect(() => {
    if (home) {
      dialog.current?.showModal();
      dialog.current?.querySelector("input")?.focus();
    }
  }, [home !== null]);
  async function run(action: () => Promise<unknown>): Promise<void> {
    const lifetime = life.current;
    const operation = operations.current.then(async () => {
      if (!lifetime || lifetime.signal.aborted) return;
      try {
        await action();
        if (!lifetime.signal.aborted) await service.refresh(lifetime.signal);
      } catch (cause) {
        if (!lifetime.signal.aborted)
          notify({
            text:
              cause instanceof Error
                ? cause.message
                : "Could not update Library.",
          });
      }
    });
    operations.current = operation;
    await operation;
  }
  function toggle(id: string): void {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function closeHome(): void {
    dialog.current?.close();
    setHome(null);
    setQuery("");
    homeButton.current?.focus();
  }
  function rename(item: LibraryItem): void {
    editingId.current = item.id;
    setEditing(item.id);
    setName(item.name);
  }
  function finish(item: LibraryItem, keep: boolean): void {
    if (editingId.current !== item.id) return;
    editingId.current = null;
    setEditing(null);
    if (keep && name.trim() && name.trim() !== item.name)
      void run(() => service.rename(item, name.trim()));
  }
  function covers(item: LibraryItem) {
    return item.item === 'node' && item.kind === 'project' ? [
      { title: 'Choose an image…', run: () => { coverFor.current = item.id; file.current?.click(); } },
      { title: 'Use the first board', run: () => { void run(() => service.cover(item.id, null)); } },
    ] : [];
  }
  function menu(item: LibraryItem) {
    const descendants = new Set(
      items
        .filter((candidate) =>
          ancestors(data, candidate.id).some((parent) => parent.id === item.id),
        )
        .map((candidate) => candidate.id),
    );
    return [
      ...covers(item),
      { title: "Rename", run: () => rename(item) },
      {
        title: "Move to…",
        items: [
          {
            title:
              item.item === "board"
                ? "Loose boards"
                : "All projects (top level)",
            run: () => {
              void run(() => service.move(item, { kind: "folder", id: null }));
            },
          },
          ...items
            .filter(
              (candidate) =>
                candidate.id !== item.id &&
                !descendants.has(candidate.id) &&
                (item.item === "board" || candidate.item === "node"),
            )
            .map((candidate) => ({
              title:
                candidate.item === "board"
                  ? `Inside board: ${candidate.name}`
                  : [
                      ...ancestors(data, candidate.id).map(
                        (parent) => parent.name,
                      ),
                      candidate.name,
                    ].join(" / "),
              run: () => {
                void run(() =>
                  service.move(
                    item,
                    candidate.item === "board"
                      ? { kind: "board", id: candidate.id }
                      : { kind: "folder", id: candidate.id },
                  ),
                );
              },
            })),
        ],
      },
      {
        title: "Duplicate",
        run: () => {
          void run(() => service.duplicate(item));
        },
      },
      {
        title: "Delete",
        run: () => {
          void (async () => {
            if (
              !(await confirmAction({
                title: `Delete "${item.name}"?`,
                body: `${descendants.size ? "Everything inside it goes too. " : ""}You can Undo for 8 seconds.`,
                confirm: item.item === "board" ? "Delete board" : "Delete",
              }))
            )
              return;
            await run(async () => {
              const removal = await service.remove(item);
              notify({
                text: `Deleted "${item.name}"`,
                action: {
                  label: "Undo",
                  run: () => {
                    void run(removal.undo);
                  },
                },
              });
            });
          })();
        },
      },
    ];
  }
  const root = home
    ? home?.at
      ? scopeRoot(data, home?.at)
      : undefined
    : chain.find((item) => item.item === "node");
  const rows: { readonly item: LibraryItem; readonly depth: number }[] = [];
  const seen = new Set<string>();
  function append(item: LibraryItem, depth: number): void {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    rows.push({ item, depth });
    if (expanded.has(item.id))
      for (const child of items
        .filter(
          (candidate) =>
            (candidate.item === "board"
              ? (candidate.boardParent ?? candidate.parent)
              : candidate.parent) === item.id,
        )
        .sort((a, b) => a.name.localeCompare(b.name)))
        append(child, depth + 1);
  }
  if (root) {
    const item = items.find((candidate) => candidate.id === root.id);
    if (item) append(item, 0);
  } else
    items
      .filter(
        (item) =>
          !(item.item === "board"
            ? (item.boardParent ?? item.parent)
            : item.parent),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((item) => append(item, 0));
  function title(item: LibraryItem) {
    return editing === item.id && !home ? (
      <input
        className="name"
        aria-label={`${item.name} name`}
        value={name}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={() => finish(item, true)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            finish(item, event.key === "Enter");
          }
        }}
      />
    ) : (
      <span
        className="name"
        title={item.name}
        onDoubleClick={() => rename(item)}
      >
        {item.name}
      </span>
    );
  }
  const parentOf = (item: LibraryItem): string | null =>
    item.item === "board" ? (item.boardParent ?? item.parent) : item.parent;
  const withChildren = new Set(items.map(parentOf).filter((id): id is string => !!id));
  function create(kind: "board" | "folder" | "project"): void {
    void run(async () => {
      const id = await service.create(kind, kind === "project" ? null : target);
      if (kind !== "board") {
        setTarget(id);
        setExpanded((previous) => new Set([...previous, id]));
      }
    });
  }
  const actionControls = (
    <>
      <button
        ref={homeButton}
        type="button"
        className="icon-btn"
        aria-label="Home"
        title="All projects"
        onClick={() => setHome({ at: null })}
      >
        <Icon name="templates" />
      </button>
      <MenuButton
        className="icon-btn"
        label="New in library"
        items={(["board", "folder", "project"] as const).map((kind) => ({
          title: `New ${kind}`,
          run: () => create(kind),
        }))}
      >
        <Icon name="plus" />
      </MenuButton>
    </>
  );
  return (
    <>
      <input
        ref={file}
        type="file"
        accept="image/*"
        data-cover-file
        hidden
        onChange={(event) => {
          const imageFile = event.currentTarget.files?.[0],
            id = coverFor.current;
          event.currentTarget.value = "";
          if (!imageFile || !id) return;
          void run(async () => {
            const url = URL.createObjectURL(imageFile);
            try {
              const image = new Image();
              image.src = url;
              await image.decode();
              const canvas = document.createElement("canvas");
              canvas.width = 720;
              canvas.height = 360;
              const drawing = canvas.getContext("2d");
              if (!drawing)
                throw new Error("Could not prepare the project cover.");
              const scale = Math.max(
                720 / image.naturalWidth,
                360 / image.naturalHeight,
              );
              const width = image.naturalWidth * scale,
                height = image.naturalHeight * scale;
              drawing.drawImage(
                image,
                (720 - width) / 2,
                (360 - height) / 2,
                width,
                height,
              );
              await service.cover(id, canvas.toDataURL("image/jpeg", 0.82));
            } finally {
              URL.revokeObjectURL(url);
            }
          });
        }}
      />
      {actions ? createPortal(actionControls, actions) : <div className="library-actions">{actionControls}</div>}
      <div ref={tree} className="tree" role="tree" aria-label="Library">
        {rows.map(({ item, depth }) => (
          <div
            key={item.id}
            className={`tree-row ${item.item === "board" ? "board" : item.kind}${item.id === current ? " on" : ""}`}
            role="treeitem"
            aria-label={item.name}
            aria-level={depth + 1}
            aria-selected={item.id === current}
            tabIndex={0}
            {...(item.item === "board"
              ? { "data-board": item.id }
              : { "data-node": item.id })}
            {...(withChildren.has(item.id)
              ? { "aria-expanded": expanded.has(item.id) }
              : {})}
            style={{ paddingLeft: depth * 16 + 10 }}
            draggable={editing !== item.id}
            onClick={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest("button, input")
              )
                return;
              if (item.item === "board") void run(() => service.open(item.id));
              else {
                setTarget(item.id);
                toggle(item.id);
              }
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter") {
                event.preventDefault();
                if (item.item === "board")
                  void run(() => service.open(item.id));
                else toggle(item.id);
              }
              if (
                (event.key === "ArrowLeft" && expanded.has(item.id)) ||
                (event.key === "ArrowRight" && !expanded.has(item.id))
              ) {
                event.preventDefault();
                toggle(item.id);
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault(); contextMenu.current?.destroy();
              const menuControl = createMenu({ items: menu(item) }); contextMenu.current = menuControl;
              menuControl.open(event.nativeEvent, { x: event.clientX, y: event.clientY });
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/x-aegis-lib", item.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("application/x-aegis-lib"))
                event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData("application/x-aegis-lib"),
                source = items.find((candidate) => candidate.id === id);
              if (source && source.id !== item.id)
                void run(() =>
                  service.move(
                    source,
                    item.item === "board"
                      ? { kind: "board", id: item.id }
                      : { kind: "folder", id: item.id },
                  ),
                );
            }}
          >
            <button
              className="twisty"
              aria-label={`${expanded.has(item.id) ? "Collapse" : "Expand"} ${item.name}`}
              onClick={() => toggle(item.id)}
            >
              <Icon name="right" />
            </button>
            <span className="glyph"><Icon name="window" /><i aria-hidden="true" /></span>
            {title(item)}
            <MenuButton
              className="row-more icon-btn"
              menuClass="ctx-menu"
              label={`More actions for ${item.name}`}
              items={() => menu(item)}
            >
              <Icon name="more" />
            </MenuButton>
          </div>
        ))}
      </div>
      {(
        <dialog
          ref={dialog}
          className="library-home aegis-dialog"
          aria-label="All projects"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              event.preventDefault();
              event.stopPropagation();
              closeHome();
            }
          }}
          onCancel={(event) => {
            event.preventDefault();
            closeHome();
          }}
        >
          <nav>
            <button
              onClick={() => {
                const parent = home?.at
                  ? data.nodes.find((node) => node.id === home?.at)?.parent
                  : null;
                setHome({ at: parent ?? null });
              }}
            >
              Back
            </button>
            <button onClick={() => setHome({ at: null })}>All projects</button>
            {home?.at
              ? ancestors(data, home?.at).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setHome({ at: item.id })}
                  >
                    {item.name}
                  </button>
                ))
              : null}
            <button onClick={closeHome}>Back to board</button>
          </nav>
          <div className="home-heading">
            <h1>
              {data.nodes.find((node) => node.id === home?.at)?.name ??
                "All projects"}
            </h1>
            <input
              type="search"
              aria-label="Search library"
              placeholder="Search library"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <MenuButton
              label="New in library"
              triggerLabel="New"
              items={(["board", "folder", "project"] as const).map((kind) => ({
                title: `${kind[0]?.toUpperCase()}${kind.slice(1)}`,
                run: () => {
                  void run(async () => {
                    const id = await service.create(kind, kind === "project" ? null : home?.at ?? null);
                    if (kind === "board") { closeHome(); return; }
                    if (kind === "project") setHome({ at: null });
                    setQuery("");
                    const item = libraryItems(service.source.getSnapshot()).find(candidate => candidate.id === id);
                    if (item) rename(item);
                  });
                },
              }))}
            >
              New
            </MenuButton>
          </div>
          <div className="home-grid">
            {homeItems(data, home?.at ?? null, query).map((item) => (
              <article
                className="home-tile"
                key={item.id}
                data-item={item.id}
                {...(item.item === "board"
                  ? { "data-board": item.id, "data-open": item.id }
                  : { "data-into": item.id })}
                onClick={(event) => {
                  if (event.target instanceof Element && event.target.closest('button,input,[contenteditable]')) return;
                  if (item.item === "board") void run(async () => { if (await service.open(item.id)) closeHome(); });
                  else setHome({ at: item.id });
                }}
                onContextMenu={(event) => {
                  event.preventDefault(); contextMenu.current?.destroy();
                  const control = createMenu({ items: menu(item) }); contextMenu.current = control;
                  control.open(event.nativeEvent, { x: event.clientX, y: event.clientY });
                }}
              >
                <button
                  className="home-preview"
                  data-cover={
                    item.item === "node" && item.kind === "project"
                      ? item.id
                      : undefined
                  }
                  onClick={() => {
                    if (item.item === "board")
                      void run(async () => {
                        if (await service.open(item.id)) closeHome();
                      });
                    else setHome({ at: item.id });
                  }}
                >
                  {item.item === "board" ? (
                    <BoardPreview service={service} board={item.id} />
                  ) : item.cover ? (
                    <img alt="Project cover" src={item.cover} loading="lazy" />
                  ) : (
                    (() => {
                      const first = data.boards.find(board => ancestors(data, board.id).some(parent => parent.id === item.id));
                      return first ? <BoardPreview service={service} board={first.id} /> : <Icon name="window" />;
                    })()
                  )}
                </button>
                {editing === item.id ? <strong key="editing" contentEditable="plaintext-only" suppressContentEditableWarning role="textbox" aria-label="Library item name" onInput={event => setName(event.currentTarget.textContent ?? "")} onBlur={() => finish(item, true)} onKeyDown={event => {
                  event.stopPropagation();
                  if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); finish(item, event.key === "Enter"); }
                }}>{item.name}</strong> : <strong key="name" onDoubleClick={() => rename(item)}>{item.name}</strong>}
                {item.item === "board" ? <><p className="home-subtitle">{item.subtitle}</p><time dateTime={new Date(item.editedAt ?? 0).toISOString()}>Edited {new Date(item.editedAt ?? 0).toLocaleDateString()}</time></> : null}
                <p>
                  {item.item === "board"
                    ? `${item.cards} windows`
                    : `${items.filter((candidate) => candidate.parent === item.id).length} items`}
                </p>
                {item.item === 'node' && item.kind === 'project' ? <MenuButton label={`Cover for ${item.name}`} dataProjectCover={item.id} items={() => covers(item)}>Cover</MenuButton> : null}
                <MenuButton
                  label={`More actions for ${item.name}`}
                  items={() => menu(item)}
                >
                  <Icon name="more" />
                </MenuButton>
              </article>
            ))}
          </div>
          {!homeItems(data, home?.at ?? null, query).length ? <p className="home-empty">{query.trim() ? "No matches" : "No items yet"}</p> : null}
        </dialog>
      )}
    </>
  );
}

function homeItems(
  data: LibrarySnapshot,
  at: string | null,
  query: string,
): LibraryItem[] {
  const needle = query.trim().toLocaleLowerCase();
  return libraryItems(data)
    .filter((item) =>
      needle
        ? `${item.name} ${item.item === "board" ? item.subtitle ?? "" : ""}`.toLocaleLowerCase().includes(needle) &&
          (!at || ancestors(data, item.id).some((parent) => parent.id === at))
        : (item.item === "board"
            ? (item.boardParent ?? item.parent)
            : item.parent) === at,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
