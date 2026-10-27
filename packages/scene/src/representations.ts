import { contains, fitBounds, intersects, project, union } from './geometry.js';
import type { CameraState, Rect } from './geometry.js';

export type ZoomTier = 'detail' | 'summary' | 'cluster';
export const SUMMARY_GAP = 24;

export function zoomTier(zoom: number, previous: ZoomTier = 'detail'): ZoomTier {
  if (zoom < 0.2 || previous === 'cluster' && zoom < 0.23) return 'cluster';
  if (zoom < 0.7 || previous !== 'detail' && zoom < 0.76) return 'summary';
  return 'detail';
}

/** Readability is independent of the board's tier for data windows. */
export function cardTier(kind: string, zoom: number, previous: ZoomTier = 'detail', tier = zoomTier(zoom, previous)): ZoomTier {
  if (tier === 'cluster') return tier;
  const minimum = kind === 'dataset' ? 12 / 11 : ['plot', 'sheet', 'table'].includes(kind) ? 1 : 0;
  return minimum ? zoom < minimum ? 'summary' : 'detail' : tier;
}

export interface LayoutItem<Id> {
  readonly id: Id;
  readonly bounds: Rect;
  readonly summarised: boolean;
  readonly kind: string;
}
export interface DisplayRect extends Rect { readonly kind: ZoomTier }
export const summarySize = (width: number): { readonly width: number; readonly height: number } => ({ width: Math.max(240, Math.min(360, width * 0.5)), height: 128 });
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width + SUMMARY_GAP && a.x + a.width + SUMMARY_GAP > b.x && a.y < b.y + b.height + SUMMARY_GAP && a.y + a.height + SUMMARY_GAP > b.y;

/** Sparse screen-space cells avoid comparing every candidate to every summary. */
class OccupancyGrid {
  readonly cells = new Map<string, Rect[]>();
  insert(rect: Rect): void {
    this.visit(rect, key => { const bucket = this.cells.get(key); if (bucket) bucket.push(rect); else this.cells.set(key, [rect]); return false; });
  }
  collides(rect: Rect): boolean {
    return this.visit(rect, key => this.cells.get(key)?.some(other => overlaps(rect, other)) ?? false);
  }
  private visit(rect: Rect, fn: (key: string) => boolean): boolean {
    const left = Math.floor((rect.x - SUMMARY_GAP / 2) / 128), right = Math.floor((rect.x + rect.width + SUMMARY_GAP / 2) / 128);
    const top = Math.floor((rect.y - SUMMARY_GAP / 2) / 128), bottom = Math.floor((rect.y + rect.height + SUMMARY_GAP / 2) / 128);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (fn(`${x}:${y}`)) return true;
    return false;
  }
}

export class RepresentationLayout<Id> {
  private previous = new Map<Id, DisplayRect>();
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private items: readonly LayoutItem<Id>[] = [];
  private area: Rect | null = null;
  private tier: ZoomTier = 'detail';
  private obstacles: readonly Rect[] = [];
  private packed = new Set<Id>();
  private eligible = new Set<Id>();

