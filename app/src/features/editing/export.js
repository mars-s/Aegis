// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { bounds, effectiveFlag, descendants } from './model.js';
import { linkGeometry } from '../../canvas/engine.js';
export function imagePdf(jpeg, width, height) {
  const bytes = Uint8Array.from(atob(jpeg.split(',')[1]), c => c.charCodeAt(0)), encode = s => new TextEncoder().encode(s);
  const scale = Math.min(1, 1400 / Math.max(width, height)), w = width * scale, h = height * scale;
  const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ`, objects = [
    encode('<< /Type /Catalog /Pages 2 0 R >>'), encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    [encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`), bytes, encode('\nendstream')],
    encode(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`),
  ];
  const chunks = [encode('%PDF-1.4\n')], offsets = [0]; let length = chunks[0].length;
  objects.forEach((object, index) => { offsets.push(length); const parts = [encode(`${index + 1} 0 obj\n`), ...(Array.isArray(object) ? object : [object]), encode('\nendobj\n')]; chunks.push(...parts); length += parts.reduce((sum, p) => sum + p.length, 0); });
  chunks.push(encode(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
  return new Blob(chunks, { type: 'application/pdf' });
}
export async function exportBoard(ctx, selection = false, format = 'png') {
  const { canvas, toast } = ctx;
  const cards = (selection ? descendants(canvas.board, canvas.selection()) : canvas.board.cards).filter(c => !effectiveFlag(canvas.board, c, 'hidden'));
  if (!cards.length) return toast('There are no visible cards to export');
  const rendered = [];
  try {
    toast('Preparing export…');
    const raw = bounds(cards), extra = Math.max(40, ...cards.filter(c => c.rot).map(c => Math.hypot(c.w, c.h) / 2)), b = { x: raw.x - extra, y: raw.y - extra }, width = Math.ceil(raw.right - raw.x + extra * 2), height = Math.ceil(raw.bottom - raw.y + extra * 2);
    const scale = Math.min(2, 8192 / Math.max(width, height), Math.sqrt(32_000_000 / (width * height)));
    const root = document.createElement('div'); root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); root.className = 'editing-export'; Object.assign(root.style, { width: `${width}px`, height: `${height}px`, position: 'relative', background: canvas.board.bg || getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#fff' });
    root.style.font = getComputedStyle(document.body).font; root.style.color = getComputedStyle(document.body).color;
    const css = [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; } }).join('\n');
    const style = document.createElement('style'); style.textContent = css + '\n.editing-export .card { position:absolute!important; opacity:1!important; pointer-events:none!important; } .editing-export .resize,.editing-export .drag-strip,.editing-export .ghost,.editing-export .remove-item,.editing-export .add-item,.editing-export button,.editing-export .media-actions,.editing-export .recorder-choices,.editing-export .device-choices,.editing-export input[type=file],.editing-export select{display:none!important}'; root.append(style);
    const variables = getComputedStyle(document.documentElement); for (let i = 0; i < variables.length; i++) { const key = variables[i]; if (key.startsWith('--')) root.style.setProperty(key, variables.getPropertyValue(key)); }
    const links = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); links.setAttribute('width', String(width)); links.setAttribute('height', String(height)); Object.assign(links.style, { position: 'absolute', inset: '0', overflow: 'visible' });
    const ids = new Set(cards.map(c => c.id));
    for (const link of canvas.board.links.filter(l => ids.has(l.a) && ids.has(l.b))) {
      const g = linkGeometry(link, cards.find(c => c.id === link.a), cards.find(c => c.id === link.b));
      const path = document.createElementNS(links.namespaceURI, 'path'); path.setAttribute('d', `M${g.p0.x - b.x} ${g.p0.y - b.y} Q${g.control.x - b.x} ${g.control.y - b.y} ${g.p2.x - b.x} ${g.p2.y - b.y}`); path.setAttribute('fill', 'none'); path.setAttribute('stroke', link.colour || '#888'); path.setAttribute('stroke-width', '2'); if (link.dash) path.setAttribute('stroke-dasharray', '8 6'); links.append(path);
      const arrow = (tip, from) => { const dx = tip.x - from.x, dy = tip.y - from.y, length = Math.hypot(dx, dy) || 1, x = dx / length, y = dy / length, head = document.createElementNS(links.namespaceURI, 'path'); head.setAttribute('d', `M${tip.x - b.x - x * 11 - y * 5} ${tip.y - b.y - y * 11 + x * 5} L${tip.x - b.x} ${tip.y - b.y} L${tip.x - b.x - x * 11 + y * 5} ${tip.y - b.y - y * 11 - x * 5}`); head.setAttribute('fill', 'none'); head.setAttribute('stroke', link.colour || '#888'); head.setAttribute('stroke-width', '2'); links.append(head); };
      if (link.arrow === 'end' || link.arrow === 'both' || link.arrow === true) arrow(g.p2, g.control);
      if (link.arrow === 'both') arrow(g.p0, g.control);
      if (link.label) { const text = document.createElementNS(links.namespaceURI, 'text'); text.setAttribute('x', String(g.handle.x - b.x)); text.setAttribute('y', String(g.handle.y - b.y - 12)); text.setAttribute('text-anchor', 'middle'); text.setAttribute('fill', getComputedStyle(document.body).color); text.textContent = link.label; links.append(text); }

    }
    root.append(links);
    const output = document.createElement('canvas'); output.width = Math.ceil(width * scale); output.height = Math.ceil(height * scale); const drawing = output.getContext('2d'); drawing.fillStyle = canvas.board.bg || '#ffffff'; drawing.fillRect(0, 0, output.width, output.height);
    const raster = async (element, w, h) => {
      const markup = new XMLSerializer().serializeToString(element), svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w * scale)}" height="${Math.ceil(h * scale)}" viewBox="0 0 ${w} ${h}"><foreignObject width="${w}" height="${h}">${markup}</foreignObject></svg>`;
      const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Could not render the export')); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); return image;
    };
    drawing.drawImage(await raster(root, width, height), 0, 0);
    for (const card of cards) {
      const mounted = canvas.mountedEl(card.id), original = mounted || canvas.exportCard(card); if (!mounted) rendered.push(original);
      const el = original.cloneNode(true); el.classList.remove('selected', 'glow', 'agent-ring');
      el.querySelectorAll('input[type=checkbox]').forEach((box, i) => { if (card.items?.[i]?.done) box.setAttribute('checked', ''); else box.removeAttribute('checked'); });
      const media = await prepareExportCard(el, original, card, ctx.host.assetUrl);
      const layer = root.cloneNode(false), pad = 40, w = card.w + pad * 2, h = card.h + pad * 2;
      layer.append(style.cloneNode(true)); Object.assign(layer.style, { width: `${w}px`, height: `${h}px`, background: 'transparent', position: 'relative', left: '0', top: '0', pointerEvents: 'none' }); layer.setAttribute('aria-hidden', 'true');
      el.style.transform = `translate(${pad}px, ${pad}px)`; layer.append(el);
      const measure = document.createElement('div'); Object.assign(measure.style, { position: 'fixed', left: '-100000px', top: '0', pointerEvents: 'none' }); measure.append(layer); document.body.append(measure);
      try {
        // Read media geometry once, before serialisation or drawing. The card is upright here.
        const r = layer.getBoundingClientRect();
        const overlays = media.map(({ node, image }) => {
          const box = node.getBoundingClientRect(), css = getComputedStyle(node), viewport = node.closest('.image-viewport'), clip = viewport?.getBoundingClientRect();
          return { image, x: box.left - r.left, y: box.top - r.top, w: box.width, h: box.height, fit: css.objectFit, mirror: css.transform.startsWith('matrix(-1'), clip: clip ? { x: clip.left - r.left, y: clip.top - r.top, w: clip.width, h: clip.height } : null };
        });
        const cardCanvas = document.createElement('canvas'); cardCanvas.width = Math.ceil(w * scale); cardCanvas.height = Math.ceil(h * scale); const paint = cardCanvas.getContext('2d'); paint.drawImage(await raster(layer, w, h), 0, 0); paint.scale(scale, scale);
        for (const media of overlays) drawMedia(paint, media);
        drawing.save(); drawing.translate((card.x - b.x + card.w / 2) * scale, (card.y - b.y + card.h / 2) * scale); drawing.rotate((card.rot || 0) * Math.PI / 180); drawing.drawImage(cardCanvas, -(card.w / 2 + pad) * scale, -(card.h / 2 + pad) * scale); drawing.restore();
      } finally { measure.remove(); }
    }
    const blob = format === 'pdf' ? imagePdf(output.toDataURL('image/jpeg', .95), output.width, output.height) : await new Promise(resolve => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the export');
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${(canvas.board.name || 'Board').replace(/[^a-z0-9 _-]/gi, '')}${selection ? '-selection' : ''}.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Export downloaded');
  } catch (error) { toast(error.message || 'Could not export this board'); }
  finally { rendered.forEach(el => canvas.releaseCard(el)); }
}

