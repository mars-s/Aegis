import { registerCardType } from '../commands.js';

registerCardType('doc', { size: [760, 740], guide: 'a document window with a Markdown side editor. text is its only title, do not repeat it as an H1 in the body. Write props.body as Markdown: #, ##, ### headings, lists, - [ ] tasks, > quotes, **bold**, *italic*, `code`, fenced code, ---, links, $inline LaTeX$ and $$block LaTeX$$ maths. Omit props.doc; the editor builds rich content from body.' });
