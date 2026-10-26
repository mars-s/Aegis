// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
export { escapeHTML, markdownHTML } from '../../lib/board/markdown.js';
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
    case 'doc': return [...title(card.text), ...((p.docTitleMigrated ? p.doc : migrateTitle(p.doc, card.text))?.content ?? String(p.body ?? '').split('\n').map(paragraph))];
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

export { plainText, migrateTitle } from '../../lib/board/document.js';
import { plainText, migrateTitle } from '../../lib/board/document.js';
export function documentUpdate(id, doc) {
  return { op: 'update', id, set: { props: { doc, body: plainText(doc).trim(), docTitleMigrated: true } } };
}

