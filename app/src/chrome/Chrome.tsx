import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { z } from 'zod/v4';
import type { CardId } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
import type {
  ActionRegistration,
  Composition,
  FeatureContext,
} from "../composition.js";
import {
  useSaveState,
  useSource,
  useWorkspaceMetadata,
} from "../workspace/index.js";
import { createMenu } from "../lib/ui/menu.js";
import { mountDropdowns } from "../lib/ui/dropdown.js";
import { deleteCards, duplicateCards, groupCards, submit } from "./actions.js";
import type { Notice, Notify } from "./actions.js";
import { Icon, MenuButton, PopupButton } from "./controls.js";
import { Layers } from "./Windows.js";
import { Library } from "./LibraryView.js";
import type { LibraryService } from "./library-model.js";
import { normaliseLayout, readLayout, saveLayout } from "./layout.js";
import type { PanelLayout } from "./layout.js";
import { Selection } from "./Selection.js";
import type { ChromeGestures } from "./Selection.js";
import { useBoard } from "./model.js";
import { Panel, SideResize } from "./Panel.js";
import { MobileHub } from "../features/mobile/MobileHub.js";
import { useChromeExports } from "./exports.js";
import { toolOrder, useToolbar } from "./Preferences.js";
import { Templates } from "./TemplateMenu.js";
import "./chrome.css";

function setZoom(
  engine: CanvasEngine,
  zoom: number,
  changed: (() => void) | undefined,
): void {
  const camera = engine.camera(),
    next = Math.max(0.05, Math.min(4, zoom)),
    ratio = next / camera.zoom;
  engine.navigate({
    kind: "restore",
    camera: {
      x: innerWidth / 2 - (innerWidth / 2 - camera.x) * ratio,
      y: innerHeight / 2 - (innerHeight / 2 - camera.y) * ratio,
      zoom: next,
    },
    motion: "instant",
  });
  changed?.();
}

export interface ChromeProps {
  readonly context: FeatureContext;
  readonly engine: CanvasEngine;
  readonly composition: Composition;
  readonly library?: LibraryService;
  readonly gestures?: ChromeGestures;
  readonly settings?: () => void;
  readonly ask?: (ids: readonly CardId[]) => void;
  readonly cameraChanged?: () => void;
  readonly customiseToolbar?: () => void;
  readonly barContent?: ReactNode;
  readonly rightContent?: ReactNode;
}

