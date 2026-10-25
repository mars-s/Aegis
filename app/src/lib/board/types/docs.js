import { registerCardType } from '../commands.js';

registerCardType('doc', { size: [240, 56], guide: 'a rich document that opens in a side editor. text is its title; props.body is Markdown (headings, lists, tables, links). Omit props.doc; the editor builds it from body.' });
