import {RichNodeSchema} from './schema.js';
import type {RichNode, RichMark} from './schema.js';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// The editor and document summaries parse the same supported Markdown grammar.
export const escapeHTML = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] ?? ch));
const text = (value: string): RichNode[] => value ? [{ type: 'text', text: value }] : [];
const paragraph = (content: RichNode[]): RichNode => ({ type: 'paragraph', content });
function inline(src: string): RichNode[] {
  const tokens = /\\([\\`*$[\]])|`([^`]+)`|\$([^$\n]+)\$|\[([^\]]+)\]\(([^\s)]+)\)|\*\*(.+?)\*\*|\*([^*]+)\*/g;
  const content: RichNode[] = []; let end = 0;
  const marked = (value: string, mark: RichMark): RichNode[] => inline(value).map(node => node.type === 'text' ? RichNodeSchema.parse({ ...node, marks: [...(node.marks || []), mark] }) : node);
  for (const m of src.matchAll(tokens)) {
    content.push(...text(src.slice(end, m.index))); end = m.index + m[0].length;
    if (m[1]) content.push(...text(m[1]));
    else if (m[2]) content.push({ type: 'text', text: m[2], marks: [{ type: 'code' }] });
    else if (m[3]) content.push({ type: 'inlineMath', attrs: { latex: m[3] } });
    else if (m[4]) content.push(...(/^(https?:|mailto:|\/|#)/i.test(m[5] ?? '') ? marked(m[4], { type: 'link', attrs: { href: m[5] ?? '' } }) : text(m[4])));
    else content.push(...marked(m[6] || m[7] || '', { type: m[6] ? 'bold' : 'italic' }));
  }
  content.push(...text(src.slice(end))); return content;
}
export function markdownDocument(src: unknown): RichNode {
  const lines = String(src || '').replace(/\r/g, '').split('\n'), content: RichNode[] = []; let list: RichNode | null = null;
  const open = (type: string): RichNode[] => {
    if (list?.type !== type) { list = { type, content: [] }; content.push(list); }
    return list.content ?? [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trimEnd(); let m;
    if (!line.trim()) { list = null; continue; }
    if ((m = line.match(/^\s*```([^`]*)$/))) {
      list = null; const code = [], language = (m[1] ?? '').trim().split(/\s/)[0] || null;
      while (++i < lines.length && !/^\s*```\s*$/.test((lines[i] ?? ''))) code.push((lines[i] ?? ''));
      content.push({ type: 'codeBlock', attrs: { language }, content: text(code.join('\n')) });
    } else if (line.startsWith('$$')) {
      list = null; let latex = line.slice(2);
      if (!latex.endsWith('$$') || !latex) {
        const maths = [latex]; while (++i < lines.length && !(lines[i] ?? '').includes('$$')) maths.push((lines[i] ?? ''));
        if (i < lines.length) maths.push((lines[i] ?? '').slice(0, (lines[i] ?? '').indexOf('$$')));
        else { content.push(paragraph(text('$$' + maths.join('\n')))); continue; }
        latex = maths.join('\n');
      } else latex = latex.slice(0, -2);
      content.push({ type: 'blockMath', attrs: { latex: latex.trim() } });
    } else if ((m = line.match(/^(#{1,3})\s+(.*)/))) {
      list = null; content.push({ type: 'heading', attrs: { level: (m[1] ?? '').length }, content: inline(m[2] ?? '') });
    } else if ((m = line.match(/^\s*(?:(?:[-*]\s+)?\[( |x|X)\]|([☐☑]))\s*(.*)/))) {
      open('taskList').push({ type: 'taskItem', attrs: { checked: (m[1] || '').toLowerCase() === 'x' || m[2] === '☑' }, content: [paragraph(inline(m[3] ?? ''))] });
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) open('bulletList').push({ type: 'listItem', content: [paragraph(inline(m[1] ?? ''))] });
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) open('orderedList').push({ type: 'listItem', content: [paragraph(inline(m[1] ?? ''))] });
    else if ((m = line.match(/^>\s?(.*)/))) { list = null; content.push({ type: 'blockquote', content: [paragraph(inline(m[1] ?? ''))] }); }
    else if (/^(-{3,}|\*{3,})$/.test(line.trim())) { list = null; content.push({ type: 'horizontalRule' }); }
    else { list = null; content.push(paragraph(inline(line))); }
  }
  return { type: 'doc', content: content.length ? content : [paragraph([])] };
}
export function markdownHTML(src: unknown): string {
  const esc = escapeHTML;
  const render = (node: RichNode): string => {
    if (node.type === 'text') {
      let html = esc(node.text);
      for (const mark of node.marks || []) {
        const tags: Record<string, string> = { bold: 'strong', italic: 'em', code: 'code', link: 'a' };
        const tag = tags[mark.type];
        html = `<${tag}${mark.type === 'link' ? ` href="${esc(mark.attrs?.href)}"` : ''}>${html}</${tag}>`;
      }
      return html;
    }
    if (node.type === 'inlineMath' || node.type === 'blockMath') {
      const tag = node.type === 'inlineMath' ? 'span' : 'div';
      return `<${tag} data-type="${node.type}" data-latex="${esc(node.attrs?.latex)}"></${tag}>`;
    }
    if (node.type === 'horizontalRule') return '<hr>';
    if (node.type === 'codeBlock') return `<pre><code${node.attrs?.language ? ` class="language-${esc(node.attrs?.language)}"` : ''}>${(node.content ?? []).map(render).join('')}</code></pre>`;
    const tags: Record<string, string> = { doc: '', paragraph: 'p', heading: `h${node.attrs?.level}`, bulletList: 'ul', orderedList: 'ol', taskList: 'ul', taskItem: 'li', listItem: 'li', blockquote: 'blockquote' };
    const tag = tags[node.type];
    const body = (node.content || []).map(render).join('');
    const attrs = node.type === 'taskList' ? ' data-type="taskList"' : node.type === 'taskItem' ? ` data-type="taskItem" data-checked="${node.attrs?.checked}"` : '';
    return tag ? `<${tag}${attrs}>${body}</${tag}>` : body;
  };
  return render(markdownDocument(src));
}
