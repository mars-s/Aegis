import { CardSchema, CardIdSchema, JsonRecordSchema } from '@aegis/domain/schema';
const makeCard = (value: unknown) => CardSchema.parse({ id: 'fixture', x: 0, y: 0, w: 200, h: 100, text: '', color: 'plain', ...JsonRecordSchema.parse(value) });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentContent, documentWordCount, wordCount, wordCountLabel } from '@aegis/domain/words';
import { documentUpdate } from '@aegis/domain/content';
import { cardSummary } from '@aegis/domain/summary';

test('document counts stay identical through parsing, migration and save', () => {
  const card = makeCard({ type: 'doc', text: 'Notes', props: { body: '# Notes\n## A clear plan\n**Three** *small* steps\n- [x] Write it\n1. Read it\n[Check source](https://example.com)\nInline $a+b$ maths\n$$\nx + y = z\n$$\n```js\nconst value = 3;\n```\n---' } });
  const doc = documentContent(card);
  assert.equal(documentWordCount(card), 17);
  const saved = makeCard({ ...card, props: documentUpdate(CardIdSchema.parse('doc'), doc).set.props });
  assert.equal(wordCount(doc), documentWordCount(saved));
  assert.equal(cardSummary(card).wordCount, cardSummary(saved).wordCount);
  assert.equal(cardSummary(saved).wordCount, '17 words');
});

test('marks join within words, block boundaries separate, maths and embedded leaves count zero', () => {
  const doc = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'co' }, { type: 'text', text: 'operate', marks: [{ type: 'bold' }] }, { type: 'inlineMath', attrs: { latex: 'x + y' } }, { type: 'text', text: 'now' }] },
    { type: 'blockMath', attrs: { latex: 'a = b' } },
    { type: 'image', attrs: { alt: 'Ignored image words' } },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Café 42' }] }] }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '+ / …' }, { type: 'hardBreak' }, { type: 'text', text: 'Last word' }] },
  ] };
  assert.equal(wordCount(doc), 6);
  assert.equal(wordCount({ type: 'doc', content: [] }), 0);
});

test('document labels share singular and thousands formatting', () => {
  assert.equal(wordCountLabel(1), '1 word');
  assert.equal(wordCountLabel(1001), '1,001 words');
  assert.equal(cardSummary(makeCard({ type: 'doc', props: { body: 'word '.repeat(1001) } })).wordCount, '1,001 words');
});
