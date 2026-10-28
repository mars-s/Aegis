import { RichNodeSchema } from '@aegis/domain/schema';
import { printPDF as printDocument } from '../editors/document/export.js';
import { printHtml } from '../lib/native-files.js';
export async function printPDF(editor: { readonly getJSON: () => unknown; readonly getHTML: () => string }, title: string, paper: 'letter' | 'a4'): Promise<void> {
  await printDocument({ json: RichNodeSchema.extend({ type: RichNodeSchema.shape.type.default('doc') }).parse(editor.getJSON()), html: editor.getHTML(), title, paper }, printHtml);
}
