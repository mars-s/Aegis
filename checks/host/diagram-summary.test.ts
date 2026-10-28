import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramSummary } from './adapters/summary.ts';

test('domain diagram summaries retain shuffled nodes and real edges for agents and Library', () => {
  const nodes = ['Decide', 'Collect', 'Share', 'Try it'].map(name => ({ id: name, name }));
  const edges = ([['Collect', 'Try it'], ['Try it', 'Decide'], ['Decide', 'Share']] as const).map(([from, to]) => ({ from, to }));
  const summary = diagramSummary({ type: 'object', kind: 'diagram', data: { nodes, edges }, props: {} });
  assert.deepEqual(summary.preview.nodes, nodes);
  assert.deepEqual(summary.preview.edges, edges);
});
