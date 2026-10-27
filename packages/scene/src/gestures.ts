import type { Point, Rect } from './geometry.js';

/** Resize around the opposite corner, in the card's local rotated axes. */
export function resizeRect(base: Rect, delta: Point, rotation: number, minimum: Pick<Rect, 'width' | 'height'> = { width: 80, height: 40 }): Rect {
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const width = Math.min(4000, Math.max(minimum.width, Math.round(base.width + delta.x * cos + delta.y * sin)));
  const height = Math.min(4000, Math.max(minimum.height, Math.round(base.height - delta.x * sin + delta.y * cos)));
  const dx = (width - base.width) / 2, dy = (height - base.height) / 2;
  return { x: base.x + dx * cos - dy * sin - dx, y: base.y + dx * sin + dy * cos - dy, width, height };
}

export function angleFrom(point: Point, centre: Point): number {
  return Math.atan2(point.y - centre.y, point.x - centre.x) * 180 / Math.PI;
}

export function rotationDelta(start: number, current: number): number {
  return ((current - start + 540) % 360) - 180;
}
