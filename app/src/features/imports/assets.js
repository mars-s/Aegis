import Image from '@tiptap/extension-image';

// Keep stable asset references in TipTap JSON. Resolve only the rendered HTML,
// since the local host's port changes between launches.
export const AssetImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), src: {
      default: null,
      parseHTML: el => el.getAttribute('data-asset-src') || el.getAttribute('src'),
      renderHTML: attrs => typeof attrs.src === 'string' && attrs.src.startsWith('asset:')
        ? { src: globalThis.aegisCtx?.host.assetUrl(attrs.src) || attrs.src, 'data-asset-src': attrs.src }
        : { src: attrs.src },
    } };
  },
});

export async function downloadOriginal(ctx, original) {
  try {
    const response = await fetch(ctx.host.assetUrl(original.original));
    if (!response.ok) throw new Error('The original file is no longer available.');
    const blob = await response.blob(), url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.download = original.name || 'Original file'; link.href = url;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { ctx.toast(`Could not download the original file. ${error.message}`); }
}
