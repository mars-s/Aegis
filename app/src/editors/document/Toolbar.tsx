import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Editor } from "@tiptap/core";
import type { Board, RichNode } from "@aegis/domain";
import { z } from "zod/v4";
import { Choice, ColourChoice, Disclosure, FontChoice } from "./controls.js";
import { DocumentIcon } from "./Icon.js";

const TextStyle = z.object({
  fontFamily: z.string().nullish(),
  fontSize: z.string().nullish(),
});
const BlockStyle = z.object({
  level: z.number().optional(),
  kind: z.string().nullish(),
  textAlign: z.string().nullish(),
});
const BLOCKS = [
  ["body", "Body"],
  ["title", "Title"],
  ["heading", "Heading"],
  ["sub", "Subheading"],
  ["lead", "Lead"],
  ["caption", "Caption"],
  ["quote", "Quote"],
  ["code", "Code"],
] as const;
const ALIGNS = [
  ["left", "Left"],
  ["center", "Centre"],
  ["right", "Right"],
  ["justify", "Justified"],
] as const;
const REWRITES = [
  ["", "Rewrite"] as const,
  ...[
    "Shorter",
    "Clearer",
    "Friendlier",
    "More confident",
    "More professional",
    "Fix spelling & grammar",
    "Into bullet points",
    "Custom instruction",
  ].map((value) => [value, value] as const),
];

export function useEditorState(editor: Editor) {
  return useSyncExternalStore(
    (listener) => {
      let active = true,
        pending = false;
      const changed = () => {
        if (pending) return;
        pending = true;
        queueMicrotask(() => {
          pending = false;
          if (active) listener();
        });
      };
      editor.on("transaction", changed);
      return () => {
        active = false;
        editor.off("transaction", changed);
      };
    },
    () => editor.state,
  );
}

function Tool({
  label,
  run,
  pressed,
  disabled = false,
}: {
  readonly label: string;
  readonly run: () => void;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="ribbon-btn"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onClick={run}
    >
      <DocumentIcon name={label} />
      <span className="docs-tool-label">{label}</span>
    </button>
  );
}

