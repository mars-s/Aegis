import { describe, expect, test } from 'vitest';
import { FAR, LIVE_LIMIT, fitSpatial, projectRepresentations, representationMode } from '../../../packages/scene/src/representations.js';
import { contains, hitRotated, rotatedBounds } from '../../../packages/scene/src/geometry.js';

const area = { x: 0, y: 0, width: 1440, height: 900 };
const item = (id: string, x: number, y: number) => ({ id, bounds: { x, y, width: 480, height: 360 } });

describe('static camera representations, standing order 18', () => {
  test('only a crowded far view uses canvas rectangles', () => {
    for (const zoom of [0.05, 0.199, 0.45, 0.699, 0.76, 1, 12 / 11]) expect(representationMode(zoom, LIVE_LIMIT)).toBe('detail');
    expect(representationMode(FAR, LIVE_LIMIT + 1)).toBe('detail');
    expect(representationMode(FAR - 0.001, LIVE_LIMIT + 1)).toBe('far');
  });

  test('coincident cards stay coincident at their scaled world geometry', () => {
    const items = [item('a', 100, 100), item('b', 100, 100), item('c', 100, 100)];
    for (const zoom of [0.05, 0.45, 1, 2]) {
      const first = projectRepresentations(items, { x: 0, y: 0, zoom });
      expect([...first.values()]).toEqual(items.map(() => ({ x: 100 * zoom, y: 100 * zoom, width: 480 * zoom, height: 360 * zoom, kind: 'detail' })));
      const second = projectRepresentations(items, { x: 4, y: 3, zoom });
      for (const [id, r] of first) expect(second.get(id)).toEqual({ ...r, x: r.x + 4, y: r.y + 3 });
    }
  });

  test('offscreen geometry is never clamped or repacked for readability', () => {
    for (const mode of ['detail', 'far'] as const) {
      const rects = projectRepresentations([item('outside', -5000, -5000), item('near', 0, 0)], { x: 0, y: 0, zoom: 0.45 }, mode);
      expect(rects.get('outside')).toEqual({ x: -2250, y: -2250, width: 216, height: 162, kind: mode });
      expect(rects.get('near')).toEqual({ x: 0, y: 0, width: 216, height: 162, kind: mode });
    }
  });

  test('Fit contains actual card rectangles in the usable area', () => {
    const items = [item('a', 0, 0), item('b', 800, 500)];
    const camera = fitSpatial(items, area);
    for (const rect of projectRepresentations(items, camera).values()) expect(contains(area, rect)).toBe(true);
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
