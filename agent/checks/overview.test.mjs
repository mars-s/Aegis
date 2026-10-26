import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardClusters } from '../../app/src/features/overview/clusters.js';
import { boardSubtitle } from '../../app/src/lib/board/summary.js';
const card = (id, type, text, x, props = {}) => ({ id, type, text, x, y: 0, w: 100, h: 80, props });

test('named headings collect nearby work and count windows, excluding the headings', () => {
  const board = { name: 'Research', cards: [card('a', 'title', 'Discover', 0), card('b', 'doc', 'Interviews', 20), card('c', 'title', 'Decide', 1500), card('d', 'dataset', 'Results', 1520)] };
  const clusters = boardClusters(board);
  assert.deepEqual(clusters.map(c => [c.name, c.count, c.ids]), [['Discover', 1, ['a', 'b']], ['Decide', 1, ['c', 'd']]]);
});

test('nested collections frame their descendants and hidden groups stay absent', () => {
  const board = { name: 'Studio', cards: [
    card('root', 'coll', 'Launch plan', 0, { kids: ['nested'] }),
    { ...card('nested', 'coll', 'This week', 20, { kids: ['doc'] }), parent: 'root' },
    card('doc', 'doc', 'Proposal', 40),
    card('hidden', 'coll', 'Private', 1500, { hidden: true, kids: ['secret'] }),
    card('secret', 'doc', 'Hidden work', 1600),
  ] };
  const clusters = boardClusters(board);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters[0].ids, ['root', 'nested', 'doc']); assert.equal(clusters[0].count, 1);
  assert.deepEqual(clusters[1].ids, ['nested', 'doc']); assert.equal(clusters[1].count, 1);
});

test('an ungrouped board retains its name and a heading or document supplies its content cue', () => {
  const board = { name: 'Weekly plan', cards: [card('doc', 'doc', 'A calmer week', 0)] };
  assert.equal(boardClusters(board)[0].name, 'Weekly plan'); assert.equal(boardClusters(board)[0].count, 1);
  assert.equal(boardSubtitle(board), 'A calmer week');
  board.cards.push(card('title', 'title', '## Make time to think', 0));
  assert.equal(boardSubtitle(board), 'Make time to think');
  assert.equal(boardSubtitle({ cards: [] }), 'An empty board, ready for an idea.');
});
