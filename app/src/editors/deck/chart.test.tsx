import { describe, expect, it } from 'vitest';
import { CardIdSchema } from '@aegis/domain/schema';
import { sharedDeckChart } from './chart.js';

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
});
