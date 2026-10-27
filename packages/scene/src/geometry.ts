export interface Point { readonly x: number; readonly y: number }
export interface Rect extends Point { readonly width: number; readonly height: number }
export interface CameraState extends Point { readonly zoom: number }
export interface Bounds { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }

export const intersects = (a: Rect, b: Rect): boolean => a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
export const contains = (area: Rect, r: Rect): boolean => r.x >= area.x && r.y >= area.y && r.x + r.width <= area.x + area.width && r.y + r.height <= area.y + area.height;
export const toBounds = (r: Rect): Bounds => ({ minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height });
export const fromBounds = (r: Bounds): Rect => ({ x: r.minX, y: r.minY, width: r.maxX - r.minX, height: r.maxY - r.minY });
export const project = (r: Rect, camera: CameraState): Rect => ({ x: r.x * camera.zoom + camera.x, y: r.y * camera.zoom + camera.y, width: r.width * camera.zoom, height: r.height * camera.zoom });
export const unproject = (p: Point, camera: CameraState): Point => ({ x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom });
export const clampZoom = (zoom: number): number => Math.max(0.05, Math.min(4, zoom));

export function rotatedBounds(rect: Rect, rotation: number): Bounds {
  const angle = rotation * Math.PI / 180;
  const width = Math.abs(rect.width * Math.cos(angle)) + Math.abs(rect.height * Math.sin(angle));
  const height = Math.abs(rect.width * Math.sin(angle)) + Math.abs(rect.height * Math.cos(angle));
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return { minX: cx - width / 2, minY: cy - height / 2, maxX: cx + width / 2, maxY: cy + height / 2 };
}

export function hitRotated(point: Point, rect: Rect, rotation: number): boolean {
  const angle = -rotation * Math.PI / 180;
  const x = point.x - rect.x - rect.width / 2, y = point.y - rect.y - rect.height / 2;
  const px = x * Math.cos(angle) - y * Math.sin(angle), py = x * Math.sin(angle) + y * Math.cos(angle);
  return Math.abs(px) <= rect.width / 2 && Math.abs(py) <= rect.height / 2;
}

export function union(rectangles: Iterable<Rect>): Rect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rectangles) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function fitBounds(bounds: Rect | null, area: Rect, maxZoom = 1): CameraState {
  if (!bounds) return { x: area.x + area.width / 2, y: area.y + area.height / 2, zoom: 1 };
  const zoom = clampZoom(Math.min(maxZoom, area.width / Math.max(1, bounds.width), area.height / Math.max(1, bounds.height)));
  return { x: area.x + area.width / 2 - (bounds.x + bounds.width / 2) * zoom, y: area.y + area.height / 2 - (bounds.y + bounds.height / 2) * zoom, zoom };
}
