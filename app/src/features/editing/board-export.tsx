// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import type { Board, Card, CardId, Link } from '@aegis/domain';
import type { FeatureWorkspace } from '../../composition.js';
import { bounds, descendants, effectiveFlag } from './operations.js';
export interface ExportPoint { readonly x: number; readonly y: number }
export interface ExportServices {
  readonly assetUrl: (url: string) => string;
  readonly renderCard: (card: Card) => Promise<{ readonly element: HTMLElement; readonly dispose: () => void }>;
  readonly linkGeometry: (link: Link, a: Card, b: Card) => { readonly p0: ExportPoint; readonly p2: ExportPoint; readonly control: ExportPoint; readonly label: ExportPoint };
}
export interface ExportContext { readonly workspace: FeatureWorkspace; readonly services: ExportServices; readonly notify: (message: string) => void }
export function imagePdf(jpeg: string, width: number, height: number): Blob {
  const payload = jpeg.split(',')[1];
  if (!payload) throw new Error('Could not encode the PDF image');
  const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0)), encode = (text: string) => new TextEncoder().encode(text);
  const scale = Math.min(1, 1400 / Math.max(width, height)), w = width * scale, h = height * scale;
  const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ`;
  const objects: readonly (Uint8Array<ArrayBuffer> | readonly Uint8Array<ArrayBuffer>[])[] = [
    encode('<< /Type /Catalog /Pages 2 0 R >>'), encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    [encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`), bytes, encode('\nendstream')],
    encode(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`),
  ];
  const chunks: BlobPart[] = [encode('%PDF-1.4\n')], offsets: number[] = []; let length = 9;
  objects.forEach((object, index) => {
    offsets.push(length);
    const parts = [encode(`${index + 1} 0 obj\n`), ...(object instanceof Uint8Array ? [object] : object), encode('\nendobj\n')];
    chunks.push(...parts); length += parts.reduce((sum, part) => sum + part.length, 0);
  });
  chunks.push(encode(`xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
  return new Blob(chunks, { type: 'application/pdf' });
}
async function dataImage(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load an image for export');
  const blob = await response.blob();
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read an image for export'));
    reader.onerror = () => reject(new Error('Could not read an image for export')); reader.readAsDataURL(blob);
  });
  const image = new Image(); image.src = source; await image.decode(); return image;
}
async function videoFrame(video: HTMLVideoElement): Promise<HTMLImageElement | null> {
  if (video.readyState < 2) await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); video.removeEventListener('loadeddata', done); video.removeEventListener('error', done); resolve(); };
    const timer = setTimeout(done, 4000); video.addEventListener('loadeddata', done); video.addEventListener('error', done); video.preload = 'auto'; video.load();
  });
  if (!video.videoWidth) return null;
  try {
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext('2d'); if (!context) return null;
    context.drawImage(video, 0, 0); const image = new Image(); image.src = canvas.toDataURL('image/png'); await image.decode(); return image;
  } catch { return null; }
}
interface Media { readonly node: HTMLImageElement; readonly image: HTMLImageElement }
export async function prepareExportCard(element: HTMLElement, original: HTMLElement, card: Card, resolveUrl: (url: string) => string): Promise<Media[]> {
  const media: Media[] = [], videos = original.querySelectorAll('video');
  for (const [index, video] of element.querySelectorAll('video').entries()) {
    const source = videos[index], poster = video.poster || (typeof card.props?.poster === 'string' ? card.props.poster : '');
    const image = poster ? await dataImage(resolveUrl(poster)) : source ? await videoFrame(source) : null;
    if (image) { const node = document.createElement('img'); node.className = video.className + ' media-poster'; node.style.cssText = video.style.cssText; node.src = image.src; node.alt = card.text || 'Video poster'; video.replaceWith(node); media.push({ node, image }); }
    else { const placeholder = document.createElement('p'); placeholder.textContent = card.text || 'Video'; video.replaceWith(placeholder); }
  }
  const posters = new Set(media.map(item => item.node));
  for (const node of element.querySelectorAll('img')) { if (posters.has(node)) continue; const image = await dataImage(node.src); node.src = image.src; node.loading = 'eager'; media.push({ node, image }); }
  for (const node of element.querySelectorAll('input:not([type=checkbox]),textarea')) if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) { const text = document.createElement('span'); text.className = node.className; text.textContent = node.value; node.replaceWith(text); }
  element.querySelectorAll('button,select,.media-actions,.recorder-choices,.device-choices,.resize,.drag-strip,.remove-item,.add-item').forEach(node => node.remove());
  element.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
  element.querySelectorAll('iframe,audio').forEach(node => { const text = document.createElement('p'); text.textContent = card.text || card.url || card.type; node.replaceWith(text); });
  return media;
}
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D { const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare the export canvas'); return context; }
interface MediaPlacement { readonly image: HTMLImageElement; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly fit: string; readonly mirror: boolean; readonly clip: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null }
function drawMedia(context: CanvasRenderingContext2D, media: MediaPlacement) {
  const { image, x, y, w, h, fit, mirror, clip } = media; if (!w || !h) return;
  const iw = image.naturalWidth, ih = image.naturalHeight, ratio = fit === 'cover' ? Math.max(w / iw, h / ih) : fit === 'contain' ? Math.min(w / iw, h / ih) : null;
  const dw = ratio === null ? w : iw * ratio, dh = ratio === null ? h : ih * ratio;
  context.save(); context.beginPath(); const area = clip ?? { x, y, w, h }; context.rect(area.x, area.y, area.w, area.h); context.clip(); context.translate(x + w / 2, y + h / 2); if (mirror) context.scale(-1, 1); context.drawImage(image, -dw / 2, -dh / 2, dw, dh); context.restore();
}
function drawLinks(root: HTMLElement, board: Board, cards: readonly Card[], origin: ExportPoint, width: number, height: number, geometry: ExportServices['linkGeometry']) {
  const namespace = 'http://www.w3.org/2000/svg', svg = document.createElementNS(namespace, 'svg'), byId = new Map(cards.map(card => [card.id, card]));
  svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height)); svg.style.position = 'absolute'; svg.style.inset = '0';
  for (const link of board.links) {
    const a = byId.get(link.a), b = byId.get(link.b); if (!a || !b) continue;
    const route = geometry(link, a, b), stroke = link.colour || '#888', path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', `M${route.p0.x - origin.x} ${route.p0.y - origin.y} Q${route.control.x - origin.x} ${route.control.y - origin.y} ${route.p2.x - origin.x} ${route.p2.y - origin.y}`);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', stroke); path.setAttribute('stroke-width', '2'); if (link.dash) path.setAttribute('stroke-dasharray', '8 6'); svg.append(path);
    function arrow(tip: ExportPoint, from: ExportPoint) { const dx = tip.x - from.x, dy = tip.y - from.y, length = Math.hypot(dx, dy) || 1, x = dx / length, y = dy / length, head = document.createElementNS(namespace, 'path'); head.setAttribute('d', `M${tip.x - origin.x - x * 11 - y * 5} ${tip.y - origin.y - y * 11 + x * 5} L${tip.x - origin.x} ${tip.y - origin.y} L${tip.x - origin.x - x * 11 + y * 5} ${tip.y - origin.y - y * 11 - x * 5}`); head.setAttribute('fill', 'none'); head.setAttribute('stroke', stroke); head.setAttribute('stroke-width', '2'); svg.append(head); }
    if (link.arrow === 'end' || link.arrow === 'both') arrow(route.p2, route.control);
    if (link.arrow === 'both') arrow(route.p0, route.control);
    if (link.label) { const text = document.createElementNS(namespace, 'text'); text.setAttribute('x', String(route.label.x - origin.x)); text.setAttribute('y', String(route.label.y - origin.y - 12)); text.setAttribute('text-anchor', 'middle'); text.setAttribute('fill', getComputedStyle(document.body).color); text.textContent = link.label; svg.append(text); }
  }
  root.append(svg);
}
export async function exportBoard(context: ExportContext, selection = false, format: 'png' | 'pdf' = 'png'): Promise<Blob | null> {
  const board = context.workspace.scene.snapshot(), ids = context.workspace.selection.getSnapshot();
  const cards = (selection ? descendants(board, ids) : board.cards).filter(card => !effectiveFlag(board, card, 'hidden'));
  if (!cards.length) { context.notify('There are no visible cards to export'); return null; }
  try {
    context.notify('Preparing export…'); await document.fonts.ready;
    const raw = bounds(cards), extra = Math.max(40, ...cards.filter(card => card.rot).map(card => Math.hypot(card.w, card.h) / 2)), origin = { x: raw.x - extra, y: raw.y - extra }, width = Math.ceil(raw.right - raw.x + extra * 2), height = Math.ceil(raw.bottom - raw.y + extra * 2);
    const scale = Math.min(2, 8192 / Math.max(width, height), Math.sqrt(32_000_000 / (width * height)));
    const root = document.createElement('div'); root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); root.className = 'editing-export';
    Object.assign(root.style, { width: `${width}px`, height: `${height}px`, position: 'relative', background: board.bg || getComputedStyle(document.documentElement).getPropertyValue('--canvas') || '#000', font: getComputedStyle(document.body).font, color: getComputedStyle(document.body).color });
    const style = document.createElement('style'); style.textContent = [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; } }).join('\n') + '\n.editing-export .card{position:absolute!important;opacity:1!important;pointer-events:none!important}.editing-export :is(button,select,.resize,.drag-strip,.remove-item,.add-item){display:none!important}'; root.append(style);
    const variables = getComputedStyle(document.documentElement); for (const key of variables) if (key.startsWith('--')) root.style.setProperty(key, variables.getPropertyValue(key));
    drawLinks(root, board, cards, origin, width, height, context.services.linkGeometry);
    const output = document.createElement('canvas'); output.width = Math.ceil(width * scale); output.height = Math.ceil(height * scale); const drawing = context2d(output); drawing.fillStyle = board.bg || '#000'; drawing.fillRect(0, 0, output.width, output.height);
    async function raster(element: Element, w: number, h: number) {
      const markup = new XMLSerializer().serializeToString(element), svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w * scale)}" height="${Math.ceil(h * scale)}" viewBox="0 0 ${w} ${h}"><foreignObject width="${w}" height="${h}">${markup}</foreignObject></svg>`, image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not render the export')); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); return image;
    }
    drawing.drawImage(await raster(root, width, height), 0, 0);
    for (const card of cards) {
      const rendered = await context.services.renderCard(card), holder = document.createElement('div');
      try {
        const cloned = rendered.element.cloneNode(true); if (!(cloned instanceof HTMLElement)) throw new Error('Could not prepare this window for export');
        cloned.classList.remove('selected', 'glow', 'agent-ring');
        const boxes = rendered.element.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
        cloned.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((box, i) => { if (boxes[i]?.checked) box.setAttribute('checked', ''); else box.removeAttribute('checked'); });
        const media = await prepareExportCard(cloned, rendered.element, card, context.services.assetUrl), layer = root.cloneNode(false);
        if (!(layer instanceof HTMLElement)) throw new Error('Could not prepare the export layer');
        const pad = 40, w = card.w + pad * 2, h = card.h + pad * 2;
        layer.append(style.cloneNode(true)); Object.assign(layer.style, { width: `${w}px`, height: `${h}px`, background: 'transparent', position: 'relative', left: '0', top: '0', pointerEvents: 'none' }); layer.setAttribute('aria-hidden', 'true');
        Object.assign(cloned.style, { transform: `translate(${pad}px,${pad}px)`, width: `${card.w}px`, height: `${card.h}px` }); layer.append(cloned);
        Object.assign(holder.style, { position: 'fixed', left: '-100000px', top: '0', pointerEvents: 'none' }); holder.append(layer); document.body.append(holder);
        const rect = layer.getBoundingClientRect();
        const placements = media.map(({ node, image }) => { const box = node.getBoundingClientRect(), css = getComputedStyle(node), clip = node.closest('.image-viewport')?.getBoundingClientRect(); return { image, x: box.left - rect.left, y: box.top - rect.top, w: box.width, h: box.height, fit: css.objectFit, mirror: css.transform.startsWith('matrix(-1'), clip: clip ? { x: clip.left - rect.left, y: clip.top - rect.top, w: clip.width, h: clip.height } : null }; });
        const cardCanvas = document.createElement('canvas'); cardCanvas.width = Math.ceil(w * scale); cardCanvas.height = Math.ceil(h * scale); const paint = context2d(cardCanvas); paint.drawImage(await raster(layer, w, h), 0, 0); paint.scale(scale, scale); for (const media of placements) drawMedia(paint, media);
        drawing.save(); drawing.translate((card.x - origin.x + card.w / 2) * scale, (card.y - origin.y + card.h / 2) * scale); drawing.rotate((card.rot || 0) * Math.PI / 180); drawing.drawImage(cardCanvas, -(card.w / 2 + pad) * scale, -(card.h / 2 + pad) * scale); drawing.restore();
      } finally { holder.remove(); rendered.dispose(); }
    }
    const blob = format === 'pdf' ? imagePdf(output.toDataURL('image/jpeg', .95), output.width, output.height) : await new Promise<Blob | null>(resolve => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the export');
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `${board.name.replace(/[^a-z0-9 _-]/gi, '') || 'Board'}${selection ? '-selection' : ''}.${format}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); context.notify('Export downloaded'); return blob;
  } catch (cause) { context.notify(cause instanceof Error ? cause.message : 'Could not export this board'); return null; }
}
export type { CardId };