export function Chrome({
  context,
  engine,
  composition,
  library,
  gestures,
  settings,
  ask,
  cameraChanged,
  customiseToolbar,
  barContent,
  rightContent,
}: ChromeProps) {
  const metadata = useWorkspaceMetadata(context.workspace),
    save = useSaveState(context.workspace),
    ui = useSource(context.workspace.ui),
    history = useSource(context.workspace.history);
  const [layout, setLayout] = useState(readLayout),
    [notice, setNotice] = useState<Notice | null>(null),
    [filter, setFilter] = useState({ filtered: false, matches: 0, total: 0 });
  const [captureReveal, setCaptureReveal] = useState<{ readonly id: string; readonly side: 'left' | 'right' } | null>(null);
  const toolbar = useToolbar();
  useLayoutEffect(() => {
    document.body.dataset.toolSize = toolbar.size;
  }, [toolbar.size]);
  useEffect(() => {
    const refresh = () => {
      const next = readLayout();
      setLayout(next);
      context.workspace.act({
        kind: "panel",
        side: "left",
        open: next.open.left,
      });
      context.workspace.act({
        kind: "panel",
        side: "right",
        open: next.open.right,
      });
    };
    window.addEventListener("aegis:panels-changed", refresh);
    return () => window.removeEventListener("aegis:panels-changed", refresh);
  }, [context]);
  const [palette, setPalette] = useState(false),
    [query, setQuery] = useState("");
  const paletteDialog = useRef<HTMLDialogElement>(null),
    paletteTrigger = useRef<HTMLButtonElement>(null);
  const dock = useRef<HTMLElement>(null),
    leftBar = useRef<HTMLDivElement>(null),
    rightBar = useRef<HTMLDivElement>(null);
  const arrows = useRef<{
    left: HTMLButtonElement | null;
    right: HTMLButtonElement | null;
  }>({ left: null, right: null });
  const current = useRef({
    context,
    engine,
    composition,
    layout,
    ui,
    save,
    ask,
    cameraChanged,
  });
  useEffect(() => {
    current.current = {
      context,
      engine,
      composition,
      layout,
      ui,
      save,
      ask,
      cameraChanged,
    };
  }, [context, engine, composition, layout, ui, save, ask, cameraChanged]);
  const notify = useCallback<Notify>((value) => setNotice(value), []);
  const exportBoard = useChromeExports(context, engine, composition, notify);
  const filtered = useCallback(
    (filtered: boolean, matches: number, total: number) =>
      setFilter((previous) =>
        previous.filtered === filtered &&
        previous.matches === matches &&
        previous.total === total
          ? previous
          : { filtered, matches, total },
      ),
    [],
  );
  const change = useCallback(
    (next: PanelLayout) => {
      const updated = normaliseLayout(next);
      saveLayout(updated);
      setLayout(updated);
      context.workspace.act({
        kind: "panel",
        side: "left",
        open: updated.open.left,
      });
      context.workspace.act({
        kind: "panel",
        side: "right",
        open: updated.open.right,
      });
    },
    [context],
  );
  function setOpen(side: "left" | "right", open: boolean): void {
    context.workspace.act({ kind: "panel", side, open });
    change({ ...layout, open: { ...layout.open, [side]: open } });
  }
  useEffect(() => {
    mountDropdowns();
    const saved = readLayout();
    context.workspace.act({
      kind: "panel",
      side: "left",
      open: saved.open.left,
    });
    context.workspace.act({
      kind: "panel",
      side: "right",
      open: saved.open.right,
    });
  }, [context]);
  useEffect(() => {
    document.body.classList.toggle("left-open", ui.leftPanel);
    document.body.classList.toggle("right-open", ui.rightPanel);
    document.documentElement.style.setProperty(
      "--side-w",
      ui.leftPanel ? `${layout.width}px` : "0px",
    );
    document.documentElement.style.setProperty(
      "--right-side-w",
      ui.rightPanel ? `${layout.rightWidth}px` : "0px",
    );
    return () => {
      document.body.classList.remove("left-open", "right-open");
      document.documentElement.style.removeProperty("--side-w");
      document.documentElement.style.removeProperty("--right-side-w");
    };
  }, [ui.leftPanel, ui.rightPanel, layout.width, layout.rightWidth]);
  useEffect(() => {
    if (!notice || notice.action) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (palette) {
      paletteDialog.current?.showModal();
      paletteDialog.current?.querySelector("input")?.focus();
    }
  }, [palette]);
  useEffect(() => {
    const lifetime = new AbortController(),
      timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>(),
      near = new Set<HTMLElement>();
    const groups = [dock.current, leftBar.current, rightBar.current].filter(
      (item): item is HTMLElement => item !== null,
    );
    const touch = matchMedia(
      "(hover: none), (pointer: coarse), (max-width: 700px)",
    );
    let keyboard = false;
    function sync(): void {
      for (const group of groups) {
        const held =
          touch.matches ||
          context.workspace.selection.getSnapshot().length > 0 ||
          near.has(group) ||
          group.contains(document.activeElement) ||
          !!group.querySelector('[aria-expanded="true"], details[open]') ||
          (group === rightBar.current &&
            (current.current.save.kind === "blocked" ||
              !!document.querySelector("dialog[open]")));
        if (held) {
          const timer = timers.get(group);
          if (timer) clearTimeout(timer);
          timers.delete(group);
          group.classList.add("chrome-visible");
          group.classList.toggle("chrome-instant", keyboard);
        } else if (!timers.has(group))
          timers.set(
            group,
            setTimeout(() => {
              group.classList.remove("chrome-visible");
              timers.delete(group);
            }, 1200),
          );
      }
    }
    window.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerType !== "mouse" || event.buttons) return;
        keyboard = false;
        near.clear();
        if (dock.current && event.clientX <= 48) near.add(dock.current);
        if (leftBar.current && event.clientY <= 48) near.add(leftBar.current);
        if (
          rightBar.current &&
          (event.clientY <= 48 || innerWidth - event.clientX <= 48)
        )
          near.add(rightBar.current);
        for (const side of ["left", "right"] as const) {
          const arrow = arrows.current[side],
            distance =
              side === "left" ? event.clientX : innerWidth - event.clientX;
          if (arrow)
            arrow.classList.toggle(
              "show",
              distance <= 20 ||
                (distance <= 96 && arrow.classList.contains("show")),
            );
        }
        sync();
      },
      { passive: true, signal: lifetime.signal },
    );
    window.addEventListener(
      "blur",
      () => {
        near.clear();
        for (const arrow of Object.values(arrows.current))
          arrow?.classList.remove("show");
        sync();
      },
      { signal: lifetime.signal },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        keyboard = true;
        if (
          event.key === "Tab" ||
          (event.code === "KeyT" &&
            event.shiftKey &&
            !event.metaKey &&
            !event.ctrlKey &&
            !(
              event.target instanceof Element &&
              event.target.closest(
                "input,textarea,[contenteditable],dialog[open]",
              )
            ))
        ) {
          groups.forEach((group) => {
            group.classList.add("chrome-visible", "chrome-instant");
          });
          if (event.code === "KeyT") {
            event.preventDefault();
            dock.current?.querySelector("button")?.focus();
          }
        }
      },
      { capture: true, signal: lifetime.signal },
    );
    for (const group of groups) {
      group.addEventListener(
        "pointerenter",
        () => {
          near.add(group);
          sync();
        },
        { signal: lifetime.signal },
      );
      group.addEventListener(
        "pointerleave",
        () => {
          near.delete(group);
          sync();
        },
        { signal: lifetime.signal },
      );
      group.addEventListener("focusin", sync, { signal: lifetime.signal });
      group.addEventListener("focusout", () => queueMicrotask(sync), {
        signal: lifetime.signal,
      });
    }
    const observer = new MutationObserver(sync);
    for (const group of groups)
      observer.observe(group, {
        attributes: true,
        subtree: true,
        attributeFilter: ["aria-expanded", "open"],
      });
    const offSaving = context.workspace.saving.subscribe(sync);
    const offSelection = context.workspace.selection.subscribe(sync);
    touch.addEventListener("change", sync, { signal: lifetime.signal });
    sync();
    return () => {
      lifetime.abort();
      observer.disconnect();
      offSaving();
      offSelection();
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [context]);
  useEffect(() => {
    const reveal = (event: Event): void => {
      if (!(event.target instanceof Element)) return;
      const panel = event.target.closest<HTMLElement>('[data-panel]');
      if (!panel?.dataset.panel) return;
      const side = panel.closest('#sideRight') ? 'right' : 'left';
      if (event instanceof CustomEvent) {
        const detail: unknown = event.detail;
        if (z.object({ capture: z.literal(true) }).safeParse(detail).success) setCaptureReveal({ id: panel.dataset.panel, side });
      }
      const layout = current.current.layout, folded = { ...layout.folded };
      for (let ancestor: HTMLElement | null = panel; ancestor; ancestor = ancestor.parentElement?.closest<HTMLElement>('[data-panel]') ?? null) {
        const id = ancestor.dataset.panel; if (id) folded[id] = false;
      }
      change({ ...layout, folded, off: { ...layout.off, [panel.dataset.panel]: false }, open: { ...layout.open, [side]: true } });
    };
    document.addEventListener('panelreveal', reveal);
    const end = (): void => setCaptureReveal(null);
    document.addEventListener('panelrevealend', end);
    return () => { document.removeEventListener('panelreveal', reveal); document.removeEventListener('panelrevealend', end); };
  }, [change]);
  useEffect(() => {
    if (!captureReveal) return;
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.capture-confirmation [data-put]')) setCaptureReveal(null);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [captureReveal]);
  function add(type: "note" | "title" | "todo" | "readme"): void {
    const point = engine.screenToWorld({
      x: innerWidth / 2,
      y: innerHeight / 2,
    });
    const result = context.workspace.submit([
      {
        op: "create",
        type: type === "readme" ? "note" : type,
        text: type === "title" ? "Untitled" : "",
        x: point.x - 120,
        y: point.y - 60,
        w: type === "readme" ? 260 : 240,
        h: type === "readme" ? 150 : 120,
        ...(type === "readme"
          ? {
              color: "green",
              heading: "How this board works",
              badge: "read me first",
            }
          : {}),
      },
    ]);
    if (result.kind === "applied")
      context.workspace.act({ kind: "select", ids: result.ids });
    else
      notify({ text: result.errors.map((error) => error.reason).join("\n") });
  }
  function zoom(scale: number): void {
    setZoom(engine, engine.camera().zoom * scale, cameraChanged);
  }
  const actions: readonly ActionRegistration[] = useMemo(
    () => [
      { id: "note", label: "Note", shortcut: "N", run: () => add("note") },
      { id: "title", label: "Heading", shortcut: "H", run: () => add("title") },
      { id: "todo", label: "Checklist", shortcut: "C", run: () => add("todo") },
      {
        id: "readme",
        label: "Read me",
        shortcut: "R",
        run: () => add("readme"),
      },
      ...composition.tools,
      ...composition.menus,
    ],
    [composition, context, engine],
  );
  const actionRef = useRef(actions);
  const dockIds = toolOrder(
    [
      "select",
      "note",
      "title",
      "todo",
      "readme",
      ...(library ? ["templates"] : []),
      ...composition.tools.map((action) => action.id),
    ],
    toolbar.order,
  ).filter((id) => !toolbar.hidden.includes(id));
  const toolButton = (id: string) => {
    if (id === "templates" && library)
      return (
        <Templates
          key={id}
          context={context}
          library={library}
          notify={notify}
        />
      );
    if (id === "select")
      return (
        <button
          key={id}
          type="button"
          data-tool={id}
          onClick={() => {
            engine.tool(null);
            context.workspace.act({ kind: "select", ids: [] });
          }}
        >
          Select
        </button>
      );
    const action = actions.find((item) => item.id === id);
    return action ? (
      <button
        key={id}
        type="button"
        data-tool={id}
        title={`${action.label}${action.shortcut ? ` (${action.shortcut})` : ""}`}
        onClick={() => action.run(context)}
      >
        {action.label}
      </button>
    ) : null;
  };
  useEffect(() => {
    actionRef.current = actions;
  }, [actions]);
  useEffect(() => {
    function key(event: globalThis.KeyboardEvent): void {
      if (
        event.defaultPrevented ||
        event.repeat ||
        (event.key === "Enter" && event.target instanceof Element && !!event.target.closest("button,a,[role=gridcell]")) ||
        (event.target instanceof Element &&
          event.target.closest(
            "input,textarea,select,[contenteditable],dialog[open],.side-editor,.aegis-dropdown-menu",
          ))
      )
        return;
      const { context, engine, ask } = current.current,
        mod = event.metaKey || event.ctrlKey,
        name = event.key.toLowerCase(),
        ids = context.workspace.selection.getSnapshot();
      if (
        !mod &&
        !event.altKey &&
        event.target instanceof Element &&
        event.target.closest("button,summary,[role=treeitem]")
      )
        return;
      let handled = true;
      if (mod && name === "z") {
        if (event.shiftKey) context.workspace.redo();
        else context.workspace.undo();
      } else if (mod && name === "d") duplicateCards(context, ids, notify);
      else if (mod && name === "g")
        groupCards(context, ids, event.shiftKey, notify);
      else if (mod && name === "p") {
        setQuery("");
        setPalette(true);
      } else if ((name === "delete" || name === "backspace") && ids.length)
        void deleteCards(context, ids, notify);
      else if (!mod && !event.altKey && (name === "\\" || name === "a")) {
        const side = name === "a" ? "right" : "left";
        const opened = context.workspace.ui.getSnapshot();
        change({
          ...current.current.layout,
          open: {
            ...current.current.layout.open,
            [side]: side === "left" ? !opened.leftPanel : !opened.rightPanel,
          },
        });
      } else if (mod && name === "0") {
        setZoom(engine, 1, current.current.cameraChanged);
      } else if (mod && (name === "+" || name === "=" || name === "-")) {
        setZoom(
          engine,
          engine.camera().zoom * (name === "-" ? 0.8 : 1.25),
          current.current.cameraChanged,
        );
      } else if (
        !mod &&
        !event.altKey &&
        (name === "0" || (event.shiftKey && event.code === "Digit1"))
      ) {
        engine.navigate({ kind: "fit", ids: [], motion: "instant" });
        current.current.cameraChanged?.();
      } else if (mod && !event.shiftKey && name === "k" && ask) ask(ids);
      else {
        const action = actionRef.current.find(
          (item) => item.shortcut && shortcutMatches(item.shortcut, event),
        );
        if (action) action.run(context);
        else handled = false;
      }
      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [notify, change]);
  useEffect(() => {
    const stage = document.getElementById("stage");
    if (!stage) return;
    const menuElement = document.createElement("div");
    menuElement.className = "ctx-menu";
    const menu = createMenu({
      menu: menuElement,
      bindTrigger: false,
      label: "Window actions",
    });
    function open(event: MouseEvent): void {
      if (
        event.target instanceof Element &&
        event.target.closest("input,textarea,[contenteditable]")
      )
        return;
      event.preventDefault();
      const rect = stage?.getBoundingClientRect();
      if (!rect) return;
      const id = engine.hitTest({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      const selection = context.workspace.selection.getSnapshot(),
        ids = id && !selection.includes(id) ? [id] : selection;
      if (id) context.workspace.act({ kind: "select", ids });
      menu.setTrigger(stage ?? document.body);
      menu.setItems(
        id
          ? [
              {
                title: "Open",
                run: () => {
                  context.openEditor(id);
                },
              },
              {
                title: "Copy",
                run: () => {
                  const text = context.workspace.scene
                    .snapshot()
                    .cards.filter((card) => ids.includes(card.id))
                    .map((card) => card.text)
                    .join("\n\n");
                  void navigator.clipboard
                    .writeText(text)
                    .catch(() =>
                      notify({ text: "Could not copy the selection." }),
                    );
                },
              },
              {
                title: "Duplicate",
                run: () => duplicateCards(context, ids, notify),
              },
              {
                title: "Arrange",
                items: [
                  {
                    title: "Bring to front",
                    run: () => {
                      submit(
                        context,
                        [{ op: "order", ids: [...ids], to: "front" }],
                        notify,
                      );
                    },
                  },
                  {
                    title: "Send to back",
                    run: () => {
                      submit(
                        context,
                        [{ op: "order", ids: [...ids], to: "back" }],
                        notify,
                      );
                    },
                  },
                ],
              },
              {
                title: "Lock",
                run: () => {
                  submit(
                    context,
                    ids.map((id) => ({
                      op: "update",
                      id,
                      set: { props: { locked: true } },
                    })),
                    notify,
                  );
                },
              },
              {
                title: "Delete",
                run: () => {
                  void deleteCards(context, ids, notify);
                },
              },
            ]
          : [
              ...actionRef.current.map((action) => ({
                title: action.label,
                run: () => action.run(context),
              })),
              ...(["png", "pdf"] as const).map((format) => ({
                title: `Export board as ${format.toUpperCase()}`,
                run: () => {
                  void exportBoard(false, format);
                },
              })),
            ],
      );
      menu.open(event, { x: event.clientX, y: event.clientY });
    }
    stage.addEventListener("contextmenu", open);
    return () => {
      stage.removeEventListener("contextmenu", open);
      menu.destroy();
    };
  }, [context, engine, notify, exportBoard]);
  const board = useBoard(context.workspace);
  let panelLayout = layout;
  if (captureReveal) {
    const folded = { ...layout.folded, [captureReveal.id]: false };
    for (const id of layout.columns[captureReveal.side]) folded[id] = id !== 'tools' && id !== captureReveal.id;
    panelLayout = { ...layout, folded, heights: { ...layout.heights, tools: Math.max(300, innerHeight - 280), [captureReveal.id]: Math.max(220, Math.min(340, innerHeight - 420)) } };
  }
  const panels = (side: "left" | "right") =>
    layout.columns[side].map((id) => {
      if (id === "layers")
        return (
          <Panel
            key={id}
            id={id}
            label="Windows"
            layout={panelLayout}
            change={change}
            count={
              filter.filtered
                ? `${filter.matches} of ${filter.total}`
                : String(board.cards.length || "")
            }
            filtered={filter.filtered}
          >
            <Layers context={context} notify={notify} onFilter={filtered} />
          </Panel>
        );
      if (id === "library")
        return (
          <Panel
            key={id}
            id={id}
            label="Library"
            layout={panelLayout}
            change={change}
          >
            {library ? (
              <Library
                service={library}
                current={metadata.id}
                notify={notify}
              />
            ) : (
              <p className="chrome-empty">Library is unavailable.</p>
            )}
          </Panel>
        );
      if (id === "tools")
        return (
          <Panel key={id} id={id} label="Tools" layout={panelLayout} change={change}>
            <div className="tools-panels">
              {composition.panels
                .filter(
                  (panel) =>
                    panel.side === "left" &&
                    !layout.columns.left.includes(panel.id) &&
                    !layout.columns.right.includes(panel.id),
                )
                .map((panel) => (
                  <Panel
                    key={panel.id}
                    id={panel.id}
                    label={panel.label ?? panel.id}
                    layout={panelLayout}
                    change={change}
                  >
                    <panel.Body context={context} />
                  </Panel>
                ))}
              {!layout.columns.left.includes("keys") &&
              !layout.columns.right.includes("keys") ? (
                <Panel
                  id="keys"
                  label="Shortcuts"
                  layout={layout}
                  change={change}
                >
                  <dl>
                    <dt>N</dt>
                    <dd>Note</dd>
                    <dt>H</dt>
                    <dd>Heading</dd>
                    <dt>C</dt>
                    <dd>Checklist</dd>
                    <dt>0</dt>
                    <dd>Fit board</dd>
                    <dt>\\</dt>
                    <dd>Library and Windows</dd>
                    <dt>Shift T</dt>
                    <dd>Reveal tools</dd>
                    <dt>⌘ P</dt>
                    <dd>Commands</dd>
                    <dt>⌘ Z</dt>
                    <dd>Undo</dd>
                  </dl>
                </Panel>
              ) : null}
            </div>
          </Panel>
        );
      const registered = composition.panels.find((panel) => panel.id === id);
      return registered ? (
        <Panel
          key={id}
          id={id}
          label={registered.label ?? id}
          layout={layout}
          change={change}
        >
          <registered.Body context={context} />
        </Panel>
      ) : null;
    });
  function closePalette(): void {
    paletteDialog.current?.close();
    setPalette(false);
    paletteTrigger.current?.focus();
  }
  return (
    <div className="aegis-chrome">
      <MobileHub
        sheets={{
          boards: () =>
            library ? (
              <Library
                service={library}
                current={metadata.id}
                notify={notify}
              />
            ) : (
              <p>Library is unavailable.</p>
            ),
          layers: () => <Layers context={context} notify={notify} />,
          add: () => (
            <div className="tools-grid">
              {actions.map((action) => (
                <button key={action.id} onClick={() => action.run(context)}>
                  {action.label}
                </button>
              ))}
            </div>
          ),
          unsorted: () => {
            const panel = composition.panels.find(
              (item) => item.id === "unsorted",
            );
            return panel ? (
              <panel.Body context={context} />
            ) : (
              <p>No unsorted ideas.</p>
            );
          },
          agents: () => rightContent,
        }}
      />
      <header className="bar">
        <div ref={leftBar} className="bar-left">
          <button
            id="sideBtn"
            className="icon-btn"
            aria-label={
              ui.leftPanel
                ? "Hide windows and library"
                : "Show windows and library"
            }
            aria-expanded={ui.leftPanel}
            onClick={() => setOpen("left", !ui.leftPanel)}
          >
            <Icon name="window" />
          </button>
        </div>
        <nav id="boardCrumbs" aria-label="Board path" />
        <button
          id="boardName"
          aria-expanded={ui.leftPanel}
          onClick={() => setOpen("left", !ui.leftPanel)}
        >
          {metadata.name}
        </button>
        <div ref={rightBar} className="bar-right">
          {barContent}
          <span data-saved data-save-state={save.kind} role="status">
            {save.kind === "saving"
              ? "Saving"
              : save.kind === "blocked"
                ? save.reason
                : "Saved"}
          </span>
          {save.kind === "blocked" ? (
            <button id="retrySave" onClick={context.workspace.retry}>
              Retry
            </button>
          ) : null}
          <MenuButton
            label="Zoom"
            triggerLabel="Zoom menu"
            menuClass="editing-zoom-menu"
            items={[
              { title: "Zoom in", shortcut: "+", run: () => zoom(1.25) },
              { title: "Zoom out", shortcut: "−", run: () => zoom(0.8) },
              {
                title: "Fit board",
                shortcut: "0",
                run: (event) => {
                  engine.navigate({
                    kind: "fit",
                    ids: [],
                    motion: event.detail === 0 ? "instant" : "glide",
                  });
                  cameraChanged?.();
                },
              },
              ...[0.25, 0.5, 1, 2].map((value) => ({
                title: `${value * 100}%`,
                run: () => setZoom(engine, value, cameraChanged),
              })),
            ]}
          >
            <span aria-label="Zoom menu">Zoom</span>
          </MenuButton>
          <button
            ref={paletteTrigger}
            aria-label="Commands"
            onClick={() => {
              setQuery("");
              setPalette(true);
            }}
          >
            Commands
          </button>
          <button
            id="agentsBtn"
            aria-pressed={ui.rightPanel}
            onClick={() => setOpen("right", !ui.rightPanel)}
          >
            Agents
          </button>
          {settings ? (
            <button id="settingsBtn" onClick={settings}>
              Settings
            </button>
          ) : null}
        </div>
      </header>
      <button
        ref={(element) => {
          arrows.current.left = element;
        }}
        id="revealLeft"
        className="reveal-arrow"
        aria-label="Open Library and Windows"
        aria-expanded={ui.leftPanel}
        onClick={() => setOpen("left", true)}
      >
        <Icon name="right" />
      </button>
      <button
        ref={(element) => {
          arrows.current.right = element;
        }}
        id="revealRight"
        className="reveal-arrow"
        aria-label="Open agent activity and panels"
        aria-expanded={ui.rightPanel}
        onClick={() => setOpen("right", true)}
      >
        <Icon name="left" />
      </button>
      <aside
        id="side"
        className={`side${ui.leftPanel ? " open" : ""}${captureReveal?.side === 'left' ? ' capture-reveal' : ''}`}
        aria-label="Library and Windows"
        hidden={!ui.leftPanel}
        style={{ width: layout.width }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            setOpen("left", false);
            arrows.current.left?.focus();
          }
        }}
      >
        <div className="side-head">
          <span>Workspace</span>
          <button
            id="closeSide"
            className="icon-btn"
            aria-label="Close Library and Windows"
            onClick={() => {
              setOpen("left", false);
              arrows.current.left?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        {panels("left")}
        <SideResize side="left" layout={layout} change={change} />
      </aside>
      <aside
        id="sideRight"
        className={`side side-right${ui.rightPanel ? " open" : ""}${captureReveal?.side === 'right' ? ' capture-reveal' : ''}`}
        aria-label="Agent activity and panels"
        hidden={!ui.rightPanel}
        style={{ width: layout.rightWidth }}
      >
        <div className="side-head">
          <span>Agent activity</span>
          <button
            className="icon-btn"
            aria-label="Close agent activity and panels"
            onClick={() => {
              setOpen("right", false);
              arrows.current.right?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        {rightContent}
        {panels("right")}
        <SideResize side="right" layout={layout} change={change} />
        {composition.panels
          .filter(
            (panel) =>
              panel.side === "right" &&
              !layout.columns.right.includes(panel.id),
          )
          .map((panel) => (
            <panel.Body key={panel.id} context={context} />
          ))}
      </aside>
      <nav ref={dock} id="tools" aria-label="Canvas tools">
        {dockIds.slice(0, 6).map(toolButton)}
        <PopupButton
          label="More tools"
          triggerId="toolsFold"
          menuId="toolsPopover"
          className="tools-popover"
        >
          <div className="tools-grid">{dockIds.slice(6).filter(id => !['swatch', 'link', 'audio', 'video', 'import-image'].includes(id)).map(toolButton)}</div>
          {dockIds.slice(6).some(id => ['swatch', 'link', 'audio', 'video', 'import-image'].includes(id)) ? <section>
            <h3>Media</h3>
            <div className="tools-grid">{dockIds.slice(6).filter(id => ['swatch', 'link', 'audio', 'video', 'import-image'].includes(id)).map(toolButton)}</div>
          </section> : null}
          {customiseToolbar ? (
            <button aria-label="Customise toolbar" onClick={customiseToolbar}>
              Customise toolbar
            </button>
          ) : null}
        </PopupButton>
        <button
          disabled={!history.undo}
          onClick={() => context.workspace.undo()}
        >
          Undo
        </button>
        <button
          disabled={!history.redo}
          onClick={() => context.workspace.redo()}
        >
          Redo
        </button>
      </nav>
      <Selection
        canOpen={card => composition.editors.some(editor => editor.kind === (card.type === "object" ? `object:${card.kind}` : card.type))}
        context={context}
        engine={engine}
        notify={notify}
        exportSelection={(format) => {
          void exportBoard(true, format);
        }}
        {...(gestures ? { gestures } : {})}
        {...(ask ? { ask } : {})}
      />
      {notice ? (
        <div
          className={`toast${notice.action ? " layer-undo" : ""}`}
          role="status"
        >
          <span>{notice.text}</span>
          {notice.action ? (
            <button
              onClick={() => {
                notice.action?.run();
                setNotice(null);
              }}
            >
              Undo
            </button>
          ) : null}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <Icon name="close" />
          </button>
        </div>
      ) : null}
      {palette ? (
        <dialog
          ref={paletteDialog}
          className="aegis-dialog command-palette"
          aria-label="Commands"
          onCancel={(event) => {
            event.preventDefault();
            closePalette();
          }}
        >
          <input
            aria-label="Find a command"
            placeholder="Find a command"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                paletteDialog.current
                  ?.querySelector<HTMLButtonElement>("button[data-command]")
                  ?.focus();
              }
            }}
          />
          <div role="menu" aria-label="Commands">
            {actions
              .filter((action) =>
                action.label
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .map((action) => (
                <button
                  role="menuitem"
                  key={action.id}
                  data-command={action.id}
                  onClick={() => {
                    closePalette();
                    action.run(context);
                  }}
                >
                  {action.label}
                  <kbd>{action.shortcut}</kbd>
                </button>
              ))}
          </div>
          <button onClick={closePalette}>Close</button>
        </dialog>
      ) : null}
    </div>
  );
}

function shortcutMatches(
  shortcut: string,
  event: globalThis.KeyboardEvent,
): boolean {
  const keys = shortcut.toLowerCase().split("+"),
    key = keys.at(-1);
  return (
    key === event.key.toLowerCase() &&
    keys.includes("shift") === event.shiftKey &&
    (keys.includes("meta") || keys.includes("cmd") || keys.includes("mod")
      ? event.metaKey || event.ctrlKey
      : !event.metaKey && !event.ctrlKey) &&
    keys.includes("alt") === event.altKey
  );
}
