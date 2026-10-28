import type { Locator } from './playwright.ts';
import assert from 'node:assert/strict';

// Measure painted geometry after layout and ResizeObserver have both run.
export async function assertSlideFits(frame: Locator, { label = 'Slide', points, pictures, viewport }: { label?: string; points?: number; pictures?: number; viewport?: Locator } = {}) {
  const geometry = await frame.evaluate(async el => {
    await new Promise<number>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = (node: Element | null) => {
      const r = globalThis.window.uiChecks.required(node).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const slide = el.querySelector('.deck-slide');
    return {
      frame: rect(el), slide: rect(slide),
      points: [...globalThis.window.uiChecks.required(slide).querySelectorAll('.deck-chart .pt')].map(rect),
      pictures: [...globalThis.window.uiChecks.required(slide).querySelectorAll('.s-picture')].map(image => ({ bounds: rect(image), fit: getComputedStyle(image).objectFit, loaded: globalThis.window.uiChecks.image(image).complete && globalThis.window.uiChecks.image(image).naturalWidth > 0 })),
    };
  });
  type Bounds = { left: number; top: number; right: number; bottom: number };
  const inside = (r: Bounds, box: Bounds) => r.left >= box.left - 1 && r.top >= box.top - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1;
  assert.ok(geometry.slide.width > 0 && geometry.slide.height > 0, `${label}: slide is visible`);
  assert.ok(inside(geometry.slide, geometry.frame), `${label}: the whole slide fits: ${JSON.stringify(geometry)}`);
  if (viewport) {
    const box = await viewport.boundingBox();
    assert.ok(box && inside(geometry.slide, { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }), `${label}: the whole slide is inside the visible viewport`);
  }
  assert.ok(Math.abs(geometry.slide.width / geometry.slide.height / (16 / 9) - 1) < .01, `${label}: slide ratio stays 16:9`);
  if (points !== undefined) assert.equal(geometry.points.length, points, label);
  assert.ok(geometry.points.every(point => inside(point, geometry.frame) && inside(point, geometry.slide)), `${label}: all chart points fit the visible preview: ${JSON.stringify(geometry)}`);
  if (pictures !== undefined) assert.equal(geometry.pictures.length, pictures, label);
  assert.ok(geometry.pictures.every(image => inside(image.bounds, geometry.slide) && image.fit === 'contain' && image.loaded), `${label}: imported pictures are loaded and contained`);
  return geometry;
}
