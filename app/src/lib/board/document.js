export function plainText(node) {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'inlineMath') return `$${node.attrs?.latex ?? ''}$`;
  if (node.type === 'blockMath') return `$$${node.attrs?.latex ?? ''}$$`;
  if (node.type === 'hardBreak') return '\n';
  const join = ['paragraph', 'heading'].includes(node.type) ? '' : '\n';
  return (node.content ?? []).map(plainText).join(join).replace(/\n{3,}/g, '\n\n');
}

export function migrateTitle(doc, title) {
  const first = doc?.content?.[0];
  if (first?.type !== 'heading' || first.attrs?.level !== 1 || plainText(first).trim() !== String(title ?? '').trim()) return doc;
  return { ...doc, content: doc.content.length > 1 ? doc.content.slice(1) : [{ type: 'paragraph' }] };
}

// Canonicalise while applying the original batch, before persistence and request history.
// Rendering a document must never create a second, person-authored transaction.
export function normaliseDocument(card) {
  const props = card.props;
  if (card.type !== 'doc' || !props || props.docTitleMigrated) return;
  if (props.doc?.type === 'doc') {
    props.doc = migrateTitle(props.doc, card.text);
    props.body = plainText(props.doc).trim();
  } else if (typeof props.body === 'string') {
    const heading = /^#\s+([^\r\n]+)(?:\r?\n|$)/.exec(props.body);
    if (heading?.[1].trim() === card.text.trim()) props.body = props.body.slice(heading[0].length).trimStart();
  }
  props.docTitleMigrated = true;
}
