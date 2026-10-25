import { test } from 'node:test';
import assert from 'node:assert/strict';
// Match the host's import, so a missing registration import fails this check.
import '../../app/src/lib/board/types/index.js';
import { applyBatch, emptyBoard, describe, cardTypeGuide } from '../../app/src/lib/board/commands.js';
import { chartTicks, lineChart, slideHTML } from '../../app/src/features/deck/slides.js';

test('the host accepts deck creates and updates, and describes slides for agents', () => {
  const original = emptyBoard('decks', 'Decks');
  const slides = [{ id: 's1', layout: 'title', title: 'A clear idea', sub: 'Start here', body: '' }];
  const created = applyBatch(original, { commands: [{ op: 'create', type: 'deck', text: 'Project deck', props: { slides, current: 0, custom: true }, ref: 'deck' }] });
  assert.equal(created.ok, true);
  const card = created.board.cards[0];
  assert.deepEqual([card.w, card.h], [470, 352]);
  assert.equal(original.cards.length, 0);
  const updatedSlides = [...slides, { id: 's2', layout: 'chart', title: 'Change over time', sub: 'Target shown dashed', body: '', chart: { values: [1, 3, 2], target: 0, label: 'Example values' } }];
  const updated = applyBatch(created.board, { commands: [{ op: 'update', id: created.created.deck, set: { props: { slides: updatedSlides, current: 1 } } }] });
  assert.equal(updated.ok, true);
  assert.deepEqual(describe(updated.board).cards[0].props.slides, updatedSlides);
  assert.equal(updated.board.cards[0].props.current, 1);
  assert.equal(updated.board.cards[0].props.custom, true);
  assert.deepEqual(created.board.cards[0].props.slides, slides);
  assert.match(cardTypeGuide(), /deck:.*create.*update.*person's own media/);
});

test('slide HTML escapes text and charts handle zero targets, constant and single values', () => {
  const html = slideHTML({ id: '\"><script>', layout: 'title', title: '<img src=x onerror=alert(1)>', sub: 'A & B' }, true);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /contenteditable="plaintext-only"/);
  for (const values of [[0], [2, 2, 2], [-3, 0, 4]]) {
    const chart = lineChart({ values, target: 0, label: '<unsafe>' });
    assert.doesNotMatch(chart, /NaN|Infinity|<unsafe>/);
    assert.match(chart, /class="target"/);
    assert.equal((chart.match(/class="pt"/g) ?? []).length, values.length);
  }
  assert.match(lineChart({ values: [] }), /Add chart values/);
});

test('slide axes use nice steps, whole numbers for integer data and preserve units', () => {
  for (const values of [[2, 4, 3, 2, 3], [0], [2, 2, 2], [-3, 0, 4], [1001, 1004]]) {
    const { lo, hi, ticks } = chartTicks(values);
    assert.ok(lo <= Math.min(...values) && hi >= Math.max(...values));
    assert.ok(ticks.length >= 2 && ticks.length <= 7);
    assert.ok(ticks.every(Number.isInteger));
  }
  for (const [values, step] of [[[1.1, 1.9], .2], [[0, 9.1], 2.5], [[6.6, 7.1], .2], [[0, .02], .005], [[-500, 500], 250]]) {
    const { ticks } = chartTicks(values);
    assert.ok(Math.abs(ticks[1] - ticks[0] - step) < 1e-10, `${values}: ${ticks}`);
  }
  const target = chartTicks([2, 4, 3], 10);
  assert.ok(target.hi >= 10);
  const small = chartTicks([.0001, .0001]);
  assert.ok(small.lo > 0 && small.hi < .001, 'constant fractional values keep an axis close to their scale');
  const html = lineChart({ values: [2, 4, 3, 2, 3], unit: 'hours' });
  assert.deepEqual([...html.matchAll(/class="axis y-tick"[^>]*>([^<]+)/g)].map(m => m[1]), ['2', '3', '4']);
  assert.match(html, /class="axis axis-unit"[^>]*>hours</);
  assert.match(lineChart({ values: [20, 40], unit: '%' }), />%</);
  assert.doesNotMatch(lineChart({ values: [20, 40], unit: '<script>' }), /<script>/);
});
