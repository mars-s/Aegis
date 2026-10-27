import { required } from './required.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBatch } from './batch.ts';
import { emptyBoard, describe } from '@aegis/domain/commands';
import { documentUpdate, plainText, markdownHTML, migrateTitle } from '@aegis/domain/content';
import { mathsHTML } from './legacy/docs.ts';
import { toDocx } from './legacy/docs.ts';
import { cardContent } from './legacy/content.ts';
import { loadZip, zipText } from './legacy/docs.ts';
import { CardIdSchema, PropsSchema } from '@aegis/domain/schema';
import { z } from 'zod/v4';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
test('doc windows persist rich content and agent-readable text through board commands', () => {
  const start = emptyBoard('docs', 'Docs');
  const created = applyBatch(start, { commands: [{ op: 'create', type: 'doc', text: 'Project notes', props: { custom: true }, ref: 'doc' }] });
  assert.equal(created.ok, true);
  const id = required(created.created.doc);
  assert.deepEqual([required(created.board.cards[0]).w, required(created.board.cards[0]).h], [760, 740]);
  const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Ideas', marks: [{ type: 'bold' }] }] }, paragraph('Write the brief')] };
  const saved = applyBatch(created.board, { commands: [documentUpdate(id, doc)] });
  assert.equal(saved.ok, true);
  assert.deepEqual(required(required(saved.board.cards[0]).props).doc, doc);
  assert.equal(required(required(saved.board.cards[0]).props).custom, true);
  assert.equal(required(required(describe(saved.board).cards[0]).props).body, 'Ideas\nWrite the brief');
  assert.equal(start.cards.length, 0);
  const rejected = applyBatch(saved.board, { commands: [{ op: 'update', id, set: { props: { body: 'x'.repeat(1000001) } } }] });
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.board, saved.board);
});

test('copying cards preserves task state, headings, links and rich documents without moving sources', () => {
  const source = [
    { id: 'aaaaaa', type: 'todo', x: 10, y: 20, text: 'Checklist', items: [{ text: 'Finished', done: true }, { text: 'Next', done: false }] },
    { id: 'bbbbbb', type: 'link', text: 'Source', url: 'https://example.com' },
    { id: 'cccccc', type: 'doc', text: 'Reference', props: { doc: { type: 'doc', content: [paragraph('Rich words')] } } },
  ];
  const original = structuredClone(source);
  const content = source.flatMap(cardContent);
  assert.deepEqual(required(required(content[1]).content).map(c => required(c.attrs).checked), [true, false]);
  assert.equal(required(required(required(required(required(required(content[2]).content)[0]).marks)[0]).attrs).href, 'https://example.com');
  assert.equal(required(content[3]).type, 'heading');
  assert.equal(plainText({ type: 'doc', content }), 'Checklist\nFinished\nNext\nSource\nReference\nRich words');
  assert.deepEqual(source, original);
});

test('a Markdown body edit replaces stale rich text and keeps source attachments', () => {
  const rich = { type: 'doc', content: [paragraph('Old editor text')] };
  const created = applyBatch(emptyBoard('docs'), { commands: [{ op: 'create', type: 'doc', props: {
    doc: rich, body: 'Old editor text', pages: [{ src: 'asset:page' }], import: { name: 'Source.pdf' },
  }, ref: 'doc' }] });
  const result = applyBatch(created.board, { commands: [{ op: 'update', id: created.created.doc, set: { props: { body: 'New **Markdown**' } } }] });
  assert.equal(result.ok, true);
  const card = required(result.board.cards[0]);
  assert.equal(required(card.props).doc, undefined);
  assert.equal(required(card.props).docTitleMigrated, true);
  assert.match(plainText({ type: 'doc', content: cardContent(card) }), /New \*\*Markdown\*\*/);
  assert.deepEqual(required(card.props).pages, [{ src: 'asset:page' }]);
  assert.equal(z.object({ name: z.string() }).parse(required(card.props).import).name, 'Source.pdf');
  assert.deepEqual(required(required(created.board.cards[0]).props).doc, rich);
});

