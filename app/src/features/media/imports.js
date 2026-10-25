import { mediaContext } from './context.js';
import { importImages } from './images.js';
import { normaliseLink, spotifyOf } from './links.js';
export function installMediaImports() {
  const imageFiles = files => files.length && [...files].every(f => f.type.startsWith('image/'));
  const editing = target => target.closest?.('textarea, input, select, [contenteditable]');
  addEventListener('paste', e => {
    const ctx = mediaContext(); if (!ctx?.canvas.board || editing(e.target)) return;
    const files = e.clipboardData?.files;
    if (files && imageFiles(files)) { e.preventDefault(); e.stopImmediatePropagation(); void importImages(ctx, files); return; }
    const text = e.clipboardData?.getData('text/plain').trim();
    if (text && /^spotify:/i.test(text) && spotifyOf(text)) {
      e.preventDefault(); e.stopImmediatePropagation(); const at = ctx.canvas.centre();
      ctx.apply([{ op: 'create', type: 'link', url: normaliseLink(text), x: at.x, y: at.y, w: 340, h: 228 }]);
    }
  }, true);
  addEventListener('drop', e => {
    const ctx = mediaContext(); if (!ctx?.canvas.board || editing(e.target) || !e.target.closest?.('#stage')) return;
    const files = e.dataTransfer?.files, at = ctx.canvas.screenToWorld(e.clientX, e.clientY);
    if (files && imageFiles(files)) { e.preventDefault(); e.stopImmediatePropagation(); document.getElementById('stage')?.classList.remove('dropping'); void importImages(ctx, files, at); return; }
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
