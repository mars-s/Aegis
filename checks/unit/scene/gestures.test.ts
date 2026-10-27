import { describe, expect, test } from 'vitest';
import { angleFrom, resizeRect, rotationDelta } from '../../../packages/scene/src/gestures.js';

function topLeft(rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, angle: number) {
  const radians = angle * Math.PI / 180;
  return { x: rect.x + rect.width / 2 - rect.width / 2 * Math.cos(radians) + rect.height / 2 * Math.sin(radians), y: rect.y + rect.height / 2 - rect.width / 2 * Math.sin(radians) - rect.height / 2 * Math.cos(radians) };
}

describe('gesture geometry', () => {
  test('resize tracks world distance and preserves the opposite rotated corner', () => {
    const base = { x: 120, y: 80, width: 240, height: 160 };
    expect(resizeRect(base, { x: 37, y: 29 }, 0)).toEqual({ ...base, width: 277, height: 189 });
    for (const angle of [30, 90, 145, -45]) {
      const next = resizeRect(base, { x: 37, y: 29 }, angle);
      expect(topLeft(next, angle).x).toBeCloseTo(topLeft(base, angle).x);
      expect(topLeft(next, angle).y).toBeCloseTo(topLeft(base, angle).y);
    }
  });
  test('resize respects note and window minimum dimensions', () => {
    const base = { x: 0, y: 0, width: 240, height: 160 };
    expect(resizeRect(base, { x: -1000, y: -1000 }, 0)).toMatchObject({ width: 80, height: 40 });
    expect(resizeRect(base, { x: -1000, y: -1000 }, 0, { width: 200, height: 120 })).toMatchObject({ width: 200, height: 120 });
  });
  test('rotation crosses the angle seam without a full-turn jump', () => {
    expect(rotationDelta(179, -179)).toBe(2);
    expect(rotationDelta(-179, 179)).toBe(-2);
    expect(angleFrom({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe(90);
  });
});
