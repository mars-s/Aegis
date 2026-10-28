import { generateHTML, generateJSON } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { RichNodeSchema } from "@aegis/domain/schema";
import type { Card, CardContent, CardId, RichNode } from "@aegis/domain/schema";
import {
  cardContent,
  COPY_TYPES,
  markdownHTML,
  migrateTitle,
} from "@aegis/domain/content";
import { createExtensions } from "./extensions.js";

export type DocumentCard = Pick<CardContent, "id" | "type" | "text" | "props">;

export function hasDocumentContent(node: RichNode): boolean {
  return (
    !!node.text?.trim() ||
    ["image", "inlineMath", "blockMath", "horizontalRule", "table"].includes(
      node.type,
    ) ||
    !!node.content?.some(hasDocumentContent)
  );
}

export function tiptapContent(node: RichNode): JSONContent {
  return {
    type: node.type,
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.attrs ? { attrs: node.attrs } : {}),
    ...(node.content ? { content: node.content.map(tiptapContent) } : {}),
    ...(node.marks
      ? {
          marks: node.marks.map((mark) => ({
            type: mark.type,
            ...(mark.attrs ? { attrs: mark.attrs } : {}),
          })),
        }
      : {}),
  };
}

export function documentContent(card: DocumentCard): RichNode {
  const doc =
    card.props?.doc ??
    RichNodeSchema.parse(
      generateJSON(markdownHTML(card.props?.body ?? ""), createExtensions()),
    );
  return card.props?.docTitleMigrated
    ? doc
    : (migrateTitle(doc, card.text) ?? doc);
}

export function documentHTML(
  card: DocumentCard,
  assetUrl?: (source: string) => string,
): string {
  return generateHTML(
    tiptapContent(documentContent(card)),
    createExtensions(assetUrl),
  );
}

export function copiedContent(
  cards: readonly Card[],
  destination: CardId,
): RichNode[] {
  return cards
    .filter((card) => card.id !== destination && COPY_TYPES.has(card.type))
    .flatMap((card) => {
      if (card.type === "note" || (card.type === "doc" && !card.props?.doc)) {
        const heading = card.type === "doc" ? card.text : card.heading;
        const body = card.type === "doc" ? card.props?.body : card.text;
        const rich = RichNodeSchema.parse(
          generateJSON(markdownHTML(body ?? ""), createExtensions()),
        );
        return [
          ...(heading
            ? [
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: heading }],
                },
              ]
            : []),
          ...(rich.content ?? []),
        ];
      }
      return cardContent(card);
    });
}
