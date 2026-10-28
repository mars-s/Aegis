import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { CardSchema, RichNodeSchema } from '@aegis/domain/schema';
import { cardContent } from '@aegis/domain/content';
import { mathsHTML } from './maths.js';
import { toDocx } from './docx.js';

// Ported from checks/host/docs.test.ts: the maths and Word export cases, run against the editor's TypeScript modules.
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
async function loadZip(bytes: Uint8Array) { return unzipSync(bytes); }
async function zipText(archive: Record<string, Uint8Array>, path: string): Promise<string> {
  const entry = archive[path];
  if (!entry) throw new Error(`Missing Word entry ${path}`);
  return strFromU8(entry);
}
const richDoc = (value: unknown) => RichNodeSchema.parse(value);
// Original fixtures omit geometry and other fields unrelated to the exported content.
const content = (card: object) => cardContent(CardSchema.parse({ id: 'copy', type: 'note', x: 0, y: 0, w: 100, h: 80, color: 'plain', text: '', ...card }));

describe('document maths and Word export', () => {
  it('maths renders through KaTeX, keeps invalid source visible and refuses unsafe links', () => {
    expect(mathsHTML('x^2')).toMatch(/class="katex"/);
    expect(mathsHTML('\\frac{1}{2}', true)).toMatch(/katex-display/);
    expect(mathsHTML('\\notACommand'), 'Invalid LaTeX remains visible and editable').toMatch(/notACommand/);
    expect(mathsHTML('\\href{javascript:alert(1)}{x}')).not.toMatch(/href="javascript:/);
  });

  it('Word exports both maths nodes as monospace LaTeX without dropping surrounding words', async () => {
    const doc = richDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }, { type: 'text', text: ' after' }] }, { type: 'blockMath', attrs: { latex: '\\frac{1}{2}' } }] });
    const zip = await loadZip(await toDocx(doc, { title: 'Maths' }));
    const xml = await zipText(zip, 'word/document.xml');
    for (const text of ['Before ', '$x^2$', ' after', '$$\\frac{1}{2}$$', 'Menlo']) expect(xml.includes(text), text).toBe(true);
  });

  it('Word export contains real headings, marks, links, tables and selected paper size', async () => {
    const doc = richDoc({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
      { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'Styled text', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '20px', fontFamily: 'Georgia', color: '#1f7ae0' } }] }] },
      ...content({ type: 'link', text: 'Reference', url: 'https://example.com' }),
      ...content({ type: 'todo', items: [{ text: 'Done task', done: true }] }),
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph('Column')] }, { type: 'tableCell', content: [paragraph('Value')] }] }] },
    ] });
    const bytes = await toDocx(doc, { title: 'Export test', paper: 'a4' });
    const zip = await loadZip(bytes);
    const xml = await zipText(zip, 'word/document.xml');
    expect(xml).toMatch(/Heading1/);
    expect(xml).toMatch(/<w:b\/>/);
    expect(xml).toMatch(/Georgia/);
    expect(xml).toMatch(/1F7AE0/);
    expect(xml).toMatch(/<w:tbl>/);
    expect(xml).toMatch(/w:w="11906"/);
    expect(xml).toMatch(/Done task/);
    expect(await zipText(zip, 'word/_rels/document.xml.rels')).toMatch(/https:\/\/example.com/);
    expect(await zipText(zip, 'docProps/core.xml')).toMatch(/Aegis/);
  });

});