test('copied links and Spotify cards keep preview metadata and explicit edits', () => {
  const source = { type: 'link', url: 'https://example.com/research', props: { preview: { title: 'Research title', description: 'The preview summary' } } };
  const content = cardContent(source);
  assert.equal(required(required(required(content[0]).content)[0]).text, 'Research title');
  assert.equal(required(required(required(required(required(required(content[0]).content)[0]).marks)[0]).attrs).href, source.url);
  assert.equal(plainText({ type: 'doc', content }), 'Research title\nThe preview summary');
  const edited = cardContent({ ...source, props: { ...source.props, title: 'My title', description: 'My summary' } });
  assert.equal(plainText({ type: 'doc', content: edited }), 'My title\nMy summary');
  assert.equal(cardContent({ ...source, props: { ...source.props, description: '' } }).length, 1);
  assert.equal(plainText({ type: 'doc', content: cardContent({ ...source, type: 'spotify' }) }), 'Research title\nThe preview summary');
  assert.equal(required(required(required(cardContent({ type: 'link', url: source.url, title: 'Legacy title', desc: 'Legacy summary' })[1]).content)[0]).text, 'Legacy summary');
});

test('legacy Markdown is escaped before formatting into document HTML', () => {
  const html = markdownHTML('# Notes\n- [x] Done\n<script>alert(1)</script>\n**Bold**');
  assert.match(html, /<h1>Notes<\/h1>/);
  assert.match(html, /data-checked="true"/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<strong>Bold<\/strong>/);
});

test('agents can read the plain text when rich content exceeds the board description limit', () => {
  const body = 'A long document that agents still need to read. '.repeat(120);
  const doc = { type: 'doc', content: [paragraph(body)] };
  const created = applyBatch(emptyBoard('long-doc'), { commands: [{ op: 'create', type: 'doc', ref: 'doc' }] });
  const updated = applyBatch(created.board, { commands: [documentUpdate(required(created.created.doc), doc)] });
  const props = PropsSchema.parse(required(describe(updated.board).cards[0]).props);
  assert.equal(props.body, body.trim());
  assert.equal(props.doc, undefined, 'the rich payload stays out of the agent overview');
});

