import { mediaContext } from './context.js';
import { importImages } from './images.js';
import { importVideo } from './recording.js';
import { normaliseLink, spotifyOf } from './links.js';
// item 14: one route for mixed image, video and document imports.
import { fileFormat, importDocument } from '../imports';
import { keynotePackages } from '../imports/keynote-package';
import { pointerImport } from '../imports/motion';
export async function importFiles(ctx, input, at = ctx.canvas.centre(), boardId = ctx.canvas.board.id) {
  const files = [...input];
  if (files.every(file => file.type.startsWith('image/'))) return importImages(ctx, files, at);
  // CSV and TSV become dataset windows that agents can query in full.
  const { isData, importDataset } = await import('../data/index.js');
  // Start before yielding so every item captures the destination board.
  await Promise.all(files.map((file, i) => {
    const position = { x: at.x + i * 600, y: at.y };
    if (isData(file)) return importDataset(ctx, file, position);
    if (fileFormat(file)) return importDocument(ctx, file, position, boardId);
    if (file.type.startsWith('video/')) return importVideo(ctx, file, position);
    if (file.type.startsWith('image/')) return importImages(ctx, [file], position);
    ctx.toast(`Could not import ${file.name}. Choose an image, video, CSV, PDF, PowerPoint (.pptx) or Keynote (.key) file.`);
  }));
}
// end item 14
export function installMediaImports() {
  const mediaFiles = files => files.length && [...files].some(f => /^(image|video)\//.test(f.type) || fileFormat(f) || /\.(csv|tsv)$/i.test(f.name));
  const editing = target => target.closest?.('textarea, input, select, [contenteditable]');
  addEventListener('change', e => {
    const ctx = mediaContext(), files = e.target.files;
    if (e.target.id !== 'mediaFile' || !ctx?.canvas.board || !files?.length) return;
    e.stopImmediatePropagation(); void importFiles(ctx, files); e.target.value = '';
  }, true);
  addEventListener('paste', e => {
    const ctx = mediaContext(); if (!ctx?.canvas.board || editing(e.target)) return;
    const files = e.clipboardData?.files;
    if (files && mediaFiles(files)) { e.preventDefault(); e.stopImmediatePropagation(); void importFiles(ctx, files); return; }
    const text = e.clipboardData?.getData('text/plain').trim();
    if (text && /^spotify:/i.test(text) && spotifyOf(text)) {
      e.preventDefault(); e.stopImmediatePropagation(); const at = ctx.canvas.centre();
      ctx.apply([{ op: 'create', type: 'link', url: normaliseLink(text), x: at.x, y: at.y, w: 340, h: 228 }]);
    }
  }, true);
  addEventListener('drop', e => {
    const ctx = mediaContext(); if (!ctx?.canvas.board || editing(e.target) || !e.target.closest?.('#stage')) return;
    pointerImport();
    const files = e.dataTransfer?.files, at = ctx.canvas.screenToWorld(e.clientX, e.clientY);
    // item 14: Finder may drop .key as a package directory.
    const packages = e.dataTransfer && keynotePackages(e.dataTransfer);
    if (packages) {
      e.preventDefault(); e.stopImmediatePropagation(); document.getElementById('stage')?.classList.remove('dropping');
      const boardId = ctx.canvas.board.id; ctx.toast('Reading Keynote package…');
      void packages.then(files => importFiles(ctx, files, at, boardId)).catch(error => ctx.toast(`Could not import the Keynote package. ${error.message}`)); return;
    }
    // end item 14
    if (files?.length) { e.preventDefault(); e.stopImmediatePropagation(); document.getElementById('stage')?.classList.remove('dropping'); void importFiles(ctx, files, at); return; }
    if (files?.length) return;
    const text = (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '').split('\n').find(s => s && !s.startsWith('#'))?.trim();
    if (!text || !/^https?:\/\/|^spotify:/i.test(text)) return;
    try {
      const url = normaliseLink(text); e.preventDefault(); e.stopImmediatePropagation();
      ctx.apply([{ op: 'create', type: /\.(png|jpe?g|gif|webp|avif|apng)(\?|$)/i.test(url) ? 'image' : 'link', url, x: at.x, y: at.y }]);
    } catch { /* A non-link drop can continue through the canvas. */ }
  }, true);
  addEventListener('dragover', e => {
    if (e.target.closest?.('#stage') && e.dataTransfer && [...e.dataTransfer.types].some(t => ['text/uri-list','text/plain'].includes(t))) e.preventDefault();
  }, true);
}
