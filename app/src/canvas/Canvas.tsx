import { useEffect, useMemo, useRef, useState } from "react";
import { createCanvas } from "@aegis/scene";
import type { CanvasEngine } from "@aegis/scene";
import type { Workspace } from "../workspace/index.js";
import type { CardBodyKind, Composition } from "../composition.js";
import { CardPortals } from "./CardPortals.js";

export function Canvas({ workspace, composition, attached, cameraChanged }: {
  readonly workspace: Workspace;
  readonly composition: Composition;
  readonly attached: (engine: CanvasEngine | null) => void;
  readonly cameraChanged: () => void;
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
    const instance = createCanvas({ stage: stage.current, world: world.current, backdrop: backdrop.current, overlay: overlay.current, workspace,
      canLease: card => {
        const kind: CardBodyKind = card.type === "object" ? `object:${card.kind}` : card.type;
        return availableBodies.current.has(kind);
      },
    });
    setEngine(instance);
    attached(instance);
    const element = stage.current;
    element.addEventListener("pointerup", cameraChanged);
    element.addEventListener("wheel", cameraChanged, { passive: true });
    return () => { element.removeEventListener("pointerup", cameraChanged); element.removeEventListener("wheel", cameraChanged); attached(null); instance.dispose(); };
  }, [workspace, attached, cameraChanged]);
  return <div id="stage" className="react-stage" ref={stage} tabIndex={0} aria-label="Board canvas">
    <canvas ref={backdrop} className="scene-backdrop" aria-hidden="true" />
    <div id="world" ref={world} />
    <canvas ref={overlay} className="scene-overlay" aria-hidden="true" />
    {engine ? <CardPortals workspace={workspace} engine={engine} composition={composition} /> : null}
  </div>;
}
