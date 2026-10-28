import { decodeStoredBoard } from '@aegis/protocol/storage';
import type { ObjectData } from '@aegis/domain/objects';
import { CardIdSchema } from '@aegis/domain/schema';
import type { Board } from '@aegis/domain/schema';
import { required } from './required.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBatch } from './batch.ts';
import { emptyBoard } from '@aegis/domain/commands';
import { resolvePlot, resolveDeckChart, plotToDeckChart, SNAPSHOT_STATUS, MISSING_STATUS } from '@aegis/domain/chart-source';
import { cardSummary } from '@aegis/domain/summary';

const plot = { style: 'line', basis: 'Fictional figures', x: { kind: 'category', label: 'Day' }, y: { format: 'money', currency: 'AUD', label: 'Cost' }, series: [{ name: 'Hours', points: [{ x: 'Mon', y: 3 }, { x: 'Fri', y: 2 }] }] } satisfies ObjectData['plot'];
const sheet = { columns: [{ label: 'Day', kind: 'text' }, { label: 'Focus', kind: 'number' }], rows: [{ cells: ['Mon', '3'] }, { cells: ['Fri', '9'] }] } satisfies ObjectData['sheet'];
function batch(board: Board, commands: unknown[]) {
  const result = applyBatch(board, { commands });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result.board;
}
function fixture() {
  return batch(emptyBoard('evidence'), [
    { op: 'create', newId: 'sheet001', type: 'object', kind: 'sheet', data: sheet },
    { op: 'create', newId: 'plot0001', type: 'object', kind: 'plot', data: { ...plot, source: { cardId: 'sheet001', xColumn: 0, yColumns: [1] } } },
    { op: 'create', newId: 'deck0001', type: 'deck', props: { slides: [{ id: 'chart', layout: 'chart', chart: { sourceId: 'plot0001', values: [3, 2] } }] } },
  ]);
}
test('latest live data survives edit and deletion in one atomic batch, save/reload and plot deletion', () => {
  const original = fixture(), before = JSON.stringify(original);
  const removed = batch(original, [
    { op: 'object_set', id: 'sheet001', path: ['rows', 1, 'cells', 1], value: '12' },
    { op: 'delete', id: 'sheet001' },
  ]);
  assert.equal(JSON.stringify(original), before, 'snapshot saving never mutates the input');
  const saved = decodeStoredBoard(JSON.parse(JSON.stringify(removed)));
  const card = required(saved.cards.find(card => card.id === 'plot0001'));
  assert.equal(card.kind, 'plot');
  const resolved = resolvePlot(card.data, saved.cards);
  assert.equal(required(required(resolved.series[0]).points[1]).y, 12);
  assert.equal(resolved.sourceStatus, SNAPSHOT_STATUS);
  assert.equal(required(required(card.data.series[0]).points[1]).y, 2, 'the untrusted original fallback remains identifiable');
  assert.equal(cardSummary(card, saved.cards).sourceStatus, SNAPSHOT_STATUS);
  const deletedPlot = batch(saved, [{ op: 'delete', id: 'plot0001' }]);
  const chart = required(required(required(required(deletedPlot.cards[0]).props).slides)[0]).chart;
  assert.equal(required(required(required(resolveDeckChart(required(chart), deletedPlot.cards).spec).series[0]).points[1]).y, 12);
  assert.equal(resolveDeckChart(required(chart), deletedPlot.cards).sourceStatus, SNAPSHOT_STATUS);
});
test('restoring a source resumes live resolution and replacing a binding cannot borrow an old snapshot', () => {
  const board = fixture(), card = required(board.cards.find(card => card.kind === 'plot'));
  assert.equal(card.kind, 'plot');
  const data = card.data;
  assert.equal(resolvePlot(data, []).sourceStatus, SNAPSHOT_STATUS);
  assert.equal(resolvePlot({ ...data, source: { ...required(data.source), cardId: 'other001' } }, []).sourceStatus, MISSING_STATUS);
  assert.deepEqual(resolvePlot({ ...data, source: { ...required(data.source), cardId: 'other001' } }, []).series, []);
  const restored = resolvePlot(data, [{ id: CardIdSchema.parse('sheet001'), type: 'object', kind: 'sheet', data: { ...sheet, rows: [{ cells: ['Mon', '5'] }, { cells: ['Fri', '15'] }] } }]);
  assert.equal(restored.sourceStatus, ''); assert.equal(required(required(restored.series[0]).points[1]).y, 15);
  const broken = resolvePlot(data, [{ id: CardIdSchema.parse('sheet001'), type: 'object', kind: 'sheet', data: { columns: sheet.columns.slice(0, 1), rows: [] } }]);
  assert.equal(broken.sourceStatus, SNAPSHOT_STATUS);
});
test('chart models preserve comparison series, typed axes, composition, ranges and gaps', () => {
  for (const style of ['line', 'donut', 'bar_horizontal', 'area_stacked', 'range'] as const) {
    const data = { ...plot, style, smooth: true, series: [...plot.series, { name: 'Support', points: [{ x: 'Mon', y: null }, { x: 'Fri', y: 130, y2: 150 }] }] };
    const { spec } = plotToDeckChart(data);
    assert.deepEqual(spec.series, data.series); assert.deepEqual(spec.x, data.x); assert.deepEqual(spec.y, data.y);
    assert.equal(spec.smooth, true); assert.equal(spec.values, false);
    assert.equal(spec.kind, style === 'bar_horizontal' ? 'bars' : style === 'area_stacked' ? 'area' : style);
  }
  assert.equal(resolveDeckChart({ sourceId: CardIdSchema.parse('lost'), values: [9, 2] }, []).sourceStatus, MISSING_STATUS);
  assert.equal(resolveDeckChart({ sourceId: CardIdSchema.parse('other'), snapshotSourceId: CardIdSchema.parse('lost'), spec: plotToDeckChart(plot).spec }, []).spec, undefined);
});
test('snapshots retain all 200 sheet rows and survive normal plot edits and failed batches', () => {
  let board = fixture();
  const rows = Array.from({ length: 200 }, (_, i) => ({ cells: [String(i), String(i)] }));
  board = batch(board, [{ op: 'object_set', id: 'sheet001', path: ['rows'], value: rows }]);
  board = batch(board, [{ op: 'object_set', id: 'plot0001', path: ['smooth'], value: true }, { op: 'delete', id: 'sheet001' }]);
  const card = required(board.cards[0]);
  assert.equal(card.kind, 'plot');
  assert.equal(required(required(card.data.snapshot).series[0]).points.length, 200);
  assert.equal(required(required(resolvePlot(card.data).series[0]).points.at(-1)).y, 199);
  const failed = applyBatch(board, { commands: [{ op: 'delete', id: 'missing' }] });
  assert.equal(failed.ok, false); assert.deepEqual(failed.board, board);
});
