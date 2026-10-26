import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentContent, documentWordCount, wordCount } from '../../app/src/lib/board/words.js';
import { documentUpdate } from '../../app/src/features/docs/content.js';
import { cardSummary } from '../../app/src/lib/board/summary.js';

test('document counts stay identical through parsing, migration and save', () => {
  const card = { type: 'doc', text: 'Notes', props: { body: '# Notes\n## A clear plan\n**Three** *small* steps\n- [x] Write it\n1. Read it\n[Check source](https://example.com)\nInline $a+b$ maths\n$$\nx + y = z\n$$\n```js\nconst value = 3;\n```\n---' } };
  const doc = documentContent(card);
  assert.equal(documentWordCount(card), 17);
  const saved = { ...card, props: documentUpdate('doc', doc).set.props };
  assert.equal(wordCount(doc), documentWordCount(saved));
  assert.equal(cardSummary(card).facts[1], cardSummary(saved).facts[1]);
  assert.equal(cardSummary(saved).facts[1], '17 words');
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
