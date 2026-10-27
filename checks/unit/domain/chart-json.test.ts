import { expect, test } from 'vitest';
import { CardSchema, JsonSchema } from '@aegis/domain/schema';
import { SHAPES } from '@aegis/domain/objects';
import { plotToDeckChart } from '@aegis/domain/chart-source';
import { LinkPreviewSchema } from '@aegis/protocol/services';

const sheet = CardSchema.parse({ id: 'sheet', type: 'object', kind: 'sheet', text: 'Source', x: 0, y: 0, w: 400, h: 300, color: 'plain', data: { columns: [{ label: 'Name', kind: 'text' }, { label: 'Value', kind: 'number' }], rows: [{ cells: ['A', '3'] }] } });
const plot = SHAPES.plot.parse({ style: 'line', x: { kind: 'category' }, y: { format: 'number' }, basis: 'Fixture', headline: { label: 'Independent', value: '10' }, source: { cardId: 'sheet', xColumn: 0, yColumns: [1] }, series: [{ name: 'Value', points: [{ x: 'A', y: 1 }] }] });

test.each([true, false])('derived chart crosses the slide JSON boundary with live source %s', live => {
  const result = plotToDeckChart(plot, live ? [sheet] : []);
  expect(JsonSchema.safeParse(result.spec).success).toBe(true);
  expect(Object.hasOwn(result.spec, 'headline')).toBe(false);
  expect(result.spec.series[0]?.points[0]?.y).toBe(live ? 3 : undefined);
});

test('a missing chart source retains its saved series through the JSON boundary', () => {
  const snapshot = SHAPES.plot.parse({ ...plot, snapshot: { binding: JSON.stringify(plot.source), series: plot.series } });
  const result = plotToDeckChart(snapshot);
  expect(JsonSchema.safeParse(result.spec).success).toBe(true);
  expect(result.spec.series).toEqual(plot.series);
  expect(Object.hasOwn(result.spec, 'headline')).toBe(false);
});

test('link previews accept omitted metadata and still refuse invalid field types', () => {
  expect(LinkPreviewSchema.parse({ title: 'Loaded preview', description: 'Loaded summary' })).toEqual({ title: 'Loaded preview', description: 'Loaded summary', image: '', favicon: '' });
  expect(LinkPreviewSchema.safeParse({ image: 3 }).success).toBe(false);
});
