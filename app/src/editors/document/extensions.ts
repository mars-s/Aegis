// Ported from Mochiboard, MIT, (c) 2026 Jessa Wolfe. See LICENSE.mochiboard.
import { Extension, InputRule, Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { InlineMath, BlockMath } from "./maths.js";

const ParagraphStyle = Extension.create({
  name: "paragraphStyle",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          kind: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-kind"),
            renderHTML: (attributes) =>
              typeof attributes.kind === "string"
                ? { "data-kind": attributes.kind }
                : {},
          },
        },
      },
    ];
  },
});

const script = (name: "superscript" | "subscript", tag: "sup" | "sub") =>
  Mark.create({
    name,
    excludes: name === "superscript" ? "subscript" : "superscript",
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) => [
      tag,
      mergeAttributes(HTMLAttributes),
      0,
    ],
  });

const MarkdownWriting = Extension.create({
  name: "markdownWriting",
  priority: 1000,
  addInputRules() {
    return [
      new InputRule({
        find: /^\[( |x|X)\]\s$/,
        handler: ({ range, match, chain }) => {
          chain()
            .deleteRange(range)
            .toggleTaskList()
            .updateAttributes("taskItem", {
              checked: match[1]?.toLowerCase() === "x",
            })
            .run();
        },
      }),
      new InputRule({
        find: /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/,
        handler: ({ state, range, match }) => {
          const label = match[1],
            href = match[2],
            link = state.schema.marks.link;
          if (label && href && link)
            state.tr
              .insertText(label, range.from, range.to)
              .addMark(
                range.from,
                range.from + label.length,
                link.create({ href }),
              )
              .removeStoredMark(link);
        },
      }),
    ];
  },
});

export function createExtensions(
  assetUrl: (source: string) => string = (source) => source,
) {
  const AssetImage = Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        src: {
          default: null,
          parseHTML: (element) =>
            element.getAttribute("data-asset-src") ||
            element.getAttribute("src"),
          renderHTML: (attributes) => {
            const source: unknown = attributes.src;
            return typeof source === "string" && source.startsWith("asset:")
              ? { src: assetUrl(source), "data-asset-src": source }
              : { src: typeof source === "string" ? source : "" };
          },
        },
      };
    },
  });
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false },
    }),
    TextStyleKit.configure({ lineHeight: { types: ["paragraph", "heading"] } }),
    ParagraphStyle,
    script("superscript", "sup"),
    script("subscript", "sub"),
    TableKit.configure({ table: { resizable: true } }),
    TextAlign.configure({ types: ["paragraph", "heading"] }),
    Highlight.configure({ multicolor: true }),
    AssetImage.configure({ allowBase64: true }),
    TaskList,
    TaskItem.configure({
      nested: true,
      HTMLAttributes: { "data-type": "taskItem" },
    }),
    InlineMath,
    BlockMath,
    MarkdownWriting,
    Placeholder.configure({ placeholder: "Start writing…" }),
    CharacterCount,
  ];
}
