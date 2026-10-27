import Image from '@tiptap/extension-image';
import { z } from 'zod/v4';
import type { ImportHost } from './types.js';
const ImageAttributes = z.object({ src: z.string().nullable().catch(null) });
// The document owner creates the extension with its runtime's resolver. Stored JSON keeps asset references.
export function createAssetImage(assetUrl: ImportHost['assetUrl']) {
  return Image.extend({ addAttributes() { return { ...this.parent?.(), src: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('data-asset-src') || element.getAttribute('src'), renderHTML: (boundary: unknown) => { const { src } = ImageAttributes.parse(boundary); return src?.startsWith('asset:') ? { src: assetUrl(src), 'data-asset-src': src } : { src }; } } }; } });
}
export async function downloadOriginal(host: ImportHost, original: { readonly original: string; readonly name: string }): Promise<void> {
  const response = await fetch(host.assetUrl(original.original)); if (!response.ok) throw new Error('The original file is no longer available.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.download = original.name || 'Original file'; link.href = url; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
