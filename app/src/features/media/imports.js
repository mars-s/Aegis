import { mediaContext } from './context.js';
import { importImages } from './images.js';
import { importVideo } from './recording.js';
import { normaliseLink, spotifyOf } from './links.js';
export function installMediaImports() {
  const mediaFiles = files => files.length && [...files].every(f => /^(image|video)\//.test(f.type));
  const importFiles = async (ctx, input, at = ctx.canvas.centre()) => {
    const files = [...input];
    if (files.every(file => file.type.startsWith('image/'))) return importImages(ctx, files, at);
    // Start each operation before yielding so every item captures the same destination board.
    await Promise.all(files.map((file, i) => {
      const position = { x: at.x + i * 464, y: at.y };
      return file.type.startsWith('video/') ? importVideo(ctx, file, position) : importImages(ctx, [file], position);
    }));
  };
  const editing = target => target.closest?.('textarea, input, select, [contenteditable]');
  addEventListener('change', e => {
    const ctx = mediaContext(), files = e.target.files;
    if (e.target.id !== 'mediaFile' || !ctx?.canvas.board || !files || !mediaFiles(files)) return;
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
    const files = e.dataTransfer?.files, at = ctx.canvas.screenToWorld(e.clientX, e.clientY);
    if (files && mediaFiles(files)) { e.preventDefault(); e.stopImmediatePropagation(); document.getElementById('stage')?.classList.remove('dropping'); void importFiles(ctx, files, at); return; }
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
