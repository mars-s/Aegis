import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectCard, cardBounds, fitView } from '../../app/src/canvas/geometry.js';
import { boardSubtitle } from '../../app/src/lib/board/summary.js';
const card = (id, type, text, x, props = {}) => ({ id, type, text, x, y: 0, w: 100, h: 80, props });

test('every kind keeps its world rectangle through every camera scale', () => {
  for (const type of ['doc', 'object', 'dataset', 'deck', 'note', 'title']) for (const z of [.05, .3, .5, .75, 1, 2, 4]) {
    assert.deepEqual(projectCard(card('a', type, 'Work', 40), { x: 120, y: 80, z }), { x: 120 + 40 * z, y: 80, w: 100 * z, h: 80 * z });
  }
});

test('Fit frames actual bounds, including rotation and fixed-size agent chrome', () => {
  const area = { x: 24, y: 68, w: 1200, h: 700 };
  const cards = [cardBounds({ x: -200, y: -100, w: 800, h: 500 }, 30), { x: 1000, y: 600, w: 640, h: 420 }, { x: 1800, y: 600, screenSize: { w: 340, h: 300 } }];
  const view = fitView(cards, area);
  assert.ok(view.z >= .05 && view.z <= 1);
  for (const c of cards) {
    const r = c.screenSize ? { x: c.x * view.z + view.x, y: c.y * view.z + view.y, ...c.screenSize } : projectCard(c, view);
    assert.ok(r.x >= area.x - 1e-8 && r.y >= area.y - 1e-8 && r.x + r.w <= area.x + area.w + 1e-8 && r.y + r.h <= area.y + area.h + 1e-8);
  }
  assert.equal(fitView([{ x: 0, y: 0, w: 1e6, h: 1e6 }], area).z, .05);
  assert.equal(fitView([{ x: 0, y: 0, w: 1, h: 1 }], area, 20).z, 4);
  assert.equal(fitView([{ x: 0, y: 0, w: 1, h: 1 }], area, .75).z, .75);
});

test('an ungrouped board retains its name and a heading or document supplies its content cue', () => {
  const board = { name: 'Weekly plan', cards: [card('doc', 'doc', 'A calmer week', 0)] };
  assert.equal(boardSubtitle(board), 'A calmer week');
  board.cards.push(card('title', 'title', '## Make time to think', 0));
  assert.equal(boardSubtitle(board), 'Make time to think');
  assert.equal(boardSubtitle({ cards: [] }), 'An empty board, ready for an idea.');
});
