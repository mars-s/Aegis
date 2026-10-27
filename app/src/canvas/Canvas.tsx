import { useEffect, useMemo, useRef, useState } from "react";
import { createCanvas } from "@aegis/scene";
import type { CanvasEngine, Rect, Source } from "@aegis/scene";
import type { Workspace } from "../workspace/index.js";
import type { CardBodyKind, Composition } from "../composition.js";
import { CardPortals } from "./CardPortals.js";
import "./scene.css";
import { bindOrientationMenu } from "./orientation-menu.js";

export function Canvas({ workspace, composition, attached, cameraChanged, availableArea }: {
  readonly workspace: Workspace;
  readonly composition: Composition;
  readonly attached: (engine: CanvasEngine | null) => void;
  readonly cameraChanged: () => void;
  readonly availableArea?: Source<Rect>;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<CanvasEngine | null>(null);
  const bodyKinds = useMemo(() => new Set(composition.cards.map(card => card.kind)), [composition]);
  const availableBodies = useRef(bodyKinds);
  useEffect(() => { availableBodies.current = bodyKinds; engine?.invalidate(); }, [bodyKinds, engine]);
  useEffect(() => {
    if (!stage.current || !world.current || !backdrop.current || !overlay.current) return;
    const instance = createCanvas({ stage: stage.current, world: world.current, backdrop: backdrop.current, overlay: overlay.current, workspace, ...(availableArea ? { availableArea } : {}),
      onToolCommit: (boardId, commit) => {
        if (workspace.metadata.getSnapshot().id !== boardId) return;
        const result = workspace.submit(commit.commands);
        if (result.kind === 'applied') workspace.act({ kind: 'select', ids: commit.selection });
        else window.dispatchEvent(new CustomEvent('aegis:notice', { detail: result.errors[0]?.reason ?? 'Could not finish this gesture.' }));
      },
      canLease: card => {
        const kind: CardBodyKind = card.type === "object" ? `object:${card.kind}` : card.type;
        return availableBodies.current.has(kind);
      },
    });
    setEngine(instance);
    attached(instance);
    const element = stage.current;
    const disposeMenu = bindOrientationMenu(element, instance, () => workspace.scene.snapshot().cards, cameraChanged);
    const navigationChanged = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "0" && !["Enter", " "].includes(event.key)) return;
      if (event instanceof KeyboardEvent && event.key === "0" || event.target instanceof Element && event.target.closest(".canvas-orientation [data-card-id]")) cameraChanged();
    };
    element.addEventListener("pointerup", cameraChanged);
    element.addEventListener("wheel", cameraChanged, { passive: true });
    element.addEventListener("keyup", navigationChanged);
    element.addEventListener("dblclick", navigationChanged);
    return () => { disposeMenu(); element.removeEventListener("pointerup", cameraChanged); element.removeEventListener("wheel", cameraChanged); element.removeEventListener("keyup", navigationChanged); element.removeEventListener("dblclick", navigationChanged); attached(null); instance.dispose(); };
  }, [workspace, attached, cameraChanged, availableArea]);
  return <div id="stage" className="react-stage" ref={stage} tabIndex={0} aria-label="Board canvas">
    <canvas ref={backdrop} className="scene-backdrop" aria-hidden="true" />
    <div id="world" ref={world} />
    <canvas ref={overlay} className="scene-overlay" aria-hidden="true" />
    {engine ? <CardPortals workspace={workspace} engine={engine} composition={composition} /> : null}
  </div>;
}
