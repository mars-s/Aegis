// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';

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
export const extensions = () => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
  TextStyleKit.configure({ lineHeight: { types: ['paragraph', 'heading'] } }), ParagraphStyle, script('superscript', 'sup'), script('subscript', 'sub'),
  TableKit.configure({ table: { resizable: true } }),
  TextAlign.configure({ types: ['paragraph', 'heading'] }), Highlight.configure({ multicolor: true }),
  Image.configure({ allowBase64: true }), TaskList, TaskItem.configure({ nested: true, HTMLAttributes: { 'data-type': 'taskItem' } }),
  Placeholder.configure({ placeholder: 'Start writing, or drag cards here from the board…' }), CharacterCount,
];
