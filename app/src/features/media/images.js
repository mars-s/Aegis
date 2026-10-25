// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { node, button, field, dialog } from './dom.js';
import { paletteFromPixels, colorName } from '../colors/model.js';
import { mediaContext, report } from './context.js';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function cropBox(start, handle, dx, dy) {
  const b = { ...start }, min = .08;
  if (handle === 'move') { b.x = clamp(start.x + dx, 0, 1 - start.w); b.y = clamp(start.y + dy, 0, 1 - start.h); return b; }
  if (handle.includes('w')) { b.x = clamp(start.x + dx, 0, start.x + start.w - min); b.w = start.x + start.w - b.x; }
  if (handle.includes('e')) b.w = clamp(start.w + dx, min, 1 - start.x);
  if (handle.includes('n')) { b.y = clamp(start.y + dy, 0, start.y + start.h - min); b.h = start.y + start.h - b.y; }
  if (handle.includes('s')) b.h = clamp(start.h + dy, min, 1 - start.y);
  return b;
}
export async function pullColours(c, api) {
  try {
    const boardId = api.board.id, img = new Image(); img.crossOrigin = 'anonymous'; img.src = api.resolveUrl(c.url); await img.decode();
    const cv = node('canvas'); const scale = 100 / Math.max(img.naturalWidth, img.naturalHeight); cv.width = Math.max(1, Math.round(img.naturalWidth * scale)); cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
    const colours = paletteFromPixels(g.getImageData(0, 0, cv.width, cv.height).data);
    if (api.board.id !== boardId) return;
    if (colours.length) api.apply(colours.map((hex, i) => ({ op: 'create', type: 'swatch', x: c.x + c.w + 30 + i * 180, y: c.y + (i % 2) * 18, props: { hex, label: colorName(hex), autoName: true, role: ['main','second','accent','shadow','pop'][i] } })));
    mediaContext()?.toast(`Pulled ${colours.length} colours from the image`);
  } catch (e) { report(new Error(`Could not read image colours. ${e.message}`)); }
}
export function caption(c, api) {
  const d = dialog('Image caption'), input = field('Caption', 'text', c.props?.tagText || '', d), boardId = api.board.id;
  button('Save caption', () => { if (api.board.id === boardId) api.setProps(c.id, { tagText: input.value || null }); d.close(); }, d);
  button('Cancel', () => d.close(), d); input.focus();
}
export function editCrop(c, api) {
  const d = dialog('Crop image'), frame = node('div', 'crop-frame'), img = node('img'), box = node('div', 'crop-box'), boardId = api.board.id;
  let crop = { x: 0, y: 0, w: 1, h: 1, ...c.props?.crop };
  img.draggable = false; img.alt = c.text || 'Image to crop'; img.src = api.resolveUrl(c.url); frame.append(img, box); d.append(frame);
  const update = () => Object.assign(box.style, { left: crop.x * 100 + '%', top: crop.y * 100 + '%', width: crop.w * 100 + '%', height: crop.h * 100 + '%' });
  for (const corner of ['nw','ne','sw','se']) { const h = node('i', `crop-handle ${corner}`); h.dataset.handle = corner; box.append(h); }
  box.onpointerdown = e => {
    e.preventDefault(); e.stopPropagation(); const r = frame.getBoundingClientRect(), start = { ...crop }, x = e.clientX, y = e.clientY, handle = e.target.dataset.handle || 'move';
    box.setPointerCapture(e.pointerId);
    box.onpointermove = ev => { crop = cropBox(start, handle, (ev.clientX - x) / r.width, (ev.clientY - y) / r.height); update(); };
    box.onpointerup = () => { box.onpointermove = null; box.onpointerup = null; }; box.onpointercancel = box.onpointerup;
  };
  const actions = node('div', 'media-actions'); d.append(actions);
  button('Reset', () => { crop = { x: 0, y: 0, w: 1, h: 1 }; update(); }, actions);
  button('Cancel', () => d.close(), actions);
  const done = () => {
    if (!img.naturalWidth || api.board.id !== boardId) return;
    api.apply([{ op: 'update', id: c.id, set: { props: { crop: crop.w > .995 && crop.h > .995 ? null : crop }, h: Math.max(60, c.w * img.naturalHeight * crop.h / (img.naturalWidth * crop.w) + (c.props?.tagText ? 28 : 0)) } }]); d.close();
  };
  button('Done', done, actions); d.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } }); update();
}
export function renderImage(el, c, api) {
  const viewport = node('div', 'image-viewport'), img = node('img'), actions = node('div', 'media-actions image-actions'); img.draggable = false; img.decoding = 'async'; img.loading = 'lazy'; img.alt = c.props?.tagText || c.text || 'Image'; img.src = api.resolveUrl(c.url);
  const crop = c.props?.crop;
  if (crop && crop.w >= .08 && crop.h >= .08) Object.assign(img.style, { position: 'absolute', width: `${100 / crop.w}%`, height: `${100 / crop.h}%`, maxWidth: 'none', left: `${-100 * crop.x / crop.w}%`, top: `${-100 * crop.y / crop.h}%`, objectFit: 'fill' });
  viewport.append(img); el.append(viewport);
  if (c.props?.tagText) el.append(node('div', 'image-caption', c.props.tagText));
  button('Pull colours', () => pullColours(c, api), actions); button('Crop', () => editCrop(c, api), actions); button('Caption', () => caption(c, api), actions); el.append(actions);
}
export async function importImages(ctx, files, at = ctx.canvas.centre()) {
  const boardId = ctx.canvas.board.id; let dx = 0;
  for (const file of files) {
    try {
      if (!file.type.startsWith('image/')) continue;
      const original = URL.createObjectURL(file), img = new Image(); let upload = file;
      try {
        img.src = original; await img.decode();
        if (!['image/gif','image/webp','image/apng'].includes(file.type) || file.size > 12e6) {
          const scale = Math.min(1, 2800 / Math.max(img.naturalWidth, img.naturalHeight)), cv = node('canvas'); cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          const blob = await new Promise(resolve => cv.toBlob(resolve, ['image/png','image/svg+xml'].includes(file.type) ? 'image/png' : 'image/jpeg', .9));
          if (!blob) throw new Error('Could not prepare this image'); upload = new File([blob], file.name, { type: blob.type });
          if (['image/gif','image/webp','image/apng'].includes(file.type)) ctx.toast('This animated file is over 12 MB. A still image was imported.');
        }
        const saved = await ctx.host.upload(upload), w = 320, h = Math.max(60, w * img.naturalHeight / img.naturalWidth);
        const commands = [{ op: 'create', type: 'image', url: saved.url, text: file.name.replace(/\.[^.]+$/, ''), x: at.x + dx, y: at.y, w, h }];
        if (ctx.canvas.board.id === boardId) ctx.apply(commands); else await ctx.host.post(`/boards/${boardId}/batch`, { commands }); dx += w + 24;
      } finally { URL.revokeObjectURL(original); }
    } catch (error) { report(error); }
  }
}
