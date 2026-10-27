import { fitBounds, project, union } from './geometry.js';
import type { CameraState, Rect } from './geometry.js';

export type ZoomTier = 'detail' | 'far';
export const FAR = 0.4;
export const LIVE_LIMIT = 400;

export interface LayoutItem<Id> {
  readonly id: Id;
  readonly bounds: Rect;
}
export interface DisplayRect extends Rect { readonly kind: ZoomTier }

/** Camera scale never changes a card's size, position or content representation. */
export function representationMode(zoom: number, visible: number): ZoomTier {
  return zoom < FAR && visible > LIVE_LIMIT ? 'far' : 'detail';
}

export function projectRepresentations<Id>(items: readonly LayoutItem<Id>[], camera: CameraState, mode: ZoomTier = 'detail'): ReadonlyMap<Id, DisplayRect> {
  return new Map(items.map(item => [item.id, { ...project(item.bounds, camera), kind: mode }]));
}

export function fitSpatial<Id>(items: readonly LayoutItem<Id>[], area: Rect, maxZoom = 1): CameraState {
  return fitBounds(union(items.map(item => item.bounds)), area, maxZoom);
}
