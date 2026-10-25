import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../app/src/lib/board/types/docs.js';
import { applyBatch, emptyBoard, describe } from '../../app/src/lib/board/commands.js';
import { cardContent, documentUpdate, plainText, markdownHTML } from '../../app/src/features/docs/content.js';
import { toDocx } from '../../app/src/features/docs/docx.js';
import JSZip from '../../app/node_modules/jszip/lib/index.js';

const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
test('doc windows persist rich content and agent-readable text through board commands', () => {
  const start = emptyBoard('docs', 'Docs');
  const created = applyBatch(start, { commands: [{ op: 'create', type: 'doc', text: 'Project notes', props: { custom: true }, ref: 'doc' }] });
  assert.equal(created.ok, true);
  const id = created.created.doc;
  assert.deepEqual([created.board.cards[0].w, created.board.cards[0].h], [760, 740]);
  const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Ideas', marks: [{ type: 'bold' }] }] }, paragraph('Write the brief')] };
  const saved = applyBatch(created.board, { commands: [documentUpdate(id, doc)] });
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.board.cards[0].props.doc, doc);
  assert.equal(saved.board.cards[0].props.custom, true);
  assert.equal(describe(saved.board).cards[0].props.body, 'Ideas\nWrite the brief');
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
  assert.deepEqual(content[1].content.map(c => c.attrs.checked), [true, false]);
  assert.equal(content[2].content[0].marks[0].attrs.href, 'https://example.com');
  assert.equal(content[3].type, 'heading');
  assert.equal(plainText({ type: 'doc', content }), 'Checklist\nFinished\nNext\nSource\nReference\nRich words');
  assert.deepEqual(source, original);
});

test('copied links and Spotify cards keep preview metadata and explicit edits', () => {
  const source = { type: 'link', url: 'https://example.com/research', props: { preview: { title: 'Research title', description: 'The preview summary' } } };
  const content = cardContent(source);
  assert.equal(content[0].content[0].text, 'Research title');
  assert.equal(content[0].content[0].marks[0].attrs.href, source.url);
  assert.equal(plainText({ type: 'doc', content }), 'Research title\nThe preview summary');
  const edited = cardContent({ ...source, props: { ...source.props, title: 'My title', description: 'My summary' } });
  assert.equal(plainText({ type: 'doc', content: edited }), 'My title\nMy summary');
  assert.equal(cardContent({ ...source, props: { ...source.props, description: '' } }).length, 1);
  assert.equal(plainText({ type: 'doc', content: cardContent({ ...source, type: 'spotify' }) }), 'Research title\nThe preview summary');
  assert.equal(cardContent({ type: 'link', url: source.url, title: 'Legacy title', desc: 'Legacy summary' })[1].content[0].text, 'Legacy summary');
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
  const updated = applyBatch(created.board, { commands: [documentUpdate(created.created.doc, doc)] });
  const props = describe(updated.board).cards[0].props;
  assert.equal(props.body, body.trim());
  assert.equal(props.doc, undefined, 'the rich payload stays out of the agent overview');
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
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /Heading1/);
  assert.match(xml, /<w:b\/>/);
  assert.match(xml, /Georgia/);
  assert.match(xml, /1F7AE0/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /w:w="11906"/);
  assert.match(xml, /Done task/);
  assert.match(await zip.file('word/_rels/document.xml.rels').async('string'), /https:\/\/example.com/);
  assert.match(await zip.file('docProps/core.xml').async('string'), /Aegis/);
});
