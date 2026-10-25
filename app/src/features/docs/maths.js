import { Node, InputRule } from '@tiptap/core';
import katex from 'katex';

export function mathsHTML(latex, block = false) {
  return katex.renderToString(String(latex), { displayMode: block, throwOnError: false, trust: false, strict: 'ignore', output: 'htmlAndMathml' });
}

const maths = block => Node.create({
  name: block ? 'blockMath' : 'inlineMath',
  group: block ? 'block' : 'inline', inline: !block, atom: true,
  addAttributes: () => ({ latex: { default: '', parseHTML: el => el.getAttribute('data-latex'), renderHTML: attrs => ({ 'data-latex': attrs.latex }) } }),
  parseHTML() { return [{ tag: `${block ? 'div' : 'span'}[data-type="${this.name}"]` }]; },
  renderHTML({ node }) {
    const dom = document.createElement(block ? 'div' : 'span');
    dom.dataset.type = this.name; dom.dataset.latex = node.attrs.latex;
    dom.className = `docs-math${block ? ' docs-math-block' : ''}`;
    dom.innerHTML = mathsHTML(node.attrs.latex, block); return dom;
  },
  renderText({ node }) { return `${block ? '$$' : '$'}${node.attrs.latex}${block ? '$$' : '$'}`; },
  addInputRules() {
    return [new InputRule({
      find: block ? /^\$\$([^$]+)\$\$$/ : /(?<![$\\])\$(?!\$)([^$\n]+)\$$/,
      handler: ({ state, range, match }) => {
        const node = this.type.create({ latex: match[1] });
        if (block) state.tr.replaceWith(state.doc.resolve(range.from).before(), range.to, node);
        else state.tr.replaceWith(range.from, range.to, node);
      },
    })];
  },
  addNodeView() {
    return ({ node: initial, editor, getPos }) => {
      let node = initial, source;
      const dom = document.createElement(block ? 'div' : 'span');
      dom.className = `docs-math${block ? ' docs-math-block' : ''}`; dom.contentEditable = 'false'; dom.dataset.type = this.name;
      dom.tabIndex = 0; dom.setAttribute('role', 'button');
      const render = () => {
        dom.dataset.latex = node.attrs.latex;
        dom.setAttribute('aria-label', `${block ? 'Block' : 'Inline'} maths: ${node.attrs.latex}. Click or press Enter to edit LaTeX`);
        dom.innerHTML = mathsHTML(node.attrs.latex, block);
      };
      const edit = () => {
        if (source) return;
        source = document.createElement(block ? 'textarea' : 'input');
        source.className = 'docs-math-source'; source.setAttribute('aria-label', 'LaTeX source'); source.value = node.attrs.latex;
        dom.replaceChildren(source);
        source.onblur = () => {
          const latex = source.value, pos = getPos(); source = null;
          if (!editor.isDestroyed && typeof pos === 'number' && latex !== node.attrs.latex) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { latex }));
          render();
        };
        source.onkeydown = event => {
          if (event.key === 'Escape' || (!block && event.key === 'Enter')) { event.preventDefault(); event.stopPropagation(); source.blur(); editor.commands.focus(); }
        };
        source.focus(); source.select();
      };
      dom.onclick = edit;
      dom.onkeydown = event => { if (!source && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); edit(); } };
      render();
      return { dom, stopEvent: () => true, ignoreMutation: () => true, update(updated) { if (updated.type !== node.type) return false; node = updated; if (!source) render(); return true; } };
    };
  },
});

export const InlineMath = maths(false), BlockMath = maths(true);
