import './register.ts';
import { z } from 'zod/v4';
import { RichNodeSchema } from '@aegis/domain/schema';
const { unzipSync, strFromU8 } = await import('fflate');
const maths = await import('../../../app/src/editors/document/maths.ts');
const word = await import('../../../app/src/editors/document/docx.ts');
export const mathsHTML = maths.mathsHTML;
const optionsSchema = z.object({ title: z.string(), paper: z.enum(['a4', 'letter']).optional() });
export function toDocx(doc: unknown, options: z.input<typeof optionsSchema>) {
  const { title, paper } = optionsSchema.parse(options);
  return word.toDocx(RichNodeSchema.parse(doc), { title, ...(paper === undefined ? {} : { paper }) });
}
export async function loadZip(bytes: Uint8Array) { return unzipSync(new Uint8Array(bytes)); }
export async function zipText(archive: Awaited<ReturnType<typeof loadZip>>, path: string): Promise<string> {
  const entry = archive[path];
  if (!entry) throw new Error(`Missing Word entry ${path}`);
  return strFromU8(entry);
}