async function dataImage(url) {
  const response = await fetch(url); if (!response.ok) throw new Error('Could not load an image for export');
  const blob = await response.blob();
  const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  const image = new Image(); image.src = src; await image.decode(); return image;
}
async function videoFrame(video) {
  if (video.readyState < 2) await new Promise(resolve => { const done = () => { clearTimeout(timer); video.removeEventListener('loadeddata', done); video.removeEventListener('error', done); resolve(); }; const timer = setTimeout(done, 4000); video.addEventListener('loadeddata', done); video.addEventListener('error', done); video.preload = 'auto'; video.load(); });
  if (!video.videoWidth) return null;
  try { const frame = document.createElement('canvas'); frame.width = video.videoWidth; frame.height = video.videoHeight; frame.getContext('2d').drawImage(video, 0, 0); const image = new Image(); image.src = frame.toDataURL('image/png'); await image.decode(); return image; } catch { return null; }
}
export async function prepareExportCard(el, original, card, resolveUrl = url => url) {
  const media = [];
  for (const [i, video] of [...el.querySelectorAll('video')].entries()) {
    const source = original.querySelectorAll('video')[i], poster = video.poster || card.props?.poster;
    const image = poster ? await dataImage(resolveUrl(poster)) : await videoFrame(source);
    if (image) { const node = document.createElement('img'); node.className = video.className + ' media-poster'; node.style.cssText = video.style.cssText; node.src = image.src; node.alt = card.text || 'Video poster'; video.replaceWith(node); media.push({ node, image }); }
    else { const placeholder = document.createElement('p'); placeholder.textContent = card.text || 'Video'; video.replaceWith(placeholder); }
  }
  const posters = new Set(media.map(m => m.node));
  for (const node of el.querySelectorAll('img')) {
    if (posters.has(node)) continue;
    const image = await dataImage(node.src); node.src = image.src; node.loading = 'eager'; media.push({ node, image });
  }
  el.querySelectorAll('input:not([type=checkbox]),textarea').forEach(node => { const text = document.createElement('span'); text.className = node.className; text.textContent = node.value; node.replaceWith(text); });
  el.querySelectorAll('button,select,.media-actions,.recorder-choices,.device-choices,.resize,.drag-strip,.remove-item,.add-item').forEach(node => node.remove());
  el.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
  el.querySelectorAll('iframe,audio').forEach(node => { const text = document.createElement('p'); text.textContent = card.text || card.url || card.type; node.replaceWith(text); });
  return media;
}
function drawMedia(paint, media) {
  const { image, x, y, w, h, fit, mirror, clip } = media; if (!w || !h) return;
  const iw = image.naturalWidth, ih = image.naturalHeight, ratio = fit === 'cover' ? Math.max(w / iw, h / ih) : fit === 'contain' ? Math.min(w / iw, h / ih) : null;
  const dw = ratio === null ? w : iw * ratio, dh = ratio === null ? h : ih * ratio;
  paint.save(); paint.beginPath(); const c = clip || { x, y, w, h }; paint.rect(c.x, c.y, c.w, c.h); paint.clip();
  paint.translate(x + w / 2, y + h / 2); if (mirror) paint.scale(-1, 1); paint.drawImage(image, -dw / 2, -dh / 2, dw, dh); paint.restore();
}
