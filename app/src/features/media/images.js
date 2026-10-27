// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { node, button, field, dialog } from './dom.js';
import { paletteFromPixels } from '../colors/model.js';
import { mediaContext, report } from './context.js';
export { cropBox, prepareImage } from './image-utils.ts';
import { cropBox, prepareImage } from './image-utils.ts';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export async function pullColours(c, api) {
  try {
    const boardId = api.board.id, img = new Image(); img.crossOrigin = 'anonymous'; img.src = api.resolveUrl(c.url); await img.decode();
    const cv = node('canvas'); const scale = 100 / Math.max(img.naturalWidth, img.naturalHeight); cv.width = Math.max(1, Math.round(img.naturalWidth * scale)); cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
    const colours = paletteFromPixels(g.getImageData(0, 0, cv.width, cv.height).data);
    if (api.board.id !== boardId) return;
    if (colours.length) api.apply(colours.map((hex, i) => ({ op: 'create', type: 'swatch', x: c.x + c.w + 30 + i * 180, y: c.y + (i % 2) * 18, props: { hex, label: ['main','second','accent','shadow','pop'][i], autoName: false, role: ['main','second','accent','shadow','pop'][i] } })));
    mediaContext()?.toast(`Pulled ${colours.length} colours from the image`);
  } catch (e) { report(new Error(`Could not read image colours. ${e.message}`)); }
}
export function caption(c, api) {
  const d = dialog('Image caption'), input = field('Caption', 'text', c.props?.tagText || '', d), boardId = api.board.id;
  button('Save caption', () => { if (api.board.id === boardId) api.setProps(c.id, { tagText: input.value || null }); d.close(); }, d);
  button('Cancel', () => d.close(), d); input.focus();
}
export async function editCrop(c, api) {
  const boardId = api.board.id, opener = document.activeElement;
  const { createStepper } = await import('../../lib/ui/stepper.js');
  if (api.board.id !== boardId) return;
  const d = dialog('Crop image'), preview = node('div', 'crop-preview'), frame = node('div', 'crop-frame'), img = node('img');
  d.addEventListener('close', () => {
    const target = opener?.isConnected ? opener : document.querySelector(`.card[data-id="${CSS.escape(c.id)}"] .image-actions button:nth-child(2)`);
    target?.focus({ preventScroll: true });
  }, { once: true });
  const shade = node('div', 'crop-shade'), cutout = node('div'), box = button('', () => {}, frame);
  const help = node('p', 'crop-help', 'Arrow keys move the area or resize a corner by 1 pixel. Hold Shift for 10 pixels. All values use the original image.');
  help.id = 'crop-help'; d.classList.add('crop-dialog');
  const status = node('p', 'crop-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  shade.setAttribute('aria-hidden', 'true'); shade.append(cutout); frame.prepend(img, shade); preview.append(frame); d.append(preview, help);
  let crop = { x: 0, y: 0, w: 1, h: 1, ...c.props?.crop };
  const handles = [], fields = new Map(), geometry = () => ({ x: Math.round(crop.x * img.naturalWidth), y: Math.round(crop.y * img.naturalHeight), w: Math.round(crop.w * img.naturalWidth), h: Math.round(crop.h * img.naturalHeight) });
  const minimum = () => ({ w: Math.ceil(img.naturalWidth * .08), h: Math.ceil(img.naturalHeight * .08) });
  function setGeometry(b) {
    const min = minimum();
    b.w = clamp(Math.round(b.w), min.w, img.naturalWidth); b.h = clamp(Math.round(b.h), min.h, img.naturalHeight);
    b.x = clamp(Math.round(b.x), 0, img.naturalWidth - b.w); b.y = clamp(Math.round(b.y), 0, img.naturalHeight - b.h);
    crop = { x: b.x / img.naturalWidth, y: b.y / img.naturalHeight, w: b.w / img.naturalWidth, h: b.h / img.naturalHeight };
  }
  function update(preserveDraft = false) {
    const ready = !!img.naturalWidth;
    if (ready) setGeometry(geometry());
    const b = geometry(), min = minimum();
    for (const el of [box, cutout]) Object.assign(el.style, { left: crop.x * 100 + '%', top: crop.y * 100 + '%', width: crop.w * 100 + '%', height: crop.h * 100 + '%' });
    for (const h of handles) Object.assign(h.style, { left: (crop.x + (h.dataset.handle.includes('e') ? crop.w : 0)) * 100 + '%', top: (crop.y + (h.dataset.handle.includes('s') ? crop.h : 0)) * 100 + '%' });
    for (const [key, { input, setValue }] of fields) {
      input.disabled = !ready;
      if (!preserveDraft || input !== document.activeElement) setValue(ready ? b[key] : '');
      input.min = String(key === 'w' || key === 'h' ? min[key] : 0);
      input.max = String(({ x: img.naturalWidth - b.w, y: img.naturalHeight - b.h, w: img.naturalWidth - b.x, h: img.naturalHeight - b.y })[key]);
      for (const control of input.parentElement.querySelectorAll('button')) control.disabled = !ready;
    }
    doneButton.disabled = !ready;
    status.textContent = ready ? `X ${b.x}, Y ${b.y}, width ${b.w}, height ${b.h} pixels.` : 'Loading image…';
  }
  function control(el, handle, label) {
    el.tabIndex = 0; el.dataset.handle = handle; el.setAttribute('aria-label', label); el.setAttribute('aria-describedby', 'crop-help');
    el.onkeydown = e => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!direction || !img.naturalWidth) return;
      e.preventDefault(); const step = e.shiftKey ? 10 : 1, min = minimum();
      crop = cropBox(crop, handle, direction[0] * step / img.naturalWidth, direction[1] * step / img.naturalHeight, { w: min.w / img.naturalWidth, h: min.h / img.naturalHeight }); update();
    };
    el.onpointerdown = e => {
      if (e.button !== 0 || !img.naturalWidth) return;
      e.preventDefault(); e.stopPropagation(); el.focus({ preventScroll: true });
      const r = frame.getBoundingClientRect(), start = { ...crop }, x = e.clientX, y = e.clientY, min = minimum();
      el.setPointerCapture(e.pointerId);
      el.onpointermove = ev => { crop = cropBox(start, handle, (ev.clientX - x) / r.width, (ev.clientY - y) / r.height, { w: min.w / img.naturalWidth, h: min.h / img.naturalHeight }); update(); };
      el.onpointerup = () => { el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; }; el.onpointercancel = el.onpointerup;
    };
  }
  box.className = 'crop-box'; control(box, 'move', 'Crop area');
  for (const [corner, label] of [['nw', 'Top-left'], ['ne', 'Top-right'], ['sw', 'Bottom-left'], ['se', 'Bottom-right']]) {
    const h = button('', () => {}, frame); h.className = `crop-handle ${corner}`; control(h, corner, `${label} crop handle`); handles.push(h);
  }
  const geometryFields = node('div', 'crop-fields'); d.append(geometryFields, status);
  for (const [key, name] of [['x', 'X'], ['y', 'Y'], ['w', 'Width'], ['h', 'Height']]) {
    const row = node('div', 'crop-field'), label = node('label', '', name);
    const { el, input, setValue } = createStepper({ label: name, min: 0, step: 1, onChange: value => {
      if (!img.naturalWidth) return;
      const b = geometry(); b[key] = clamp(Math.round(Number(value)), Number(input.min), Number(input.max)); setGeometry(b);
      setValue(geometry()[key]); update(true);
    } });
    input.type = 'number'; input.step = '1'; input.id = `crop-${key}`; label.htmlFor = input.id;
    // Arrow keys provide the stepper actions without adding eight extra Tab stops.
    for (const button of el.querySelectorAll('button')) button.tabIndex = -1;
    fields.set(key, { input, setValue }); row.append(label, el); geometryFields.append(row);
  }
  const actions = node('div', 'media-actions'); d.append(actions);
  button('Reset', () => { crop = { x: 0, y: 0, w: 1, h: 1 }; update(); }, actions);
  button('Cancel', () => d.close(), actions);
  const done = () => {
    if (!img.naturalWidth || api.board.id !== boardId) return;
    for (const { input } of fields.values()) if (input === document.activeElement) input.dispatchEvent(new Event('change'));
    api.apply([{ op: 'update', id: c.id, set: { props: { crop: crop.w === 1 && crop.h === 1 ? null : crop }, h: Math.max(60, c.w * img.naturalHeight * crop.h / (img.naturalWidth * crop.w) + (c.props?.tagText ? 28 : 0)) } }]); d.close();
  };
  const doneButton = button('Done', done, actions);
  for (const action of actions.children) action.tabIndex = 0;
  d.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.target.closest('.media-actions, .aegis-stepper button')) { e.preventDefault(); done(); }
  });
  img.onload = () => update(true); img.onerror = () => { status.textContent = 'Could not load this image. Cancel and try again.'; };
  img.draggable = false; img.alt = c.text || 'Image to crop'; img.src = api.resolveUrl(c.url); update(); box.focus({ preventScroll: true });
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
      const prepared = await prepareImage(file);
      if (prepared.flattened) ctx.toast('This animated file is over 12 MB. A still image was imported.');
      const saved = await ctx.host.upload(prepared.file), w = 320, h = Math.max(60, w * prepared.height / prepared.width);
      const commands = [{ op: 'create', type: 'image', url: saved.url, text: file.name.replace(/\.[^.]+$/, ''), x: at.x + dx, y: at.y, w, h }];
      if (ctx.canvas.board.id === boardId) ctx.apply(commands); else await ctx.host.post(`/boards/${boardId}/batch`, { commands }); dx += w + 24;
    } catch (error) { report(error); }
  }
}
