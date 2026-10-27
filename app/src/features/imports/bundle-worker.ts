import { unzipSync } from 'fflate';
import { BundleRequestSchema } from './bundle-protocol.js';
import type { BundleResponse } from './bundle-protocol.js';
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  try {
    const request = BundleRequestSchema.parse(event.data); let count = 0, expanded = 0;
    const entries = unzipSync(request.bytes, { filter(entry) {
      if (++count > 5000) throw new Error('This bundle has over 5,000 files. Export a smaller presentation first.');
      expanded += entry.originalSize;
      if (expanded > 128 * 1024 * 1024 || entry.originalSize > 24 * 1024 * 1024) throw new Error('This bundle expands beyond the import limit of 128 MB, or has a file over 24 MB.');
      return request.format === 'pptx' ? /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/.*|media\/.*)$/.test(entry.name) : /(?:^|\/)Data\/st-[^/]+\.(jpe?g|png)$/i.test(entry.name) || /(?:^|\/)(?:QuickLook\/|preview(?:-web|-micro)?\.(?:jpe?g|png)$)/i.test(entry.name);
    } });
    const transfer = new Set<ArrayBuffer>(); for (const bytes of Object.values(entries)) if (bytes.buffer instanceof ArrayBuffer) transfer.add(bytes.buffer);
    const response: BundleResponse = { kind: 'ok', entries }; self.postMessage(response, { transfer: [...transfer] });
  } catch (error) { const response: BundleResponse = { kind: 'error', message: error instanceof Error ? error.message : String(error) }; self.postMessage(response); }
});
