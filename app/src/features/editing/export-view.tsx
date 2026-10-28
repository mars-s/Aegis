import { createContext, useContext, useEffect } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Board, Card } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
import type { Composition } from "../../composition.js";
import { createWorkspace } from "../../workspace/index.js";

const ExportView = createContext(false);
export const useExportView = () => useContext(ExportView);
function Ready({
  children,
  ready,
}: {
  readonly children: ReactNode;
  readonly ready: () => void;
}) {
  useEffect(ready, [ready]);
  return children;
}
/** The temporary store is a read-only export snapshot. It has no host connection or live camera. */
export function createExportRenderer({
  board,
  composition,
  engine,
}: {
  readonly board: Board;
  readonly composition: Composition;
  readonly engine: CanvasEngine;
}) {
  const snapshot = createWorkspace({ board });
  const roots = new Set<() => void>();
  return {
    async renderCard(card: Card) {
      const key = card.type === "object" ? `object:${card.kind}` : card.type;
      const Body = composition.cards.find(
        (registration) => registration.kind === key,
      )?.Body;
      if (!Body) throw new Error(`This ${card.type} cannot be exported yet`);
      const holder = document.createElement("div"),
        element = document.createElement("div"),
        host = document.createElement("div");
      holder.className = "editing-export react-stage";
      Object.assign(holder.style, {
        position: "fixed",
        left: "-100000px",
        top: "0",
        width: `${card.w}px`,
        height: `${card.h}px`,
        overflow: "visible",
        pointerEvents: "none",
      });
      element.className = `card scene-card ${card.type}${card.type === "object" ? ` kind-${card.kind}` : ""}`;
      element.dataset.id = card.id;
      element.dataset.type = card.type;
      element.dataset.fixedHeight = String(!!card.props?.fixedHeight);
      Object.assign(element.style, {
        position: "relative",
        width: `${card.w}px`,
        height: `${card.h}px`,
      });
      host.className = "content scene-body";
      host.style.blockSize = "100%";
      element.append(host);
      holder.append(element);
      holder.inert = true;
      document.body.append(holder);
      let fail: (cause: unknown) => void = () => {};
      const root = createRoot(host, {
        onUncaughtError: (cause) => fail(cause),
      });
      const dispose = () => {
        roots.delete(dispose);
        root.unmount();
        holder.remove();
      };
      roots.add(dispose);
      try {
        await new Promise<void>((resolve, reject) => {
          fail = reject;
          root.render(
            <ExportView value>
              <Ready ready={resolve}>
                <Body cardId={card.id} workspace={snapshot} engine={engine} />
              </Ready>
            </ExportView>,
          );
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        return { element, dispose };
      } catch (cause) {
        dispose();
        throw cause;
      }
    },
    dispose() {
      for (const dispose of [...roots]) dispose();
      snapshot.dispose();
    },
  };
}
