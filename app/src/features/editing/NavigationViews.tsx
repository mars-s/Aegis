import { useLayoutEffect, useRef, useState } from "react";
import type { CardId } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
import type { ActionRegistration, FeatureContext, FeatureWorkspace } from "../../composition.js";
import "./navigation.css";

interface NavigationControls {
  readonly focus: () => void;
  readonly clean: () => void;
}
const controls = new WeakMap<FeatureWorkspace, NavigationControls>();

export const navigationActions: readonly ActionRegistration[] = [
  { id: "focus", label: "Focus selection", shortcut: "f", run: ({ workspace }) => controls.get(workspace)?.focus() },
  { id: "just-board", label: "Just the board", shortcut: "mod+\\", run: ({ workspace }) => controls.get(workspace)?.clean() },
];

export function NavigationViews({ context, engine }: {
  readonly context: FeatureContext;
  readonly engine: CanvasEngine | null;
}) {
  const [clean, setClean] = useState(false);
  const focus = useRef<ReadonlySet<CardId> | null>(null);
  const dirty = useRef(true);
  const current = useRef(context);
  current.current = context;

  useLayoutEffect(() => {
    let justBoard = false;
    function changeClean(on: boolean): void {
      justBoard = on;
      document.body.classList.toggle("just-board", on);
      setClean(on);
      current.current.engine()?.invalidate();
    }
    function clearFocus(): void {
      focus.current = null;
      dirty.current = true;
      current.current.engine()?.invalidate();
    }
    const actions: NavigationControls = {
      focus() {
        if (focus.current) { clearFocus(); return; }
        const { workspace } = current.current;
        const scene = current.current.engine();
        const ids = new Set(workspace.selection.getSnapshot());
        if (!scene || !ids.size) return;
        for (const link of workspace.scene.snapshot().links) {
          if (ids.has(link.a)) ids.add(link.b);
          if (ids.has(link.b)) ids.add(link.a);
        }
        focus.current = ids;
        dirty.current = true;
        scene.navigate({ kind: "fit", ids: [...ids], maximumZoom: 1, motion: "instant" });
      },
      clean: () => changeClean(!justBoard),
    };
    controls.set(context.workspace, actions);
    const stop = context.workspace.scene.subscribe(change => {
      if (change.kind === "replace") clearFocus();
    });
    // Install before the canvas's passive effect so Escape retains the focused selection.
    const key = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.key !== "Escape" ||
        event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable],dialog[open],[role=dialog],[role=menu],[role=listbox],.aegis-dropdown-menu,.side-editor") ||
        current.current.workspace.ui.getSnapshot().editor || current.current.engine()?.toolName()) return;
      if (focus.current) clearFocus();
      else if (justBoard) changeClean(false);
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => {
      stop();
      controls.delete(context.workspace);
      window.removeEventListener("keydown", key, true);
      document.body.classList.remove("just-board");
      focus.current = null;
    };
  }, [context.workspace]);

  useLayoutEffect(() => {
    if (!engine) return;
    const decorated = new Set<HTMLElement>();
    dirty.current = true;
    const stopLeases = engine.leases.subscribe(() => { dirty.current = true; engine.invalidate(); });
    const stopFrame = engine.registerFrameParticipant({ write() {
      if (!dirty.current) return;
      dirty.current = false;
      for (const element of decorated) element.classList.remove("focus-dim");
      decorated.clear();
      if (!focus.current) return;
      for (const lease of engine.leases.getSnapshot()) {
        const shell = lease.host.closest<HTMLElement>(".card");
        if (shell && !focus.current.has(lease.cardId)) {
          shell.classList.add("focus-dim");
          decorated.add(shell);
        }
      }
    } });
    return () => {
      stopLeases(); stopFrame();
      for (const element of decorated) element.classList.remove("focus-dim");
    };
  }, [engine]);

  return clean ? <button type="button" className="show-panels aegis-button" onClick={() => controls.get(context.workspace)?.clean()}>Show panels</button> : null;
}
