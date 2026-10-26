// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { Extension, InputRule, Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
// item 14: stable local image references, resolved only in rendered HTML.
import { AssetImage as Image } from '../imports/assets.js';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { InlineMath, BlockMath } from './maths.js';

const ParagraphStyle = Extension.create({
  name: 'paragraphStyle',
  addGlobalAttributes() {
    return [{ types: ['paragraph'], attributes: { kind: {
      default: null, parseHTML: el => el.getAttribute('data-kind'),
      renderHTML: attrs => attrs.kind ? { 'data-kind': attrs.kind } : {},
    } } }];
  },
});
const script = (name, tag) => Mark.create({
  name, excludes: name === 'superscript' ? 'subscript' : 'superscript',
  parseHTML: () => [{ tag }], renderHTML: ({ HTMLAttributes }) => [tag, mergeAttributes(HTMLAttributes), 0],
});
const MarkdownWriting = Extension.create({
  name: 'markdownWriting', priority: 1000,
  addInputRules() {
    return [new InputRule({
      find: /^\[( |x|X)\]\s$/,
      handler: ({ range, match, chain }) => {
        chain().deleteRange(range).toggleTaskList().updateAttributes('taskItem', { checked: match[1].toLowerCase() === 'x' }).run();
      },
    }), new InputRule({
      find: /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/,
      handler: ({ state, range, match }) => {
        state.tr.insertText(match[1], range.from, range.to).addMark(range.from, range.from + match[1].length, state.schema.marks.link.create({ href: match[2] })).removeStoredMark(state.schema.marks.link);
      },
    })];
  },
});
export const extensions = () => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
  TextStyleKit.configure({ lineHeight: { types: ['paragraph', 'heading'] } }), ParagraphStyle, script('superscript', 'sup'), script('subscript', 'sub'),
  TableKit.configure({ table: { resizable: true } }),
  TextAlign.configure({ types: ['paragraph', 'heading'] }), Highlight.configure({ multicolor: true }),
  Image.configure({ allowBase64: true }), TaskList, TaskItem.configure({ nested: true, HTMLAttributes: { 'data-type': 'taskItem' } }),
  InlineMath, BlockMath, MarkdownWriting,
  Placeholder.configure({ placeholder: 'Start writing…' }), CharacterCount,
];
