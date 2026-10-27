// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
export interface Crop { x: number; y: number; w: number; h: number }
export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function cropBox(start: Crop, handle: CropHandle, dx: number, dy: number, min = { w: .08, h: .08 }): Crop {
  const box = { ...start };
  if (handle === 'move') return { ...box, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
  if (handle.includes('w')) { box.x = clamp(start.x + dx, 0, start.x + start.w - min.w); box.w = start.x + start.w - box.x; }
  if (handle.includes('e')) box.w = clamp(start.w + dx, min.w, 1 - start.x);
  if (handle.includes('n')) { box.y = clamp(start.y + dy, 0, start.y + start.h - min.h); box.h = start.y + start.h - box.y; }
  if (handle.includes('s')) box.h = clamp(start.h + dy, min.h, 1 - start.y);
  return box;
}
export async function prepareImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  const source = URL.createObjectURL(file), image = new Image();
  try {
    image.src = source; await image.decode();
    const animated = ['image/gif', 'image/webp', 'image/apng'].includes(file.type);
    if (animated && file.size <= 12e6) return { file, width: image.naturalWidth, height: image.naturalHeight, flattened: false };
    const scale = Math.min(1, 2800 / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare this image');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encode = (type: string) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare this image')), type, .9));
    let blob = await encode(['image/png', 'image/svg+xml'].includes(file.type) ? 'image/png' : 'image/jpeg');
    if (blob.type === 'image/png' && 'data:image/png;base64,'.length + Math.ceil(blob.size / 3) * 4 >= 6e6) blob = await encode('image/jpeg');
    const name = file.name.replace(/\.[^.]+$/, '') + (blob.type === 'image/png' ? '.png' : '.jpg');
    return { file: new File([blob], name, { type: blob.type }), width: canvas.width, height: canvas.height, flattened: animated };
  } finally { URL.revokeObjectURL(source); }
}
