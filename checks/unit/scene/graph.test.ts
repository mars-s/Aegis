import { describe, expect, test } from 'vitest';
import { CardSchema, LinkSchema } from '@aegis/domain/schema';
import { SceneGraph } from '../../../packages/scene/src/graph.js';
import { board, card, delta } from './fixtures.js';

describe('scene R-trees', () => {
  test('matches brute force for seeded queries including rotated cards', () => {
    let seed = 92345;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const cards = Array.from({ length: 1000 }, (_, i) => CardSchema.parse({ ...card(`c${i}`, random() * 10000 - 5000, random() * 10000 - 5000), rot: random() * 360 }));
    const graph = new SceneGraph(board(cards));
    for (let i = 0; i < 100; i++) {
      const x = random() * 10000 - 5000, y = random() * 10000 - 5000;
      const query = { minX: x, minY: y, maxX: x + 1000, maxY: y + 700 };
      const brute = graph.all().filter(node => node.bounds.minX <= query.maxX && node.bounds.maxX >= query.minX && node.bounds.minY <= query.maxY && node.bounds.maxY >= query.minY).map(node => node.card.id);
      expect(graph.query(query).map(node => node.card.id)).toEqual(brute);
    }
  });

  test('indexes crossing curves when both endpoints are outside the query', () => {
    const a = card('a', -1000, 300), b = card('b', 2000, 300);
    const source = board([a, b]); source.links.push(LinkSchema.parse({ id: 'crossing', a: a.id, b: b.id, bend: 500, label: 'Across' }));
    const graph = new SceneGraph(source), query = { minX: 0, minY: 0, maxX: 1440, maxY: 900 };
    expect(graph.query(query)).toHaveLength(0);
    expect(graph.queryLinks(query).map(entry => entry.link.id)).toEqual(['crossing']);
    graph.apply(delta([CardSchema.parse({ ...b, x: 10000, y: 10000 })]));
    expect(graph.links.get(source.links[0]?.id ?? LinkSchema.parse({ id: 'missing', a: a.id, b: b.id }).id)?.route.p2.x).toBeGreaterThan(9000);
    graph.apply(delta([], [a.id]));
    expect(graph.queryLinks(query)).toHaveLength(0);
  });

  test('updates inherited flags for parent and collection membership without stale indexes', () => {
    const parent = CardSchema.parse({ ...card('parent'), type: 'coll', props: { hidden: true, locked: true, kids: ['child'] } });
    const child = card('child');
    const graph = new SceneGraph(board([parent, child]));
    expect(graph.nodes.get(child.id)?.hidden).toBe(true);
    expect(graph.nodes.get(child.id)?.locked).toBe(true);
    graph.apply(delta([CardSchema.parse({ ...parent, props: { kids: [] } })]));
    expect(graph.nodes.get(child.id)?.hidden).toBe(false);
    expect(graph.nodes.get(child.id)?.locked).toBe(false);
    graph.apply(delta([CardSchema.parse({ ...parent, props: {}, parent: child.id }), CardSchema.parse({ ...child, parent: parent.id })]));
    expect(graph.all()).toHaveLength(2);
  });

  test('moves index entries and changes paint order without mutating canonical cards', () => {
    const a = card('a'), b = card('b');
    const graph = new SceneGraph(board([a, b]));
    graph.apply({ ...delta([CardSchema.parse({ ...a, x: 5000 })]), order: [b.id, a.id] });
    expect(a.x).toBe(0);
    expect(graph.query({ minX: 0, minY: 0, maxX: 500, maxY: 500 }).map(node => node.card.id)).toEqual([b.id]);
    expect(graph.all().map(node => node.card.id)).toEqual([b.id, a.id]);
  });
});
