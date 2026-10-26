import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardSummary, columnLabel, cellText } from '../../app/src/lib/board/summary.js';
import { formatValue } from '../../app/src/objects/chart/chart.ts';

const plot = data => ({ type: 'object', kind: 'plot', text: 'Evidence', data: { style: 'line', y: { label: 'Hours' }, series: [{ name: 'Focus', points: [{ x: 'Mon', y: 3 }, { x: 'Fri', y: 2 }] }], ...data } });

test('plot summary resolves live sheet values, subsequent saves and reopened boards', () => {
  const card = plot({ source: { cardId: 'sheet', xColumn: 0, yColumns: [1] }, headline: { value: '2', label: 'Old ending' } });
  const sheet = { id: 'sheet', kind: 'sheet', data: { columns: [{ label: 'Day' }, { label: 'Focus' }], rows: [{ cells: ['Mon', '3'] }, { cells: ['Fri', '9'] }] } };
  assert.equal(cardSummary(card, [sheet]).preview.value, '9');
  sheet.data.rows[1].cells[1] = '12';
  assert.equal(cardSummary(card, [sheet]).preview.value, '12');
  const saved = JSON.parse(JSON.stringify([card, sheet]));
  assert.equal(cardSummary(saved[0], saved).preview.value, '12');
  assert.equal(card.data.series[0].points[1].y, 2);
  assert.equal(cardSummary(card, []).preview.value, 'No data');
  assert.equal(cardSummary(card, []).sourceStatus, 'Source missing, no saved snapshot');
});

test('plot summaries keep chart kind, missing values, units and series identity', () => {
  for (const [style, kind] of [['line', 'line'], ['bar', 'bars'], ['bar_horizontal', 'bars'], ['bar_grouped', 'bars'], ['bar_stacked', 'stacked'], ['radar', 'radar']]) {
    assert.equal(cardSummary(plot({ style })).preview.kind, kind);
  }
  const series = Array.from({ length: 5 }, (_, i) => ({ name: `Measure ${i + 1}`, points: [{ x: 'Jan', y: i }, { x: 'Feb', y: null }] }));
  const preview = cardSummary(plot({ series })).preview;
  assert.equal(preview.seriesCount, 5); assert.equal(preview.series.length, 3);
  assert.deepEqual(preview.series.map(s => s.name), ['Measure 1', 'Measure 2', 'Measure 3']);
  assert.equal(preview.series[0].points[1].y, null);
  assert.notEqual(preview.series[0].value, '0');
  assert.equal(cardSummary(plot({ y: { unit: 'h' } })).preview.value, '2 h');
});

test('composition summary reports the total and positive shares, never the last category', () => {
  const card = plot({ style: 'donut', y: { unit: 'customers' }, series: [{ name: 'Customers', points: [{ x: 'Startup', y: 70 }, { x: 'Team', y: 20 }, { x: 'Enterprise', y: 10 }, { x: 'Missing', y: null }] }] });
  const preview = cardSummary(card).preview;
  assert.equal(preview.kind, 'donut'); assert.equal(preview.value, '100 customers'); assert.equal(preview.label, '3 segments');
  assert.deepEqual(preview.parts.map(p => p.value), [70, 20, 10]);
});

test('comparison values use the detailed chart currency formatter', () => {
  const y = { format: 'money', currency: 'AUD', unit: '$' };
  const card = plot({ y, series: [{ name: 'Revenue', points: [{ x: 'Mar', y: 70 }] }, { name: 'Support cost', points: [{ x: 'Mar', y: 130 }] }] });
  const preview = cardSummary(card).preview;
  assert.deepEqual(preview.series.map(s => s.value), [formatValue(70, y), formatValue(130, y)]);
});

test('ordered axes report their final point in chart order and retain a missing ending', () => {
  const time = plot({ x: { kind: 'time' }, series: [{ name: 'Hours', points: [{ x: '2026-10-27', y: 9 }, { x: '2026-10-01', y: 2 }] }] });
  assert.equal(cardSummary(time).preview.value, '9');
  const linear = plot({ x: { kind: 'linear' }, series: [{ name: 'Hours', points: [{ x: 20, y: null }, { x: 1, y: 2 }] }] });
  assert.equal(cardSummary(linear).preview.value, 'No data');
});

test('diagram models retain every real node and edge without inventing a sequence', () => {
  const nodes = ['Intake', 'Design', 'Data', 'Approve', 'Archive'].map(name => ({ id: name, name }));
  const edges = [['Intake', 'Design'], ['Intake', 'Data'], ['Design', 'Approve'], ['Data', 'Approve']].map(([from, to]) => ({ from, to }));
  const summary = cardSummary({ type: 'object', kind: 'diagram', data: { nodes, edges } });
  assert.deepEqual(summary.preview.nodes, nodes); assert.deepEqual(summary.preview.edges, edges);
  assert.match(summary.facts[0], /5 node.*4 connection/);
});

test('sheet summaries and references retain units, typed figures and original date/text values', () => {
  const columns = [{ label: 'Date', kind: 'date' }, { label: 'Focus', kind: 'number', unit: 'h' }, { label: 'Revenue', kind: 'money', unit: 'AUD', currency: 'AUD' }];
  const summary = cardSummary({ type: 'object', kind: 'sheet', data: { columns, rows: [{ cells: ['2026-10-27', '9', '1200'] }] } });
  assert.deepEqual(summary.preview.columns, ['Date', 'Focus (h)', 'Revenue (AUD)']);
  assert.deepEqual(summary.preview.rows, [['2026-10-27', '9', formatValue(1200, { format: 'money', currency: 'AUD' })]]);
  assert.equal(columnLabel({ label: 'Plain' }), 'Plain');
  assert.equal(cellText({ kind: 'text' }, '001'), '001');
  assert.equal(cellText({ kind: 'number' }, ''), '');
  assert.equal(cellText({ kind: 'percent' }, '12.5'), formatValue(12.5, { format: 'percent' }));
});

test('paragraph-first documents use one excerpt and true headings remain distinct', () => {
  const doc = body => cardSummary({ type: 'doc', text: 'Brief', props: { body } });
  assert.deepEqual(doc('Compare the hours with the evidence. Then decide.').facts, ['Compare the hours with the evidence.']);
  assert.deepEqual(doc('Compare these figures.').facts, ['Compare these figures.']);
  assert.deepEqual(doc('Compare these figures.\n\n## Later section').facts, ['Compare these figures.']);
  assert.deepEqual(doc('# Evidence\n\nCompare these figures.').facts, ['Evidence', 'Compare these figures.']);
  assert.deepEqual(doc('# Evidence\n\nEvidence').facts, ['Evidence']);
  assert.deepEqual(doc('').facts, []);
});
