import { lineChart } from '../../platform/deck-test.js';
import { describe, expect, it } from 'vitest';
import { CardIdSchema } from '@aegis/domain/schema';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sharedDeckChart } from './chart.js';
import { ValueChart } from './ValueChart.js';

describe('saved deck chart compatibility', () => {
  it('retains every value, category, zero target and unit in a shared chart spec', () => {
    const result = sharedDeckChart({ values: [0, 2, 4], labels: ['Mon', '<Tue>'], target: 0, unit: 'hours', smooth: false });
    expect(result.spec?.series[0]?.points).toEqual([{ x: 'Mon', y: 0 }, { x: '<Tue>', y: 2 }, { x: '3', y: 4 }]);
    expect(result.spec?.target).toEqual({ value: 0 }); expect(result.spec?.y?.unit).toBe('hours'); expect(result.spec?.smooth).toBe(false);
  });
  it('keeps the bound source identity and existing snapshot untouched', () => {
    const chart = { sourceId: CardIdSchema.parse('source1'), snapshotSourceId: CardIdSchema.parse('source1'), spec: { kind: 'line' as const, series: [{ name: 'Focus', points: [{ x: 'Mon', y: 8 }] }] }, values: [1, 2] };
    expect(sharedDeckChart(chart)).toBe(chart);
  });
  it('gives constant and single-valued old charts a finite nonzero domain', () => {
    for (const values of [[0], [4, 4], [-3, -3]]) {
      const y = sharedDeckChart({ values }).spec?.y;
      expect(Number.isFinite(y?.min)).toBe(true); expect(Number.isFinite(y?.max)).toBe(true);
      expect(y?.max ?? 0).toBeGreaterThan(y?.min ?? 0);
    }
  });
  it('renders all saved points with whole-hour ticks, category labels, unit and target', () => {
    const html = renderToStaticMarkup(createElement(ValueChart, { chart: { values: [2, 4, 3, 2, 3], labels: ['Mon', 'Tue', 'Wed', 'Thu', '<Fri>'], unit: 'hours', target: 3 }, width: 520, height: 210, presentationHeight: 540 }));
    expect(html.match(/class="pt"/g)).toHaveLength(5);
    expect([...html.matchAll(/class="axis y-tick"[^>]*>(.*?)<\/text>/g)].map(match => match[1])).toEqual(['2', '3', '4']);
    expect([...html.matchAll(/class="axis x-tick"[^>]*>(.*?)<\/text>/g)].map(match => match[1])).toEqual(['Mon', 'Tue', 'Wed', 'Thu', '&lt;Fri&gt;']);
    expect(html).toContain('class="target"'); expect(html).toContain('>hours</text>');
  });
});

// Preserve the browser probe's historical category fallback and HTML escaping checks.
it('renders the React value chart with aligned labels for invalid historical values', () => {
  const fallback = lineChart({ values: [1, 2, 3] });
  expect([...fallback.matchAll(/class="axis x-tick"[^>]*>(.*?)<\/text>/g)].map(match => match[1])).toEqual(['1', '2', '3']);
  const escaped = lineChart({ values: [1, null, 3], labels: ['Mon', 'Tue', '<Fri>'] });
  expect([...escaped.matchAll(/class="axis x-tick"[^>]*>(.*?)<\/text>/g)].map(match => match[1])).toEqual(['Mon', '&lt;Fri&gt;']);
  expect([...lineChart({ values: [1, 2], labels: ['Mon'] }).matchAll(/class="axis x-tick"[^>]*>(.*?)<\/text>/g)].map(match => match[1])).toEqual(['Mon', '2']);
});
