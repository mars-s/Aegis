import { Node, InputRule } from "@tiptap/core";
import katex from "katex";
import { z } from "zod/v4";

const MathsAttributes = z.object({ latex: z.string().default("") });
export function mathsHTML(latex: string, block = false): string {
  return katex.renderToString(latex, {
    displayMode: block,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    output: "htmlAndMathml",
  });
}

const maths = (block: boolean) =>
  Node.create({
    name: block ? "blockMath" : "inlineMath",
    group: block ? "block" : "inline",
    inline: !block,
    atom: true,
    addAttributes: () => ({
      latex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-latex"),
        renderHTML: (attributes) => ({
          "data-latex": MathsAttributes.parse(attributes).latex,
        }),
      },
    }),
    parseHTML() {
      return [{ tag: `${block ? "div" : "span"}[data-type="${this.name}"]` }];
    },
    renderHTML({ node }) {
      const latex = MathsAttributes.parse(node.attrs).latex;
      const dom = document.createElement(block ? "div" : "span");
      dom.dataset.type = this.name;
      dom.dataset.latex = latex;
      dom.className = `docs-math${block ? " docs-math-block" : ""}`;
      dom.innerHTML = mathsHTML(latex, block);
      return dom;
    },
    renderText: ({ node }) =>
      `${block ? "$$" : "$"}${MathsAttributes.parse(node.attrs).latex}${block ? "$$" : "$"}`,
    addInputRules() {
      return [
        new InputRule({
          find: block ? /^\$\$([^$]+)\$\$$/ : /(?<![$\\])\$(?!\$)([^$\n]+)\$$/,
          handler: ({ state, range, match }) => {
            const node = this.type.create({ latex: match[1] ?? "" });
            if (block)
              state.tr.replaceWith(
                state.doc.resolve(range.from).before(),
                range.to,
                node,
              );
            else state.tr.replaceWith(range.from, range.to, node);
          },
        }),
      ];
    },
    addNodeView() {
      return ({ node: initial, editor, getPos }) => {
        let node = initial;
        let source: HTMLInputElement | HTMLTextAreaElement | null = null;
        const dom = document.createElement(block ? "div" : "span");
        dom.className = `docs-math${block ? " docs-math-block" : ""}`;
        dom.contentEditable = "false";
        dom.dataset.type = this.name;
        dom.tabIndex = 0;
        dom.setAttribute("role", "button");
        const render = () => {
          const latex = MathsAttributes.parse(node.attrs).latex;
          dom.dataset.latex = latex;
          dom.setAttribute(
            "aria-label",
            `${block ? "Block" : "Inline"} maths: ${latex}. Click or press Enter to edit LaTeX`,
          );
          dom.innerHTML = mathsHTML(latex, block);
        };
        const edit = () => {
          if (source) return;
          const field = document.createElement(block ? "textarea" : "input");
          source = field;
          field.className = "docs-math-source";
          field.setAttribute("aria-label", "LaTeX source");
          field.value = MathsAttributes.parse(node.attrs).latex;
          dom.replaceChildren(field);
          field.onblur = () => {
            const latex = field.value,
              pos = getPos();
            source = null;
            if (
              !editor.isDestroyed &&
              typeof pos === "number" &&
              latex !== MathsAttributes.parse(node.attrs).latex
            )
              editor.view.dispatch(
                editor.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  latex,
                }),
              );
            if (!editor.isDestroyed) render();
          };
          field.onkeydown = (event) => {
            if (event.key === "Escape" || (!block && event.key === "Enter")) {
              event.preventDefault();
              event.stopPropagation();
              field.blur();
              editor.view.focus();
            }
          };
          field.focus();
          field.select();
        };
        dom.onclick = edit;
        dom.onkeydown = (event) => {
          if (!source && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            edit();
          }
        };
        render();
        return {
          dom,
          stopEvent: () => true,
          ignoreMutation: () => true,
          update(updated) {
            if (updated.type !== node.type) return false;
            node = updated;
            if (!source) render();
            return true;
          },
          destroy() {
            if (source) source.onblur = null;
            dom.onclick = null;
            dom.onkeydown = null;
          },
        };
      };
    },
  });

export const InlineMath = maths(false),
  BlockMath = maths(true);
