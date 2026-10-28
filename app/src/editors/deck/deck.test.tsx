import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardIdSchema, CardIdSchema, DeckChartSchema, PropsSchema, SlideSchema } from '@aegis/domain/schema';
import { decodeLegacyStoredBoard, decodeStoredBoard } from '@aegis/protocol/storage';
import { applyBatch as reduceBatch, cardTypeGuide, describe as describeBoard, emptyBoard } from '@aegis/domain/commands';
import type { Board } from '@aegis/domain/schema';
import { createWorkspace } from '../../workspace/index.js';
import type { Workspace } from '../../workspace/index.js';
import { chartTicks } from './chart.js';
import { identifiedSlide, newSlide } from './model.js';
import type { DeckServices } from './model.js';
import { SlideView } from './Slide.js';
import { ValueChart } from './ValueChart.js';
import { deckSession } from './session.js';

// Ported from checks/host/deck.test.ts. The legacy HTML string builders are replaced by the React slide and
// chart components the app ships; each assertion checks the same rendered behaviour.
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Expected fixture value');
  return value;
}
const applyBatch = (board: Board, batch: unknown) => { const result = reduceBatch(board, batch); return { ...result, board: decodeStoredBoard(result.board) }; };
const workspaces: Workspace[] = [];
afterEach(() => { for (const workspace of workspaces.splice(0)) workspace.dispose(); });
const services: DeckServices = { assetUrl: url => url, menu: () => ({ destroy: () => {} }) };
function slideHTML(slide: unknown, editable = false): string {
  const workspace = createWorkspace({ board: emptyBoard(BoardIdSchema.parse('render'), 'Render') }); workspaces.push(workspace);
  const deckId = CardIdSchema.parse('deck');
  const props = { slide: identifiedSlide({ id: 'slide', ...SlideSchema.parse(slide) }), workspace, services, deckId };
  return renderToStaticMarkup(createElement(SlideView, editable ? { ...props, session: deckSession(workspace, deckId) } : props));
}
function lineChart(chart: unknown): string {
  return renderToStaticMarkup(createElement(ValueChart, { chart: DeckChartSchema.parse(chart), width: 520, height: 210, presentationHeight: 540 }));
}

