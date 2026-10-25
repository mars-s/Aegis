/// <reference types="vite/client" />
import './compat.js';
// The legacy distribution includes the JS built-ins required by older WKWebView releases.
import { PDFWorker, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { JSONContent } from '@tiptap/core';
import type { Imported, ImportHost, Progress, Picture } from './types';

function textBlocks(items: TextItem[]) {
  const lines: { text: string; size: number; y: number; end: number }[] = [];
  const sizes = new Map<number, number>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const size = Math.round(Math.hypot(item.transform[2], item.transform[3]) || item.height || 12);
    sizes.set(size, (sizes.get(size) || 0) + item.str.length);
    const y = item.transform[5], x = item.transform[4], last = lines.at(-1);
    if (last && Math.abs(last.y - y) < Math.max(2, size * .25) && x >= last.end - 2) {
      last.text += (x - last.end > size * .15 ? ' ' : '') + item.str;
      last.size = Math.max(last.size, size); last.end = x + item.width;
    } else lines.push({ text: item.str, size, y, end: x + item.width });
  }
  const bodySize = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
  return lines.map(line => ({ text: line.text.trim(), level: line.size >= bodySize * 1.6 ? 1 : line.size >= bodySize * 1.25 ? 2 : 0 }));
}

export async function importPDF(file: File, host: ImportHost, progress: Progress): Promise<Imported> {
  const data = new Uint8Array(await file.arrayBuffer());
  // Vite bundles the compatibility entry as a same-origin worker in dev and the
  // app bundle. Each import owns its worker and releases it after conversion.
  const port = new Worker(new URL('./pdf-worker.ts', import.meta.url), { type: 'module' });
  const worker = PDFWorker.create({ port });
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  const failed = new Promise<never>((_, reject) => {
    port.addEventListener('error', event => { event.preventDefault(); reject(new Error('The PDF reader could not start. Reopen Aegis and try again.')); });
    readyTimer = setTimeout(() => reject(new Error('The PDF reader took too long to start. Reopen Aegis and try again.')), 30000);
  });
  const read = <T>(promise: Promise<T>) => Promise.race([promise, failed]);
  const resources = new URL('pdfjs/', document.baseURI).href;
  const loading = getDocument({ data, worker, useSystemFonts: true, stopAtErrors: true,
    cMapUrl: resources + 'cmaps/', cMapPacked: true, standardFontDataUrl: resources + 'standard_fonts/', wasmUrl: resources + 'wasm/', iccUrl: resources + 'iccs/' });
  // Fail password-protected files immediately instead of leaving an unresolved prompt.
  loading.onPassword = () => { void loading.destroy(); };
  try {
    const pdf = await read(loading.promise);
    clearTimeout(readyTimer);
    if (pdf.numPages > 100) throw new Error('This PDF has over 100 pages. Split it into smaller PDFs first.');
    const content: JSONContent[] = [], markdown: string[] = [], pages: Picture[] = [];
    let textLength = 0, imageBytes = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      progress((number - 1) / pdf.numPages, `Reading page ${number} of ${pdf.numPages}`);
      const page = await read(pdf.getPage(number));
      const text = await read(page.getTextContent());
      const blocks = textBlocks(text.items.filter((item): item is TextItem => 'str' in item));
      for (const block of blocks) {
        textLength += block.text.length;
        if (textLength > 160000) throw new Error('This PDF has too much text for one document. Split it into smaller PDFs first.');
        markdown.push(`${'#'.repeat(block.level)}${block.level ? ' ' : ''}${block.text}`);
        content.push({ type: block.level ? 'heading' : 'paragraph', ...(block.level ? { attrs: { level: block.level } } : {}), content: [{ type: 'text', text: block.text }] });
      }
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(base.width, base.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        await read(page.render({ canvas, viewport, background: '#ffffff' }).promise);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(`Could not render page ${number}.`)), 'image/jpeg', .88));
        imageBytes += blob.size;
        if (imageBytes > 96 * 1024 * 1024) throw new Error('The rendered PDF exceeds 96 MB. Split it into smaller PDFs first.');
        const saved = await host.upload(new File([blob], `page-${number}.jpg`, { type: blob.type }));
        pages.push({ src: saved.url, alt: `Page ${number}` });
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
      progress(number / pdf.numPages, `Saved page ${number} of ${pdf.numPages}`);
    }
    if (!content.length) {
      const message = 'This PDF contains no selectable text. The pages are included below.';
      markdown.push(message); content.push({ type: 'paragraph', content: [{ type: 'text', text: message }] });
    }
    markdown.push('## Original pages');
    content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Original pages' }] });
    for (const picture of pages) {
      markdown.push(`![${picture.alt}](${picture.src})`);
      content.push({ type: 'paragraph', content: [{ type: 'text', text: picture.alt }] }, { type: 'image', attrs: picture });
    }
    return { type: 'doc', props: { body: markdown.join('\n\n'), doc: { type: 'doc', content }, pages } };
  } catch (error) {
    if (error instanceof Error && /password|worker was destroyed/i.test(error.message)) throw new Error('This PDF is password protected. Export an unlocked copy and try again.');
    throw error;
  } finally { clearTimeout(readyTimer); try { await loading.destroy(); } finally { worker.destroy(); port.terminate(); } }
}
