import { useCallback } from "react";
import { routeLink } from "@aegis/scene";
import type { CanvasEngine } from "@aegis/scene";
import type {
  CardBodyProps,
  Composition,
  FeatureContext,
} from "../composition.js";
import {
  CreativeProvider,
  useCreativeServices,
} from "../features/media/services.js";
import {
  DocumentProvider,
  useDocumentServices,
} from "../editors/document/services.js";
import {
  createExportRenderer,
  exportBoard,
} from "../features/editing/registration.js";
import type { Notify } from "./actions.js";

export function useChromeExports(
  context: FeatureContext,
  engine: CanvasEngine,
  composition: Composition,
  notify: Notify,
) {
  const creative = useCreativeServices(),
    documents = useDocumentServices();
  return useCallback(
    async (selection: boolean, format: "png" | "pdf") => {
      const snapshot = context.workspace.scene.snapshot();
      const renderer = createExportRenderer({
        board: snapshot,
        engine,
        composition: {
          ...composition,
          cards: composition.cards.map((registration) => {
            const Body = registration.Body;
            return {
              ...registration,
              Body: (props: CardBodyProps) => (
                <CreativeProvider
                  services={creative}
                  workspace={props.workspace}
                >
                  <DocumentProvider services={documents}>
                    <Body {...props} />
                  </DocumentProvider>
                </CreativeProvider>
              ),
            };
          }),
        },
      });
      try {
        return await exportBoard(
          {
            workspace: context.workspace,
            notify: (text) => notify({ text }),
            services: {
              assetUrl: creative.assetUrl,
              renderCard: renderer.renderCard,
              linkGeometry: (link, a, b) =>
                engine.linkGeometry().find((item) => item.id === link.id)
                  ?.route ??
                routeLink(
                  link,
                  { x: a.x, y: a.y, width: a.w, height: a.h },
                  { x: b.x, y: b.y, width: b.w, height: b.h },
                  a.rot ?? 0,
                  b.rot ?? 0,
                ),
            },
          },
          selection,
          format,
        );
      } finally {
        renderer.dispose();
      }
    },
    [context, engine, composition, notify, creative, documents],
  );
}