  layout(items: readonly LayoutItem<Id>[], camera: CameraState, tier: ZoomTier, area: Rect, obstacles: readonly Rect[] = []): ReadonlyMap<Id, DisplayRect> {
    const dx = camera.x - this.camera.x, dy = camera.y - this.camera.y;
    if (camera.zoom === this.camera.zoom && tier === this.tier && this.area && area.x === this.area.x && area.y === this.area.y && area.width === this.area.width && area.height === this.area.height && items.length === this.items.length && items.every((item, index) => item === this.items[index]) && obstacles.length === this.obstacles.length && obstacles.every((r, index) => { const old = this.obstacles[index]; return old && old.x === r.x && old.y === r.y && old.width === r.width && old.height === r.height; })) {
      let valid = !obstacles.length || dx === 0 && dy === 0;
      for (const item of items) {
        if (!valid) break;
        const old = this.previous.get(item.id);
        if (!old) { valid = false; break; }
        if (this.packed.has(item.id) && !contains(area, { ...old, x: old.x + dx, y: old.y + dy })) { valid = false; break; }
        if (old.kind === 'summary') {
          const p = project(item.bounds, camera);
          const visible = intersects({ ...p, width: Math.max(p.width, old.width), height: Math.max(p.height, old.height) }, area);
          if (visible !== this.eligible.has(item.id)) valid = false;
        }
      }
      if (valid) {
        if (dx || dy) {
          const translated = new Map<Id, DisplayRect>();
          for (const [id, r] of this.previous) translated.set(id, { ...r, x: r.x + dx, y: r.y + dy });
          this.previous = translated;
        }
        this.camera = camera;
        return this.previous;
      }
    }
    const output = new Map<Id, DisplayRect>(), grid = new OccupancyGrid();
    const packed = new Set<Id>(), eligible = new Set<Id>();
    for (const obstacle of obstacles) grid.insert(obstacle);
    for (const item of items) {
      const projected = project(item.bounds, camera);
      const old = this.previous.get(item.id);
      const level = cardTier(item.kind, camera.zoom, old?.kind ?? 'detail', tier);
      if (!item.summarised || level !== 'summary') { output.set(item.id, { ...projected, kind: level }); continue; }
      const size = summarySize(item.bounds.width);
      const width = Math.min(size.width, Math.max(220, area.width));
      const anchor: DisplayRect = { ...projected, width, height: size.height, kind: 'summary' };
      if (!intersects({ ...projected, width: Math.max(projected.width, width), height: Math.max(projected.height, size.height) }, area)) { output.set(item.id, anchor); continue; }
      eligible.add(item.id);
      const clamp = (x: number, y: number): DisplayRect => ({ ...anchor, x: Math.max(area.x, Math.min(area.x + area.width - width, x)), y: Math.max(area.y, Math.min(area.y + area.height - size.height, y)) });
      let placed: DisplayRect | null = null;
      const accept = (candidate: DisplayRect): boolean => {
        if (!contains(area, candidate) || grid.collides(candidate)) return false;
        placed = candidate; return true;
      };
      if (old?.kind === 'summary' && this.camera.zoom === camera.zoom && old.width === width) accept({ ...anchor, x: old.x + dx, y: old.y + dy });
      if (!placed) accept(clamp(anchor.x, anchor.y));
      // Only screen cells that can hold this summary are candidates.
      const origin = clamp(anchor.x, anchor.y);
      if (!placed) {
        const xs = new Set([origin.x, area.x, area.x + area.width - width]);
        const ys = new Set([origin.y, area.y, area.y + area.height - size.height]);
        for (let x = origin.x - width - SUMMARY_GAP; x >= area.x; x -= width + SUMMARY_GAP) xs.add(x);
        for (let x = origin.x + width + SUMMARY_GAP; x <= area.x + area.width - width; x += width + SUMMARY_GAP) xs.add(x);
        for (let y = origin.y - size.height - SUMMARY_GAP; y >= area.y; y -= size.height + SUMMARY_GAP) ys.add(y);
        for (let y = origin.y + size.height + SUMMARY_GAP; y <= area.y + area.height - size.height; y += size.height + SUMMARY_GAP) ys.add(y);
        const cells: { readonly x: number; readonly y: number; readonly distance: number }[] = [];
        for (const x of xs) for (const y of ys) cells.push({ x, y, distance: (x - anchor.x) ** 2 + (y - anchor.y) ** 2 });
        cells.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
        let attempts = 0;
        for (const cell of cells) {
          if (attempts++ >= 256 || accept({ ...anchor, x: cell.x, y: cell.y })) break;
        }
      }
      const final = placed ?? anchor;
      if (placed) packed.add(item.id);
      output.set(item.id, final); grid.insert(final);
    }
    this.previous = output; this.camera = camera;
    this.items = items; this.area = area; this.tier = tier; this.obstacles = obstacles; this.packed = packed; this.eligible = eligible;
    return output;
  }

  clear(): void { this.previous.clear(); this.items = []; this.area = null; this.packed.clear(); this.eligible.clear(); }
}

export function fitSpatial<Id>(items: readonly LayoutItem<Id>[], area: Rect, maxZoom = 1, obstacles: readonly Rect[] = []): CameraState {
  const bounds = union(items.map(item => item.bounds));
  const start = fitBounds(bounds, area, maxZoom);
  for (let zoom = start.zoom; zoom >= 0.2; zoom -= 0.02) {
    const camera = fitBounds(bounds, area, zoom), layout = new RepresentationLayout<Id>();
    const rects = layout.layout(items, camera, zoom < 0.76 ? 'summary' : 'detail', area, obstacles);
    const occupied: Rect[] = [...obstacles];
    let valid = true;
    for (const r of rects.values()) {
      if (!contains(area, r) || r.kind === 'summary' && occupied.some(other => overlaps(r, other))) { valid = false; break; }
      if (r.kind === 'summary') occupied.push(r);
    }
    if (valid) return camera;
  }
  return fitBounds(bounds, area, Math.min(start.zoom, 0.19));
}
