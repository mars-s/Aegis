// Windows tree behaviour ported from Mochiboard, MIT. See LICENSE.mochiboard.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { Card, CardId, Command } from "@aegis/domain";
import type { FeatureContext } from "../composition.js";
import { useSelection } from "../workspace/index.js";
import { MenuButton, Icon } from "./controls.js";
import { cardLabel, descendants, layerParents, useBoard } from "./model.js";
import { deleteCards, submit } from "./actions.js";
import type { Notify } from "./actions.js";

interface LayerRow {
  readonly card: Card;
  readonly depth: number;
  readonly parent: CardId | undefined;
  readonly children: readonly Card[];
}

export function Layers({
  context,
  notify,
  onFilter,
}: {
  readonly context: FeatureContext;
  readonly notify: Notify;
  readonly onFilter?: (
    filtered: boolean,
    matches: number,
    total: number,
  ) => void;
}) {
  const board = useBoard(context.workspace),
    selection = useSelection(context.workspace);
  const [query, setQuery] = useState(""),
    [folded, setFolded] = useState<ReadonlySet<CardId>>(new Set()),
    [active, setActive] = useState<CardId | null>(null);
  const [editing, setEditing] = useState<CardId | null>(null),
    [name, setName] = useState("");
  const filter = useRef<HTMLInputElement>(null),
    tree = useRef<HTMLDivElement>(null);
  const drag = useRef<CardId | null>(null);
  const parents = useMemo(() => layerParents(board), [board]);
  const matches = useMemo(
    () =>
      board.cards.filter((card) =>
        cardLabel(card)
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      ),
    [board, query],
  );
  const rows = useMemo(() => {
    const cards = [...matches].reverse().slice(0, 500),
      visible = new Set(cards.map((card) => card.id)),
      seen = new Set<CardId>(),
      output: LayerRow[] = [];
    function add(card: Card, depth: number): void {
      if (seen.has(card.id)) return;
      seen.add(card.id);
      let children = cards.filter((child) => parents.get(child.id) === card.id);
      if (card.type === "coll" && card.props?.kids) {
        const kids = card.props.kids;
        children = [...children].sort(
          (a, b) => kids.indexOf(a.id) - kids.indexOf(b.id),
        );
      }
      output.push({ card, depth, parent: parents.get(card.id), children });
      if (query || !folded.has(card.id))
        children.forEach((child) => add(child, depth + 1));
    }
    for (const card of cards) {
      const parent = parents.get(card.id);
      if (!parent || !visible.has(parent)) add(card, 0);
    }
    return output;
  }, [matches, parents, folded, query]);
  useEffect(() => {
    onFilter?.(!!query, matches.length, board.cards.length);
  }, [query, matches.length, board.cards.length, onFilter]);
  useEffect(() => {
    setQuery("");
    setFolded(new Set());
    setActive(null);
    setEditing(null);
  }, [board.id]);
  useEffect(() => {
    setFolded((previous) => {
      const next = new Set(previous);
      for (const id of selection) {
        let parent = parents.get(id);
        while (parent) {
          next.delete(parent);
          parent = parents.get(parent);
        }
      }
      return next.size === previous.size ? previous : next;
    });
  }, [selection, parents]);
  const activeId = rows.some((row) => row.card.id === active)
    ? active
    : (rows.find((row) => selection.includes(row.card.id))?.card.id ??
      rows[0]?.card.id);
  function focus(id: CardId | undefined): void {
    if (id) {
      setActive(id);
      tree.current
        ?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true });
    }
  }
  function toggle(id: CardId): void {
    setFolded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function pick(card: Card, additive: boolean, keyboard: boolean): void {
    const ids = additive
      ? selection.includes(card.id)
        ? selection.filter((id) => id !== card.id)
        : [...selection, card.id]
      : [card.id];
    context.workspace.act({ kind: "select", ids });
    context.engine()?.navigate({
      kind: "fit",
      ids: [card.id],
      motion: keyboard ? "instant" : "glide",
    });
  }
  function key(
    event: KeyboardEvent<HTMLDivElement>,
    row: LayerRow,
    index: number,
  ): void {
    if (event.target !== event.currentTarget) return;
    const handled = [
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "ArrowLeft",
      "ArrowRight",
      "Enter",
      " ",
      "Delete",
      "Backspace",
    ];
    if (!handled.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    switch (event.key) {
      case "ArrowUp":
        focus(rows[Math.max(0, index - 1)]?.card.id);
        break;
      case "ArrowDown":
        focus(rows[Math.min(rows.length - 1, index + 1)]?.card.id);
        break;
      case "Home":
        focus(rows[0]?.card.id);
        break;
      case "End":
        focus(rows.at(-1)?.card.id);
        break;
      case "ArrowRight":
        if (row.children.length) {
          if (folded.has(row.card.id)) toggle(row.card.id);
          else focus(row.children[0]?.id);
        }
        break;
      case "ArrowLeft":
        if (row.children.length && !folded.has(row.card.id))
          toggle(row.card.id);
        else focus(row.parent);
        break;
      case "Enter":
      case " ":
        pick(row.card, event.shiftKey || event.metaKey || event.ctrlKey, true);
        break;
      case "Delete":
      case "Backspace":
        void deleteCards(
          context,
          selection.includes(row.card.id) ? selection : [row.card.id],
          notify,
        );
        break;
    }
  }
  function finishRename(card: Card, keep: boolean): void {
    if (keep && name.trim() && name.trim() !== cardLabel(card))
      submit(
        context,
        [
          {
            op: "update",
            id: card.id,
            set: {
              props: { layerName: name.trim() },
              ...(card.type === "coll" ? { text: name.trim() } : {}),
            },
          },
        ],
        notify,
      );
    setEditing(null);
  }
  return (
    <>
      {board.cards.length > 8 ? (
        <input
          ref={filter}
          className="layer-filter"
          type="search"
          aria-label="Filter windows"
          placeholder="Filter windows"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
            }
          }}
        />
      ) : null}
      <div
        ref={tree}
        className="layer-list"
        role="tree"
        aria-label="Windows"
        aria-multiselectable="true"
      >
        {rows.map((row, index) => {
          const { card, depth, children } = row,
            label = cardLabel(card);
          const flags = (flag: "hidden" | "locked"): Command[] =>
            descendants(board, [card.id], parents).map((child) => ({
              op: "update",
              id: child.id,
              set: { props: { [flag]: card.props?.[flag] !== true } },
            }));
          const style: CSSProperties = { paddingLeft: 6 + depth * 14 };
          return (
            <div
              key={card.id}
              className={`layer-row${selection.includes(card.id) ? " on" : ""}${card.props?.["hidden"] === true ? " is-hidden" : ""}`}
              role="treeitem"
              aria-label={label}
              aria-level={depth + 1}
              aria-selected={selection.includes(card.id)}
              {...(children.length
                ? { "aria-expanded": !folded.has(card.id) }
                : {})}
              tabIndex={activeId === card.id ? 0 : -1}
              data-id={card.id}
              data-parent={row.parent ?? ""}
              style={style}
              draggable={editing !== card.id}
              onFocus={() => setActive(card.id)}
              onKeyDown={(event) => key(event, row, index)}
              onClick={(event) => {
                if (
                  event.target instanceof Element &&
                  !event.target.closest("button, input")
                ) {
                  focus(card.id);
                  pick(
                    card,
                    event.shiftKey || event.ctrlKey || event.metaKey,
                    event.detail === 0,
                  );
                }
              }}
              onDragStart={(event) => {
                drag.current = card.id;
                event.dataTransfer.setData(
                  "application/x-aegis-layer",
                  card.id,
                );
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                const source = drag.current;
                if (
                  source &&
                  source !== card.id &&
                  parents.get(source) === row.parent
                ) {
                  event.preventDefault();
                  const r = event.currentTarget.getBoundingClientRect();
                  event.currentTarget.classList.toggle(
                    "above",
                    event.clientY < r.top + r.height / 2,
                  );
                  event.currentTarget.classList.toggle(
                    "below",
                    event.clientY >= r.top + r.height / 2,
                  );
                }
              }}
              onDragLeave={(event) =>
                event.currentTarget.classList.remove("above", "below")
              }
              onDragEnd={() => {
                drag.current = null;
                tree.current
                  ?.querySelectorAll(".above, .below")
                  .forEach((node) => node.classList.remove("above", "below"));
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = drag.current;
                drag.current = null;
                const above = event.currentTarget.classList.contains("above");
                event.currentTarget.classList.remove("above", "below");
                if (
                  !source ||
                  source === card.id ||
                  parents.get(source) !== row.parent
                )
                  return;
                const parent = board.cards.find(
                  (item) => item.id === row.parent,
                );
                if (parent?.type === "coll") {
                  notify({
                    text: "Collection reordering needs the editing service.",
                  });
                  return;
                }
                const moving = descendants(board, [source], parents).map(
                    (item) => item.id,
                  ),
                  remaining = board.cards.filter(
                    (item) => !moving.includes(item.id),
                  );
                const positions = remaining.flatMap((item, i) =>
                  descendants(board, [card.id], parents).some(
                    (target) => target.id === item.id,
                  )
                    ? [i]
                    : [],
                );
                if (positions.length)
                  submit(
                    context,
                    [
                      {
                        op: "order",
                        ids: moving,
                        to: above
                          ? Math.max(...positions) + 1
                          : Math.min(...positions),
                      },
                    ],
                    notify,
                  );
              }}
            >
              {children.length ? (
                <button
                  className="layer-fold"
                  aria-label={`${folded.has(card.id) ? "Expand" : "Collapse"} ${label}`}
                  tabIndex={activeId === card.id ? 0 : -1}
                  onClick={() => toggle(card.id)}
                >
                  <Icon name={folded.has(card.id) ? "right" : "fold"} />
                </button>
              ) : (
                <Icon name="window" />
              )}
              {editing === card.id ? (
                <input
                  aria-label="Window name"
                  value={name}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setName(event.currentTarget.value)}
                  onBlur={() => finishRename(card, true)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter" || event.key === "Escape") {
                      event.preventDefault();
                      finishRename(card, event.key === "Enter");
                    }
                  }}
                />
              ) : (
                <span
                  className="name"
                  title={label}
                  onDoubleClick={() => {
                    setEditing(card.id);
                    setName(label);
                  }}
                >
                  {label}
                </span>
              )}
              <span className="row-state">
                {card.props?.["hidden"] === true ? (
                  <span role="img" aria-label="Hidden">
                    <Icon name="hidden" />
                  </span>
                ) : null}
                {card.props?.["locked"] === true ? (
                  <span role="img" aria-label="Locked">
                    <Icon name="lock" />
                  </span>
                ) : null}
              </span>
              <MenuButton
                label={`More actions for ${label}`}
                className="row-more icon-btn"
                tabIndex={activeId === card.id ? 0 : -1}
                items={[
                  {
                    title: card.props?.["hidden"] === true ? "Show" : "Hide",
                    run: () => {
                      submit(context, flags("hidden"), notify);
                    },
                  },
                  {
                    title: card.props?.["locked"] === true ? "Unlock" : "Lock",
                    run: () => {
                      submit(context, flags("locked"), notify);
                    },
                  },
                  {
                    title: "Rename",
                    run: () => {
                      setName(label);
                      setEditing(card.id);
                    },
                  },
                  {
                    title: "Delete",
                    run: () => {
                      void deleteCards(context, [card.id], notify);
                    },
                  },
                ]}
              >
                <Icon name="more" />
              </MenuButton>
            </div>
          );
        })}
        {query && !matches.length ? (
          <div className="layer-empty" role="status">
            <p>No matching windows</p>
            <button
              onClick={() => {
                setQuery("");
                filter.current?.focus();
              }}
            >
              Clear filter
            </button>
          </div>
        ) : null}
        {!board.cards.length ? (
          <p className="chrome-empty">Nothing on this board yet.</p>
        ) : null}
        {matches.length > 500 ? (
          <p className="chrome-empty">{matches.length - 500} more not shown</p>
        ) : null}
      </div>
    </>
  );
}
