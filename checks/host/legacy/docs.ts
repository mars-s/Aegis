import { z } from 'zod/v4';
import { createRequire } from 'node:module';
import { legacyModule } from './module.ts';
const maths = await legacyModule(new URL('../../../app/src/features/docs/maths.js', import.meta.url).href);
const word = await legacyModule(new URL('../../../app/src/features/docs/docx.js', import.meta.url).href);
export function mathsHTML(latex: string, display = false) { return z.string().parse(maths.call('mathsHTML', latex, display)); }
export async function toDocx(doc: unknown, options: { title: string; paper?: string }) {
  return z.instanceof(Uint8Array).parse(await word.call('toDocx', doc, options));
}
// Resolve the app's installed JSZip, just as the original export checks did.
const requireFromApp = createRequire(new URL('../../../app/package.json', import.meta.url));
const loaded = await legacyModule(requireFromApp.resolve('jszip'));
const zip = loaded.value('default');
if (typeof zip !== 'function') throw new Error('Missing JSZip constructor');
const loadAsync = z.function({ input: [z.instanceof(Uint8Array)], output: z.promise(z.unknown()) }).parse(Reflect.get(zip, 'loadAsync'));
export async function loadZip(bytes: Uint8Array): Promise<unknown> { return loadAsync(new Uint8Array(bytes)); }
export async function zipText(archive: unknown, path: string): Promise<string> {
  if (archive === null || typeof archive !== 'object') throw new Error('Missing Word archive');
  const file: unknown = Reflect.get(archive, 'file');
  if (typeof file !== 'function') throw new Error('Missing Word archive file reader');
  const entry: unknown = Reflect.apply(file, archive, [path]);
  if (entry === null || typeof entry !== 'object') throw new Error(`Missing Word entry ${path}`);
  const read: unknown = Reflect.get(entry, 'async');
  if (typeof read !== 'function') throw new Error(`Missing Word entry reader ${path}`);
  return z.string().parse(await Reflect.apply(read, entry, ['string']));
}
