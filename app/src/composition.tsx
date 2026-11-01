import type { Card, CardId, ObjectCard } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
import type { ComponentType } from "react";
import type { FeatureWorkspace } from "./workspace/index.js";
import { CanvasBody } from "./chrome/CanvasDoor.js";
import { creativeCards } from "./cards/creative/index.js";
import { basicRegistrations, NoteBody } from "./cards/basic/index.js";
import { objectRegistrations } from "./cards/objects/index.js";
import type { ObjectServices } from "./cards/objects/index.js";
import { documentCard, documentEditor, documentOpenAction } from "./cards/document/registration.js";
import { deckCards, deckEditors } from "./cards/deck/index.js";
import type { DeckServices } from "./cards/deck/index.js";
import { editingMenus } from "./features/editing/registration.js";
import { dataCards, dataEditors } from "./cards/data/index.js";
import type { DataServices } from "./cards/data/index.js";
import type { CardBodyProps } from "./canvas/CardPortals.js";
export type { CardBodyProps } from "./canvas/CardPortals.js";

export type CardBodyKind = Exclude<Card["type"], "object"> | `object:${ObjectCard["kind"]}`;
export type { FeatureWorkspace } from "./workspace/index.js";
export interface FeatureContext {
  readonly workspace: FeatureWorkspace;
  readonly engine: () => CanvasEngine | null;
  readonly openEditor: (id: CardId, full?: boolean, keyboard?: boolean) => boolean;
  readonly closeEditor: () => boolean;
  readonly closeEditorAsync?: () => Promise<boolean>;
  readonly prepare?: () => Promise<boolean>;
}
export interface CardRegistration {
  readonly kind: CardBodyKind;
  readonly Body: ComponentType<CardBodyProps>;
}
export interface ActionRegistration {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly run: (context: FeatureContext) => void;
}
export interface PanelRegistration {
  readonly id: string;
  readonly label?: string;
  readonly side: "left" | "right";
  readonly Body: ComponentType<{ readonly context: FeatureContext }>;
}
export interface EditorRegistration {
  readonly kind: CardBodyKind;
  readonly Body: ComponentType<CardBodyProps>;
  readonly flush: (context: FeatureContext, id: CardId) => boolean;
  readonly prepare?: (context: FeatureContext, id: CardId, signal: AbortSignal) => Promise<boolean>;
}
export interface Composition {
  readonly cards: readonly CardRegistration[];
  readonly tools: readonly ActionRegistration[];
  readonly panels: readonly PanelRegistration[];
  readonly menus: readonly ActionRegistration[];
  readonly editors: readonly EditorRegistration[];
}

export function defineComposition(composition: Composition): Composition {
  const groups = [composition.cards.map(item => item.kind), composition.tools.map(item => item.id), composition.panels.map(item => item.id), composition.menus.map(item => item.id), composition.editors.map(item => item.kind)];
  for (const ids of groups) {
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate feature registration");
  }
  return Object.freeze({
    cards: Object.freeze(composition.cards.map(item => Object.freeze({ ...item }))),
    tools: Object.freeze(composition.tools.map(item => Object.freeze({ ...item }))),
    panels: Object.freeze(composition.panels.map(item => Object.freeze({ ...item }))),
    menus: Object.freeze(composition.menus.map(item => Object.freeze({ ...item }))),
    editors: Object.freeze(composition.editors.map(item => Object.freeze({ ...item }))),
  });
}

/** Explicit seam for future AI-built chrome. Card bodies and editors remain independent. */
export const canvasExtensions: Pick<Composition, "tools" | "panels"> = Object.freeze({ tools: Object.freeze([]), panels: Object.freeze([]) });

export function createComposition(services: Pick<DataServices, "assetUrl"> & Pick<DeckServices, "menu"> & Pick<ObjectServices, "registerSandbox">): Composition {
  const objects = objectRegistrations(services);
  return defineComposition({
    cards: [{ kind: "canvas", Body: CanvasBody }, { kind: "agent", Body: NoteBody }, ...basicRegistrations(services).filter(item => !creativeCards.some(creative => creative.kind === item.kind)), ...creativeCards, ...dataCards, ...objects.cards, documentCard, ...deckCards(services)],
    tools: canvasExtensions.tools, panels: canvasExtensions.panels,
    menus: [...editingMenus, documentOpenAction],
    editors: [...dataEditors(services), ...objects.editors, documentEditor, ...deckEditors(services)],
  });
}
