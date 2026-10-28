import { describe, expect, test } from 'vitest';
import { BoardSchema } from '@aegis/domain/schema';
import { boardSubtitle } from '@aegis/domain/summary';
import { clampZoom, fitBounds, fromBounds, project, rotatedBounds, union } from '../../../packages/scene/src/geometry.js';
import type { Rect } from '../../../packages/scene/src/geometry.js';

// Ported from checks/host/overview.test.ts: the same contracts, run against the scene geometry that React ships.
const card = (x: number): Rect => ({ x, y: 0, width: 100, height: 80 });

describe('static camera overview', () => {
  test('every kind keeps its world rectangle through every camera scale', () => {
    for (const zoom of [.05, .3, .5, .75, 1, 2, 4]) {
      expect(project(card(40), { x: 120, y: 80, zoom })).toEqual({ x: 120 + 40 * zoom, y: 80, width: 100 * zoom, height: 80 * zoom });
    }
  });

  test('Fit frames actual bounds, including rotation and fixed-size agent chrome', () => {
    const area = { x: 24, y: 68, width: 1200, height: 700 };
    const rotated = fromBounds(rotatedBounds({ x: -200, y: -100, width: 800, height: 500 }, 30));
    const world = [rotated, { x: 1000, y: 600, width: 640, height: 420 }];
    const agent = { x: 1800, y: 600, width: 340, height: 300 };
    let camera = fitBounds(union(world), area);
    for (let i = 0; i < 24; i++) camera = fitBounds(union([...world, { ...agent, width: agent.width / camera.zoom, height: agent.height / camera.zoom }]), area, camera.zoom);
    expect(camera.zoom >= .05 && camera.zoom <= 1).toBe(true);
    const screen = [...world.map(r => project(r, camera)), { x: agent.x * camera.zoom + camera.x, y: agent.y * camera.zoom + camera.y, width: agent.width, height: agent.height }];
    for (const r of screen) {
      expect(r.x >= area.x - 1e-8 && r.y >= area.y - 1e-8 && r.x + r.width <= area.x + area.width + 1e-8 && r.y + r.height <= area.y + area.height + 1e-8).toBe(true);
    }
    expect(fitBounds({ x: 0, y: 0, width: 1e6, height: 1e6 }, area).zoom).toBe(.05);
    expect(fitBounds({ x: 0, y: 0, width: 1, height: 1 }, area, 20).zoom).toBe(clampZoom(20));
    expect(fitBounds({ x: 0, y: 0, width: 1, height: 1 }, area, .75).zoom).toBe(.75);
  });

  test('an ungrouped board retains its name and a heading or document supplies its content cue', () => {
    const doc = { id: 'doc', type: 'doc', text: 'A calmer week', x: 0, y: 0, w: 100, h: 80, color: 'plain', props: {} };
    const title = { id: 'title', type: 'title', text: '## Make time to think', x: 0, y: 0, w: 100, h: 80, color: 'plain', props: {} };
    const board = (cards: unknown[]) => BoardSchema.parse({ id: 'b', name: 'Weekly plan', rev: 0, cards, links: [], view: { x: 0, y: 0, z: 1 } });
    expect(boardSubtitle(board([doc]))).toBe('A calmer week');
    expect(boardSubtitle(board([doc, title]))).toBe('Make time to think');
    expect(boardSubtitle(board([]))).toBe('An empty board, ready for an idea.');
  });
});