test('the title migration removes only a matching leading H1 and saves through normal updates', () => {
  const heading = { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project ' }, { type: 'text', text: 'notes', marks: [{ type: 'bold' }] }] };
  const doc = { type: 'doc', content: [heading, paragraph('Keep these words'), heading] };
  const migrated = required(migrateTitle(doc, 'Project notes'));
  assert.deepEqual(required(migrated.content), required(doc.content).slice(1));
  assert.equal(required(doc.content).length, 3, 'migration does not mutate its source');
  assert.equal(migrateTitle(doc, 'Other title'), doc);
  assert.equal(required(required(migrateTitle({ type: 'doc', content: [paragraph('Project notes')] }, 'Project notes')).content).length, 1);
  assert.deepEqual(required(migrateTitle({ type: 'doc', content: [heading] }, 'Project notes')).content, [{ type: 'paragraph' }]);
  const created = applyBatch(emptyBoard('migration'), { commands: [{ op: 'create', type: 'doc', text: 'Project notes', ref: 'doc', props: { doc, custom: 'keep' } }] });
  const stored = required(applyBatch(created.board, { commands: [documentUpdate(required(created.created.doc), migrated)] }).board.cards[0]);
  assert.equal(required(stored.props).docTitleMigrated, true);
  assert.equal(required(stored.props).custom, 'keep');
  assert.deepEqual(required(stored.props).doc, migrated);
});

test('document normalisation uses the final batch title and leaves restored history snapshots exact', () => {
  const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Final title' }] }, paragraph('Keep this')] };
  const result = applyBatch(emptyBoard('normalise'), { commands: [
    { op: 'create', type: 'doc', text: 'Initial title', props: { doc }, ref: 'doc' },
    { op: 'update', id: '$doc', set: { text: 'Final title' } },
  ] });
  assert.equal(required(required(result.board.cards[0]).props).body, 'Keep this');
  const legacy = { ...required(result.board.cards[0]), props: { doc } };
  const restored = applyBatch(result.board, { commands: [{ op: 'restore', cards: [legacy], links: [] }] });
  assert.deepEqual(required(restored.board.cards[0]), legacy);
  const moved = applyBatch(restored.board, { commands: [{ op: 'move', id: legacy.id, x: 100, y: 200 }] });
  assert.deepEqual(required(moved.board.cards[0]).props, legacy.props, 'moving old work does not rewrite its content');
  const imported = applyBatch(emptyBoard('import'), { commands: [{ op: 'create', type: 'doc', text: 'Source.pdf', props: { doc, body: '# Final title\n\nKeep this' } }] });
  assert.equal(required(required(imported.board.cards[0]).props).body, '# Final title\n\nKeep this', 'unrelated headings retain the import Markdown');
  assert.deepEqual(required(required(imported.board.cards[0]).props).doc, doc);
});

test('Markdown keeps fenced code literal, renders links safely and preserves maths source', () => {
  const html = markdownHTML('## Findings\n- Item\n1. First\n- [ ] Task\n> Quote\n**bold** *italic* `code` [Source](https://example.com)\n```js\nconst x = "<tag> **literal** $x$";\n```\n---\nInline $a^2+b^2=c^2$\n$$\n\\sum_{i=1}^{n} i\n$$');
  for (const fragment of ['<h2>Findings</h2>', '<ul>', '<ol>', 'data-type="taskList"', '<blockquote>', '<strong>bold</strong>', '<em>italic</em>', '<code>code</code>', 'href="https://example.com"', 'class="language-js"', '&lt;tag&gt; **literal** $x$', '<hr>', 'data-type="inlineMath"', 'data-type="blockMath"']) assert.ok(html.includes(fragment), fragment);
  assert.doesNotMatch(markdownHTML('[bad](javascript:alert)\n`$literal$`\n\\$escaped\\$'), /href=|data-type="inlineMath"/);
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }] }, { type: 'blockMath', attrs: { latex: '\\frac{1}{2}' } }] };
  assert.equal(PropsSchema.parse(documentUpdate(CardIdSchema.parse('maths'), doc).set.props).body, 'Use $x^2$\n$$\\frac{1}{2}$$');
  assert.match(mathsHTML('x^2'), /class="katex"/);
  assert.match(mathsHTML('\\frac{1}{2}', true), /katex-display/);
  assert.match(mathsHTML('\\notACommand'), /notACommand/, 'Invalid LaTeX remains visible and editable');
  assert.doesNotMatch(mathsHTML('\\href{javascript:alert(1)}{x}'), /href="javascript:/);
});

test('Word exports both maths nodes as monospace LaTeX without dropping surrounding words', async () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }, { type: 'text', text: ' after' }] }, { type: 'blockMath', attrs: { latex: '\\frac{1}{2}' } }] };
  const zip = await loadZip(await toDocx(doc, { title: 'Maths' }));
  const xml = await zipText(zip, 'word/document.xml');
  for (const text of ['Before ', '$x^2$', ' after', '$$\\frac{1}{2}$$', 'Menlo']) assert.ok(xml.includes(text), text);
});

test('Word export contains real headings, marks, links, tables and selected paper size', async () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'Styled text', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '20px', fontFamily: 'Georgia', color: '#1f7ae0' } }] }] },
    ...cardContent({ type: 'link', text: 'Reference', url: 'https://example.com' }),
    ...cardContent({ type: 'todo', items: [{ text: 'Done task', done: true }] }),
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph('Column')] }, { type: 'tableCell', content: [paragraph('Value')] }] }] },
  ] };
  const bytes = await toDocx(doc, { title: 'Export test', paper: 'a4' });
  const zip = await loadZip(bytes);
  const xml = await zipText(zip, 'word/document.xml');
  assert.match(xml, /Heading1/);
  assert.match(xml, /<w:b\/>/);
  assert.match(xml, /Georgia/);
  assert.match(xml, /1F7AE0/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /w:w="11906"/);
  assert.match(xml, /Done task/);
  assert.match(await zipText(zip, 'word/_rels/document.xml.rels'), /https:\/\/example.com/);
  assert.match(await zipText(zip, 'docProps/core.xml'), /Aegis/);
});
