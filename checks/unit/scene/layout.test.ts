import { describe, expect, test } from 'vitest';
import { cardTier, fitSpatial, RepresentationLayout, zoomTier } from '../../../packages/scene/src/representations.js';
import { contains, hitRotated, rotatedBounds } from '../../../packages/scene/src/geometry.js';

const area = { x: 0, y: 0, width: 1440, height: 900 };
const item = (id: string, x: number, y: number) => ({ id, kind: 'note', summarised: true, bounds: { x, y, width: 480, height: 360 } });

describe('semantic representations', () => {
  test('preserves entry, exit and data readability thresholds', () => {
    expect(zoomTier(0.199)).toBe('cluster');
    expect(zoomTier(0.229, 'cluster')).toBe('cluster');
    expect(zoomTier(0.23, 'cluster')).toBe('summary');
    expect(zoomTier(0.699)).toBe('summary');
    expect(zoomTier(0.759, 'summary')).toBe('summary');
    expect(zoomTier(0.76, 'summary')).toBe('detail');
    for (const kind of ['plot', 'sheet', 'table']) {
      expect(cardTier(kind, 0.999)).toBe('summary');
      expect(cardTier(kind, 1)).toBe('detail');
    }
    expect(cardTier('dataset', 12 / 11 - 0.001)).toBe('summary');
    expect(cardTier('dataset', 12 / 11)).toBe('detail');
  });

  test('packs coincident summaries with clearance and retains translated placements', () => {
    const layout = new RepresentationLayout<string>();
    const items = [item('a', 100, 100), item('b', 100, 100), item('c', 100, 100)];
    const first = layout.layout(items, { x: 0, y: 0, zoom: 0.45 }, 'summary', area);
    expect(layout.layout(items, { x: 0, y: 0, zoom: 0.45 }, 'summary', area)).toBe(first);
    const rects = [...first.values()];
    expect(rects).toHaveLength(3);
    for (const [i, r] of rects.entries()) {
      expect(contains(area, r)).toBe(true);
      for (const other of rects.slice(i + 1)) expect(r.x + r.width + 24 <= other.x || other.x + other.width + 24 <= r.x || r.y + r.height + 24 <= other.y || other.y + other.height + 24 <= r.y).toBe(true);
    }
    const second = layout.layout(items, { x: 4, y: 3, zoom: 0.45 }, 'summary', area);
    for (const [id, r] of first) expect(second.get(id)).toEqual({ ...r, x: r.x + 4, y: r.y + 3 });
  });

  test('keeps offscreen summaries offscreen and honours screen obstacles', () => {
    const layout = new RepresentationLayout<string>();
    const rects = layout.layout([item('outside', -5000, -5000), item('near', 0, 0)], { x: 0, y: 0, zoom: 0.45 }, 'summary', area, [{ x: 0, y: 0, width: 400, height: 300 }]);
    expect(rects.get('outside')?.x).toBe(-2250);
    const near = rects.get('near');
    expect(near && (near.x >= 424 || near.y >= 324)).toBe(true);
  });

  test('fit returns all displayed summaries inside the same usable area', () => {
    const items = [item('a', 0, 0), item('b', 800, 500)];
    const camera = fitSpatial(items, area);
    const rects = new RepresentationLayout<string>().layout(items, camera, zoomTier(camera.zoom), area);
    for (const rect of rects.values()) expect(contains(area, rect)).toBe(true);
  });

  test('rotated culling bounds contain corners and hit tests reject AABB corners', () => {
    const rect = { x: 0, y: 0, width: 100, height: 20 };
    const bounds = rotatedBounds(rect, 90);
    expect(bounds.minX).toBeCloseTo(40);
    expect(bounds.maxY).toBeCloseTo(60);
    expect(hitRotated({ x: 50, y: 55 }, rect, 90)).toBe(true);
    expect(hitRotated({ x: 0, y: 0 }, rect, 45)).toBe(false);
  });
});
