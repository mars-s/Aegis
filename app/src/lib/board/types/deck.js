import { registerCardType } from '../commands.js';

registerCardType('deck', {
  size: [470, 352],
  guide: 'a slide deck. text is the deck name. props.slides is an ordered list of {id: stable unique string, layout: "title"|"chart"|"three"|"text", title, sub: subtitle, body: plain text}. title draws thin ridge lines; chart reads chart: {values: number[], target?: number, label?: accessible chart description}; three uses the first three newline-separated body lines as circle labels; text shows body below the subtitle. props.current is the zero-based current slide index. Agents create decks with create {type: "deck", text, props: {slides, current: 0}} and edit, add, reorder or remove slides with update {id, set: {props: {slides, current}}}, sending the complete slides list. Keep slide ids when editing. Pictures must be the person\'s own media; use drawn graphics here, never stock or generated photos presented as theirs.',
});
