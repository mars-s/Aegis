import { z } from 'zod/v4';
import { JsonSchema } from '@aegis/domain/schema';
import { required } from './required.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnLabel, cellText } from '@aegis/domain/summary';
import { cardSummary, plotSummary, diagramSummary, sheetSummary } from './summary-fixture.ts';
import type { JsonRecord } from '@aegis/domain/schema';
import { formatValue } from '@aegis/domain/charts';

const plot = (data: JsonRecord = {}) => ({ type: 'object', kind: 'plot', text: 'Evidence', data: { style: 'line', y: { label: 'Hours' }, series: [{ name: 'Focus', points: [{ x: 'Mon', y: 3 }, { x: 'Fri', y: 2 }] }], ...data } });

test('plot summary resolves live sheet values, subsequent saves and reopened boards', () => {
  const card = plot({ source: { cardId: 'sheet', xColumn: 0, yColumns: [1] }, headline: { value: '2', label: 'Old ending' } });
  const sheet = { id: 'sheet', kind: 'sheet', data: { columns: [{ label: 'Day' }, { label: 'Focus' }], rows: [{ cells: ['Mon', '3'] }, { cells: ['Fri', '9'] }] } };
  assert.equal(plotSummary(card, [sheet]).preview.value, '9');
  required(sheet.data.rows[1]).cells[1] = '12';
  assert.equal(plotSummary(card, [sheet]).preview.value, '12');
  const saved = z.array(JsonSchema).parse(JSON.parse(JSON.stringify([card, sheet])));
  assert.equal(plotSummary(required(saved[0]), saved).preview.value, '12');
  assert.equal(required(required(card.data.series[0]).points[1]).y, 2);
  assert.equal(plotSummary(card, []).preview.value, 'No data');
  assert.equal(plotSummary(card, []).sourceStatus, 'Source missing, no saved snapshot');
});

test('plot summaries keep chart kind, missing values, units and series identity', () => {
  for (const [style, kind] of [['line', 'line'], ['bar', 'bars'], ['bar_horizontal', 'bars'], ['bar_grouped', 'bars'], ['bar_stacked', 'stacked'], ['radar', 'radar']] as const) {
    assert.equal(plotSummary(plot({ style })).preview.kind, kind);
  }
  const series = Array.from({ length: 5 }, (_, i) => ({ name: `Measure ${i + 1}`, points: [{ x: 'Jan', y: i }, { x: 'Feb', y: null }] }));
  const preview = plotSummary(plot({ series })).preview;
  assert.equal(preview.seriesCount, 5); assert.equal(preview.series.length, 3);
  assert.deepEqual(preview.series.map(s => s.name), ['Measure 1', 'Measure 2', 'Measure 3']);
  assert.equal(required(required(preview.series[0]).points[1]).y, null);
  assert.notEqual(required(preview.series[0]).value, '0');
  assert.equal(plotSummary(plot({ y: { unit: 'h' } })).preview.value, '2 h');
});

test('composition summary reports the total and positive shares, never the last category', () => {
  const card = plot({ style: 'donut', y: { unit: 'customers' }, series: [{ name: 'Customers', points: [{ x: 'Startup', y: 70 }, { x: 'Team', y: 20 }, { x: 'Enterprise', y: 10 }, { x: 'Missing', y: null }] }] });
  const preview = plotSummary(card).preview;
  assert.equal(preview.kind, 'donut'); assert.equal(preview.value, '100 customers'); assert.equal(preview.label, '3 segments');
  assert.deepEqual(preview.parts.map(p => p.value), [70, 20, 10]);
});

test('comparison values use the detailed chart currency formatter', () => {
  const y = { format: 'money', currency: 'AUD', unit: '$' } as const;
  const card = plot({ y, series: [{ name: 'Revenue', points: [{ x: 'Mar', y: 70 }] }, { name: 'Support cost', points: [{ x: 'Mar', y: 130 }] }] });
  const preview = plotSummary(card).preview;
  assert.deepEqual(preview.series.map(s => s.value), [formatValue(70, y), formatValue(130, y)]);
});

test('ordered axes report their final point in chart order and retain a missing ending', () => {
  const time = plot({ x: { kind: 'time' }, series: [{ name: 'Hours', points: [{ x: '2026-10-27', y: 9 }, { x: '2026-10-01', y: 2 }] }] });
  assert.equal(plotSummary(time).preview.value, '9');
  const linear = plot({ x: { kind: 'linear' }, series: [{ name: 'Hours', points: [{ x: 20, y: null }, { x: 1, y: 2 }] }] });
  assert.equal(plotSummary(linear).preview.value, 'No data');
});

test('diagram models retain every real node and edge without inventing a sequence', () => {
  const nodes = ['Intake', 'Design', 'Data', 'Approve', 'Archive'].map(name => ({ id: name, name }));
  const edges = [['Intake', 'Design'], ['Intake', 'Data'], ['Design', 'Approve'], ['Data', 'Approve']].map(([from, to]) => ({ from, to }));
  const summary = diagramSummary({ type: 'object', kind: 'diagram', data: { nodes, edges } });
  assert.deepEqual(summary.preview.nodes, nodes); assert.deepEqual(summary.preview.edges, edges);
  assert.match(required(summary.facts[0]), /5 node.*4 connection/);
});

test('sheet summaries and references retain units, typed figures and original date/text values', () => {
  const columns = [{ label: 'Date', kind: 'date' }, { label: 'Focus', kind: 'number', unit: 'h' }, { label: 'Revenue', kind: 'money', unit: 'AUD', currency: 'AUD' }];
  const summary = sheetSummary({ type: 'object', kind: 'sheet', data: { columns, rows: [{ cells: ['2026-10-27', '9', '1200'] }] } });
  assert.deepEqual(summary.preview.columns, ['Date', 'Focus (h)', 'Revenue (AUD)']);
  assert.deepEqual(summary.preview.rows, [['2026-10-27', '9', formatValue(1200, { format: 'money', currency: 'AUD' })]]);
  assert.equal(columnLabel({ label: 'Plain' }), 'Plain');
  assert.equal(cellText({ kind: 'text' }, '001'), '001');
  assert.equal(cellText({ kind: 'number' }, ''), '');
  assert.equal(cellText({ kind: 'percent' }, '12.5'), formatValue(12.5, { format: 'percent' }));
});

test('paragraph-first documents use one excerpt and true headings remain distinct', () => {
  const doc = (body: string) => cardSummary({ type: 'doc', text: 'Brief', props: { body } });
  assert.deepEqual(doc('Compare the hours with the evidence. Then decide.').facts, ['Compare the hours with the evidence.']);
  assert.deepEqual(doc('Compare these figures.').facts, ['Compare these figures.']);
  assert.deepEqual(doc('Compare these figures.\n\n## Later section').facts, ['Compare these figures.']);
  assert.deepEqual(doc('# Evidence\n\nCompare these figures.').facts, ['Evidence', 'Compare these figures.']);
  assert.deepEqual(doc('# Evidence\n\nEvidence').facts, ['Evidence']);
  assert.deepEqual(doc('').facts, []);
});
