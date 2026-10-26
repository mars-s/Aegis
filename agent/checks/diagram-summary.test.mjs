import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramLayout } from '../../app/src/features/overview/summary.js';

test('a shuffled four-step chain folds into two readable rows and retains all real edges', () => {
  const nodes = ['Decide', 'Collect', 'Share', 'Try it'].map(name => ({ id: name, name }));
  const edges = [['Collect', 'Try it'], ['Try it', 'Decide'], ['Decide', 'Share']].map(([from, to]) => ({ from, to }));
  const layout = diagramLayout({ nodes, edges }, 180, 52);
  assert.ok(layout); assert.deepEqual(layout.edges.map(edge => [edge.from, edge.to]), [[1, 3], [3, 0], [0, 2]]);
  assert.equal(new Set(layout.nodes.map(node => node.y)).size, 2);
  assert.ok(layout.nodes.every(node => node.x >= 0 && node.x + node.w <= 180 && node.y + 20 <= 52));
  assert.equal(diagramLayout({ nodes, edges: [...edges, { from: 'Share', to: 'Collect' }] }, 180), null);
  assert.equal(diagramLayout({ nodes, edges }, 30), null);
});
