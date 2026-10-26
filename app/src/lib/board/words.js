import { markdownDocument } from './markdown.js';
import { migrateTitle } from './document.js';

// Count visible text tokens containing a letter or number. Formatting does not split a word.
// Maths, images and other embedded leaves count as zero and separate neighbouring words.
// Captions and table cells count when they contain ordinary document text nodes.
export function wordCount(doc) {
  const read = node => {
    if (node.type === 'text') return node.text || '';
    if (!node.content || node.type === 'hardBreak') return ' ';
    const body = node.content.map(read).join('');
    return ['paragraph', 'heading', 'codeBlock', 'tableCell', 'tableHeader'].includes(node.type) ? body + ' ' : body;
  };
  return read(doc).split(/\s+/u).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
}
export function documentContent(card) {
  const props = card.props || {}, doc = props.doc || markdownDocument(props.body);
  return props.docTitleMigrated ? doc : migrateTitle(doc, card.text);
}
export const documentWordCount = card => wordCount(documentContent(card));

export const wordCountLabel = words => `${words.toLocaleString('en-AU')} word${words === 1 ? '' : 's'}`;
