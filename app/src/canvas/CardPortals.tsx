import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CardId } from "@aegis/domain";
import type { CanvasEngine, SlotLease } from "@aegis/scene";
import type { Workspace } from "../workspace/index.js";
import type { Composition, FeatureWorkspace } from "../composition.js";

export interface CardBodyProps {
  readonly cardId: CardId;
  readonly workspace: FeatureWorkspace;
  readonly engine: CanvasEngine;
}


function LeaseBody({ lease, workspace, engine, composition }: {
  readonly lease: SlotLease;
  readonly workspace: Workspace;
  readonly engine: CanvasEngine;
  readonly composition: Composition;
}) {
  const source = workspace.card(lease.cardId);
  const card = useSyncExternalStore(source.subscribe, source.getSnapshot);
  useEffect(() => () => {
    queueMicrotask(() => engine.leases.acknowledgeUnmount(lease.key, lease.generation));
  }, [engine, lease.key, lease.generation]);
  useEffect(() => { engine.requestMeasurement(lease.key, lease.generation); }, [engine, lease, card]);
  if (!card) return null;
  const key = card.type === "object" ? `object:${card.kind}` : card.type;
  const Body = composition.cards.find(registration => registration.kind === key)?.Body;
  return Body ? <Body cardId={lease.cardId} workspace={workspace} engine={engine} /> : <div className="body card-preview">{card.text}</div>;
}

export function CardPortals({ workspace, engine, composition }: {
  readonly workspace: Workspace;
  readonly engine: CanvasEngine;
  readonly composition: Composition;
}) {
  const leases = useSyncExternalStore(engine.leases.subscribe, engine.leases.getSnapshot);
  return leases.map(lease => createPortal(<LeaseBody lease={lease} workspace={workspace} engine={engine} composition={composition} />, lease.host, lease.key));
}
