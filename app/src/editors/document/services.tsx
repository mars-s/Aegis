import { createContext, useContext } from "react";
import type { ComponentType, ReactNode } from "react";
import type { BoardId, CardId, Card, RichNode } from "@aegis/domain";
import type { FeatureContext } from "../../composition.js";
import { DocumentCopyNotice } from "./copy-notice.js";

export interface RewriteRequest {
  readonly text: string;
  readonly how: string;
  readonly title: string;
  readonly around: string;
  readonly boardId: BoardId;
  readonly cardId: CardId;
}

export interface DocumentServices {
  readonly assetUrl?: (source: string) => string;
  readonly rewrite?: (
    request: RewriteRequest,
    signal: AbortSignal,
    onDelta?: (delta: string) => void,
  ) => Promise<string>;
  readonly printHtml?: (html: string) => Promise<boolean>;
  readonly saveFile?: (blob: Blob, name: string) => Promise<void>;
  readonly openUrl?: (url: string) => void;
  readonly ReferenceChart?: ComponentType<{
    readonly card: Extract<Card, { kind: "plot" }>;
    readonly cards: readonly Card[];
  }>;
  readonly context?: FeatureContext;
  readonly editorActions?: ReactNode;
}

const Services = createContext<DocumentServices>({});

export function DocumentProvider({
  services,
  children,
}: {
  readonly services: DocumentServices;
  readonly children: ReactNode;
}) {
  return (
    <Services value={services}>
      {children}
      {services.context ? (
        <DocumentCopyNotice workspace={services.context.workspace} />
      ) : null}
    </Services>
  );
}

export const useDocumentServices = () => useContext(Services);

export interface ExportDocument {
  readonly json: RichNode;
  readonly html: string;
  readonly title: string;
  readonly paper: "a4" | "letter";
}
