// Agent replies are short Markdown. Build DOM nodes directly so model text never reaches innerHTML.
// Unclosed markers, common mid-stream, stay as plain text until their partner arrives.
function inline(parent, text) {
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > at) parent.append(text.slice(at, m.index));
    const token = m[0];
    const el = document.createElement(token.startsWith('`') ? 'code' : token.startsWith('**') || token.startsWith('__') ? 'strong' : 'em');
    el.textContent = token.startsWith('**') || token.startsWith('__') ? token.slice(2, -2) : token.slice(1, -1);
    parent.append(el); at = m.index + token.length;
  }
  if (at < text.length) parent.append(text.slice(at));
}

export function renderChatText(container, text) {
  container.replaceChildren();
  for (const block of String(text).split(/\n{2,}/)) {
    let list = null, paragraph = null;
    for (const line of block.split('\n')) {
      const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
      if (item) {
        const ordered = /^\s*\d/.test(line);
        if (!list || (list.tagName === 'OL') !== ordered) { list = document.createElement(ordered ? 'ol' : 'ul'); container.append(list); }
        const li = document.createElement('li'); inline(li, item[1]); list.append(li); paragraph = null;
        continue;
      }
      list = null;
      if (!line.trim()) { paragraph = null; continue; }
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) { const h = document.createElement('p'); h.className = 'chat-heading'; inline(h, heading[1]); container.append(h); paragraph = null; continue; }
      // Lines inside one paragraph keep their breaks.
      if (paragraph) paragraph.append(document.createElement('br'));
      else { paragraph = document.createElement('p'); container.append(paragraph); }
      inline(paragraph, line);
    }
  }
}