export function Toolbar({
  editor,
  image,
  rewrite,
  busy,
  board,
  editLink,
  compact = false,
}: {
  readonly editor: Editor;
  readonly image: () => void;
  readonly rewrite: (how: string) => void;
  readonly busy: boolean;
  readonly board: () => Board;
  readonly editLink: () => void;
  readonly compact?: boolean;
}) {
  useEditorState(editor);
  const [instruction, setInstruction] = useState<string | null>(null);
  const fonts = useMemo(() => {
    const found = new Set<string>();
    const collect = (node: RichNode) => {
      for (const mark of node.marks ?? [])
        if (typeof mark.attrs?.fontFamily === "string")
          found.add(mark.attrs.fontFamily);
      for (const child of node.content ?? []) collect(child);
    };
    for (const card of board().cards) {
      if (card.props?.doc) collect(card.props.doc);
      if (typeof card.props?.font === "string") found.add(card.props.font);
    }
    return [...found];
  }, [board]);
  const style = TextStyle.parse(editor.getAttributes("textStyle"));
  const heading = BlockStyle.parse(editor.getAttributes("heading")),
    paragraph = BlockStyle.parse(editor.getAttributes("paragraph"));
  const size = parseFloat(style.fontSize ?? "") || 18;
  const sizeField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (sizeField.current && document.activeElement !== sizeField.current)
      sizeField.current.value = String(size);
  }, [size]);
  const active = editor.isActive("heading")
    ? heading.level === 1
      ? "title"
      : heading.level === 2
        ? "heading"
        : "sub"
    : editor.isActive("blockquote")
      ? "quote"
      : editor.isActive("codeBlock")
        ? "code"
        : (paragraph.kind ?? "body");
  const chooseBlock = (value: string) => {
    let chain = editor.chain().clearNodes();
    if (value === "title" || value === "heading" || value === "sub")
      chain = chain.setHeading({
        level: value === "title" ? 1 : value === "heading" ? 2 : 3,
      });
    else if (value === "quote") chain = chain.setBlockquote();
    else if (value === "code") chain = chain.setCodeBlock();
    else
      chain = chain
        .setParagraph()
        .updateAttributes("paragraph", {
          kind: value === "lead" || value === "caption" ? value : null,
        });
    chain.run();
  };
  const inline = (
    <>
      <Tool
        label="Bold"
        pressed={editor.isActive("bold")}
        run={() => {
          editor.chain().focus().toggleBold().run();
        }}
      />
      <Tool
        label="Italic"
        pressed={editor.isActive("italic")}
        run={() => {
          editor.chain().focus().toggleItalic().run();
        }}
      />
    </>
  );
  const advanced = (
    <>
      <Tool
        label="Underline"
        pressed={editor.isActive("underline")}
        run={() => {
          editor.chain().focus().toggleUnderline().run();
        }}
      />
      <Tool
        label="Strikethrough"
        pressed={editor.isActive("strike")}
        run={() => {
          editor.chain().focus().toggleStrike().run();
        }}
      />
      <Tool label="Link" pressed={editor.isActive("link")} run={editLink} />
    </>
  );
  const rewriteChoice = (
    <span className="ribbon-ai" aria-busy={busy}>
      <Choice
        label="Rewrite selection"
        value=""
        options={REWRITES}
        orb
        change={(how) => {
          if (how === "Custom instruction") setInstruction("");
          else if (how) rewrite(how);
        }}
      />
    </span>
  );
  return (
    <>
      {!compact ? (
        <div className="ribbon-group">
          <Choice
            label="Block style"
            value={active}
            options={BLOCKS}
            change={chooseBlock}
          />
        </div>
      ) : null}
      <div className="ribbon-group">
        {inline}
        {compact ? advanced : null}
      </div>
      {!compact ? (
        <>
          <div className="ribbon-group">
            <Tool
              label="Bullet list"
              pressed={editor.isActive("bulletList")}
              run={() => {
                editor.chain().focus().toggleBulletList().run();
              }}
            />
            <Tool
              label="Numbered list"
              pressed={editor.isActive("orderedList")}
              run={() => {
                editor.chain().focus().toggleOrderedList().run();
              }}
            />
            <Tool
              label="Task list"
              pressed={editor.isActive("taskList")}
              run={() => {
                editor.chain().focus().toggleTaskList().run();
              }}
            />
          </div>
          <Disclosure label="Insert document" name="docs-insert">
            <div className="ribbon-group docs-insert-group">
              <Tool label="Insert image" run={image} />
              <Tool
                label="Insert table"
                run={() => {
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run();
                }}
              />
              <Tool
                label="Divider"
                run={() => {
                  editor.chain().focus().setHorizontalRule().run();
                }}
              />
            </div>
          </Disclosure>
        </>
      ) : null}
      {rewriteChoice}
      {!compact ? (
        <Disclosure label="Format document" name="docs-format">
          <div className="ribbon-group">
            <FontChoice
              font={style.fontFamily ?? "Inter Variable"}
              extra={fonts}
              change={(font) => {
                editor.chain().setFontFamily(font).run();
              }}
            />
            <input
              ref={sizeField}
              aria-label="Font size"
              type="number"
              min="6"
              max="200"
              defaultValue={size}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (value >= 6 && value <= 200)
                  editor.chain().setFontSize(`${value}px`).run();
              }}
            />
          </div>
          <div className="ribbon-group">
            {advanced}
            <ColourChoice
              label="Text colour"
              colour="#25252b"
              board={board}
              change={(value) => {
                editor.chain().setColor(value).run();
              }}
            />
            <ColourChoice
              label="Highlight"
              colour="#fff1a8"
              board={board}
              change={(value) => {
                editor.chain().setHighlight({ color: value }).run();
              }}
            />
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().unsetColor().unsetHighlight().run();
              }}
            >
              Reset colours
            </button>
            <Choice
              label="Text alignment"
              value={paragraph.textAlign ?? heading.textAlign ?? "left"}
              options={ALIGNS}
              change={(value) => {
                editor.chain().setTextAlign(value).run();
              }}
            />
            <Tool
              label="Clear formatting"
              run={() => {
                editor.chain().focus().unsetAllMarks().clearNodes().run();
              }}
            />
            <Choice
              label="More formatting"
              value=""
              options={[
                ["", "More"],
                ["1", "Single spacing"],
                ["1.15", "1.15 spacing"],
                ["1.5", "1.5 spacing"],
                ["2", "Double spacing"],
                ["superscript", "Superscript"],
                ["subscript", "Subscript"],
              ]}
              change={(value) => {
                if (value === "superscript" || value === "subscript")
                  editor.chain().toggleMark(value).run();
                else if (value)
                  editor
                    .chain()
                    .updateAttributes(
                      editor.isActive("heading") ? "heading" : "paragraph",
                      { lineHeight: value },
                    )
                    .run();
              }}
            />
          </div>
          <div
            className="ribbon-group docs-table-tools"
            hidden={!editor.isActive("table")}
          >
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().addRowAfter().run();
              }}
            >
              Add row
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().deleteRow().run();
              }}
            >
              Remove row
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().addColumnAfter().run();
              }}
            >
              Add column
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().deleteColumn().run();
              }}
            >
              Remove column
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleHeaderRow().run();
              }}
            >
              Header row
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().deleteTable().run();
              }}
            >
              Delete table
            </button>
          </div>
          <div className="ribbon-group">
            <Tool
              label="Undo"
              disabled={!editor.can().undo()}
              run={() => {
                editor.chain().focus().undo().run();
              }}
            />
            <Tool
              label="Redo"
              disabled={!editor.can().redo()}
              run={() => {
                editor.chain().focus().redo().run();
              }}
            />
          </div>
        </Disclosure>
      ) : null}
      {instruction !== null ? (
        <form
          className="docs-link-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (instruction.trim()) rewrite(instruction);
            setInstruction(null);
          }}
        >
          <input
            aria-label="Rewrite instruction"
            autoFocus
            value={instruction}
            onChange={(event) => setInstruction(event.currentTarget.value)}
          />
          <button type="submit">Rewrite</button>
          <button type="button" onClick={() => setInstruction(null)}>
            Cancel rewrite
          </button>
        </form>
      ) : null}
    </>
  );
}
