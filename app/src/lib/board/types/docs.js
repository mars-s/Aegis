import { registerCardType } from '../commands.js';

registerCardType('doc', { size: [760, 740], guide: 'a rich document shown as a window on the board that opens in a side editor. text is its title; props.body is Markdown (headings, lists, tables, links). Omit props.doc; the editor builds it from body.' });