describe('deck host behaviour', () => {
  it('the host accepts deck creates and updates, and describes slides for agents', () => {
    const original = emptyBoard(BoardIdSchema.parse('decks'), 'Decks');
    const slides = [{ id: 's1', layout: 'title', background: 'plain', title: 'A clear idea', sub: 'Start here', body: '' }];
    const created = applyBatch(original, { commands: [{ op: 'create', type: 'deck', text: 'Project deck', props: { slides, current: 0, custom: true }, ref: 'deck' }] });
    expect(created.ok).toBe(true);
    const card = required(created.board.cards[0]);
    expect([card.w, card.h]).toEqual([470, 352]);
    expect(original.cards.length).toBe(0);
    const updatedSlides = [...slides, { id: 's2', layout: 'chart', background: 'plain', title: 'Change over time', sub: 'Target shown dashed', body: '', chart: { values: [1, 3, 2], target: 0, label: 'Example values' } }];
    const updated = applyBatch(created.board, { commands: [{ op: 'update', id: required(created.created.deck), set: { props: { slides: updatedSlides, current: 1 } } }] });
    expect(updated.ok).toBe(true);
    expect(PropsSchema.parse(required(describeBoard(updated.board).cards[0]).props).slides).toEqual(updatedSlides);
    expect(required(required(updated.board.cards[0]).props).current).toBe(1);
    expect(required(required(updated.board.cards[0]).props).custom).toBe(true);
    expect(required(required(created.board.cards[0]).props).slides).toEqual(slides);
    expect(cardTypeGuide()).toMatch(/deck:.*create.*update.*person's own media/);
  });

  it('slide HTML escapes text and charts handle zero targets, constant and single values', () => {
    const html = slideHTML({ layout: 'title', title: '<img src=x onerror=alert(1)>', sub: 'A & B' }, true);
    expect(html).not.toMatch(/<script>|<img/);
    expect(html).toMatch(/&lt;img/);
    expect(html).toMatch(/contenteditable="plaintext-only"/i);
    for (const values of [[0], [2, 2, 2], [-3, 0, 4]]) {
      const chart = lineChart({ values, target: 0, label: '<unsafe>' });
      expect(chart).not.toMatch(/NaN|Infinity|<unsafe>/);
      expect(chart).toMatch(/class="target"/);
      expect((chart.match(/class="pt"/g) ?? []).length).toBe(values.length);
    }
    expect(lineChart({ values: [] })).toMatch(/Add chart values/);
  });

  it('slide axes use nice steps, whole numbers for integer data and preserve units', () => {
    for (const values of [[2, 4, 3, 2, 3], [0], [2, 2, 2], [-3, 0, 4], [1001, 1004]]) {
      const { lo, hi, ticks } = chartTicks(values);
      expect(lo <= Math.min(...values) && hi >= Math.max(...values)).toBe(true);
      expect(ticks.length >= 2 && ticks.length <= 7).toBe(true);
      expect(ticks.every(Number.isInteger)).toBe(true);
    }
    const niceSteps: [number[], number][] = [[[1.1, 1.9], .2], [[0, 9.1], 2.5], [[6.6, 7.1], .2], [[0, .02], .005], [[-500, 500], 250]];
    for (const [values, step] of niceSteps) {
      const { ticks } = chartTicks(values);
      expect(Math.abs(required(ticks[1]) - required(ticks[0]) - step) < 1e-10, `${values}: ${ticks}`).toBe(true);
    }
    expect(chartTicks([2, 4, 3], 10).hi >= 10).toBe(true);
    const small = chartTicks([.0001, .0001]);
    expect(small.lo > 0 && small.hi < .001, 'constant fractional values keep an axis close to their scale').toBe(true);
    const html = lineChart({ values: [2, 4, 3, 2, 3], unit: 'hours' });
    expect([...html.matchAll(/class="axis y-tick"[^>]*>([^<]+)/g)].map(m => m[1])).toEqual(['2', '3', '4']);
    expect(html).toMatch(/class="axis axis-unit"[^>]*>hours</);
    expect(lineChart({ values: [20, 40], unit: '%' })).toMatch(/>%</);
    expect(lineChart({ values: [20, 40], unit: '<script>' })).not.toMatch(/<script>/);
  });

  it('new titles are typography-first and agents can explicitly choose the wave', () => {
    expect(newSlide().background).toBe('plain');
    const created = applyBatch(emptyBoard(BoardIdSchema.parse('decks')), { commands: [{ op: 'create', type: 'deck', props: { slides: [
      { id: 'plain', layout: 'title', title: 'A clear idea' },
      { id: 'wave', layout: 'title', title: 'Sleep', background: 'sci-fi-wave' },
    ] } }] });
    expect(created.ok).toBe(true);
    const [plain, wave] = required(required(required(created.board.cards[0]).props).slides);
    expect(plain && wave).toBeTruthy();
    expect(required(plain).background).toBe('plain');
    expect(slideHTML(plain)).not.toMatch(/deck-ridge|s-art/);
    expect(slideHTML(wave)).toMatch(/deck-ridge/);
    expect(cardTypeGuide()).toMatch(/background.*sci-fi-wave/);
    const updated = applyBatch(created.board, { commands: [{ op: 'update', id: required(created.board.cards[0]).id, set: { props: { slides: [
      { id: 'plain', layout: 'title', title: 'Edited' }, wave, { id: 'added', layout: 'title', title: 'Added by an agent' },
    ] } } }] });
    expect(updated.ok).toBe(true);
    expect(required(required(required(updated.board.cards[0]).props).slides).map(s => s.background)).toEqual(['plain', 'sci-fi-wave', 'plain']);
  });

  it('saved legacy titles keep their wave through edits, reorder, restore and reopening', () => {
    const legacy = { id: 'legacy', layout: 'title', title: 'Sleep' };
    const board = decodeLegacyStoredBoard({ ...emptyBoard(BoardIdSchema.parse('decks')), cards: [{ id: 'legacydeck', type: 'deck', text: 'Sleep', props: { slides: [legacy] } }] });
    const updated = reduceBatch(board, { commands: [{ op: 'update', id: 'legacydeck', set: { props: { slides: [
      { id: 'added', layout: 'title', title: 'New' }, { ...legacy, title: 'Sleep report' },
    ] } } }] });
    expect(updated.ok).toBe(true);
    const [added, saved] = required(required(required(updated.board.cards[0]).props).slides);
    expect(required(added).background).toBe('plain');
    expect(Object.hasOwn(required(saved), 'background')).toBe(false);
    expect(slideHTML(saved)).toMatch(/deck-ridge/);
    expect(required(required(board.cards[0]).props).slides).toEqual([legacy]);
    const restored = reduceBatch(updated.board, { commands: [{ op: 'restore', cards: board.cards, links: [] }] });
    expect(restored.board.cards).toEqual(board.cards);
    expect(slideHTML(required(required(required(restored.board.cards[0]).props).slides)[0])).toMatch(/deck-ridge/);
  });
});
