// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
export const escapeHTML = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const escH = escapeHTML;
export function markdownHTML(src) {
    const inl = s => escH(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>').replace(/`(.+?)`/g, '<code>$1</code>');
    const lines = String(src || '').replace(/\r/g, '').split('\n'); let out = '', list = null;
    const close = () => { if (list) { out += `</${list === 'task' ? 'ul' : list}>`; list = null; } };
    const open = k => { if (list !== k) { close(); out += k === 'task' ? '<ul data-type="taskList">' : `<${k}>`; list = k; } };
    for (const raw of lines) {
      const l = raw.trimEnd(); let m;
      if (!l.trim()) { close(); continue; }
      if ((m = l.match(/^(#{1,3})\s+(.*)/))) { close(); out += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`; }
      else if ((m = l.match(/^\s*(?:(?:[-*]\s+)?\[( |x|X)\]|([☐☑]))\s*(.*)/))) { open('task'); const on = (m[1] || '').toLowerCase() === 'x' || m[2] === '☑'; out += `<li data-type="taskItem" data-checked="${on}"><p>${inl(m[3])}</p></li>`; }
      else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { open('ul'); out += `<li><p>${inl(m[1])}</p></li>`; }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { open('ol'); out += `<li><p>${inl(m[1])}</p></li>`; }
      else if ((m = l.match(/^>\s?(.*)/))) { close(); out += `<blockquote><p>${inl(m[1])}</p></blockquote>`; }
      else if (/^(-{3,}|\*{3,})$/.test(l.trim())) { close(); out += '<hr>'; }
      else { close(); out += `<p>${inl(l)}</p>`; }
    }
    close(); return out || '<p></p>';
  }

export const COPY_TYPES = new Set(['note', 'todo', 'title', 'link', 'swatch', 'doc', 'shape', 'audio', 'spotify']);
const text = value => ({ type: 'text', text: String(value) });
const paragraph = value => ({ type: 'paragraph', content: value ? [text(value)] : [] });

// Cards use Aegis fields. The legacy names also let imported boards keep their words.
export function cardContent(card) {
  const p = card.props ?? {};
  const title = value => value ? [{ type: 'heading', attrs: { level: 2 }, content: [text(value)] }] : [];
  switch (card.type) {
    case 'todo': return [...title(card.text), ...(card.items?.length ? [{ type: 'taskList', content: card.items.map(item => ({ type: 'taskItem', attrs: { checked: !!item.done }, content: [paragraph(item.text ?? item.t)] })) }] : [])];
    case 'title': return title(card.text);
    case 'doc': return [...title(card.text), ...(p.doc?.content ?? String(p.body ?? '').split('\n').map(paragraph))];
    case 'link': {
      const label = p.title || card.text || p.preview?.title || card.title || card.url;
      const description = p.description ?? p.preview?.description ?? p.desc ?? card.desc;
      return [{ type: 'paragraph', content: card.url ? [{ ...text(label), marks: [{ type: 'link', attrs: { href: card.url } }] }] : [] }, ...(description ? [paragraph(description)] : [])];
    }
    case 'audio': return [...title(p.title), ...String(card.text || p.body || '').split('\n').map(paragraph)];
    case 'spotify': return [...title(p.title || card.text || p.preview?.title || card.title), paragraph(p.description ?? p.preview?.description ?? p.desc ?? card.desc ?? '')];
    case 'swatch': {
      const hex = p.hex ?? card.color;
      return [{ type: 'paragraph', content: [ { ...text('■ '), marks: [{ type: 'textStyle', attrs: { color: hex } }] }, text(`${p.label ?? card.text ?? ''} ${hex ?? ''}`.trim())] }];
    }
    default: return [...(card.heading ? title(card.heading) : []), ...String(card.text ?? p.body ?? '').split('\n').map(paragraph)];
  }
}

export function plainText(node) {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const join = ['paragraph', 'heading'].includes(node.type) ? '' : '\n';
  return (node.content ?? []).map(plainText).join(join).replace(/\n{3,}/g, '\n\n');
}
export function documentUpdate(id, doc) {
  return { op: 'update', id, set: { props: { doc, body: plainText(doc).trim() } } };
}
